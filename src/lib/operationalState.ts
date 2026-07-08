/**
 * Derived operational views — all modules consume the same upstream inputs.
 */

import { computeSatelliteAnalysis, type UnitScanSnapshot } from "@/lib/engagementEngine";
import { canUnitScanSatellite } from "@/lib/intelIntegrity";
import {
  buildLiveEngagementFleetModel,
  countServiceableChainCapacity,
  type UnitCapability,
} from "@/lib/liveEngagementModel";
import { unitLabelFromCode } from "@/lib/operationalDataset";
import { resolveIntUnitSlug } from "@/lib/operationalSync";
import {
  getAllocationsForUnit,
  unitCodeToSlot,
  type UnitSlot,
} from "@/lib/priorityAllocation";
import { mergeRegionsWithOverlay } from "@/lib/satelliteCatalog";
import { countVisibleSatellitesForUnit, normalizeSatelliteName } from "@/lib/visibilityMatrix";

export type UnitOperationalState = {
  unitDbId: string;
  unitCode: string;
  unitLabel: string;
  intUnitSlug: UnitSlot | null;
  visibleSatellites: number;
  allocatedSatellites: number;
  activeSatellites: number;
  capability: UnitCapability;
  snapshot: UnitScanSnapshot;
};

export type OperationalFleetState = {
  units: UnitOperationalState[];
  byUnitId: Map<string, UnitOperationalState>;
  totalActiveScans: number;
};

export type UnitActivitySatRow = {
  satellite: string;
  band: string;
  pol: string;
  scanned: number;
  analyzed: number;
  productive: number;
  nonProductive: number;
};

export type UnitActivityHistoryRow = {
  satellite: string;
  time: string;
  outcome: "productive" | "mixed" | "non-productive";
};

export function buildOperationalFleetState(input: {
  dbUnits: { id: string; code: string; name?: string }[];
  equipment: any[];
  engagements: any[];
  intelRows: any[];
}): OperationalFleetState {
  const { dbUnits, equipment, engagements, intelRows } = input;

  const regions = mergeRegionsWithOverlay();

  // normalize engagements (safe)
  const normalizedEngagements = (engagements ?? []).map((e) => ({
    ...e,
    status: (e.status ?? "UNKNOWN").toString().trim(),
  }));

  // normalize equipment defensively (prevents TS + runtime issues)
  const normalizedEquipment = (equipment ?? []).map((e) => ({
    ...e,
    status: (e?.status ?? "UNKNOWN").toString().trim(),
  }));

  const fleetModel = buildLiveEngagementFleetModel({
    engagements: normalizedEngagements,
    equipment: normalizedEquipment,
    dbUnits,
    intelRows,
  });

  const units: UnitOperationalState[] = (dbUnits ?? []).map((unit) => {
    const intSlug = (resolveIntUnitSlug(unit.id, unit.code)?? null) as UnitSlot | null;

    const capability =
      fleetModel.get(unit.id) ?? {
        activeChains: 0,
        snapshot: {} as UnitScanSnapshot,
        assignments: [],
      };

    const visibleSatellites = intSlug
      ? countVisibleSatellitesForUnit(intSlug, regions)
      : 0;

    const allocations = intSlug ? getAllocationsForUnit(intSlug) : [];
    const allocatedSatellites = allocations.length;

    return {
      unitDbId: unit.id,
      unitCode: unit.code,
      unitLabel: unitLabelFromCode(unit.code),
      intUnitSlug: intSlug,
      visibleSatellites,
      allocatedSatellites,
      activeSatellites: capability?.activeChains ?? 0,
      capability: capability as UnitCapability,
      snapshot: (capability?.snapshot ?? {}) as UnitScanSnapshot,
    } as UnitOperationalState;
  });

  return {
    units,
    byUnitId: new Map(units.map((u) => [u.unitDbId, u])),
    totalActiveScans: units.reduce((s, u) => s + (u.activeSatellites ?? 0), 0),
  };
}

/** Control Center rows — exact same assignments + analysis as Live Engagement. */
export function buildUnitActivityFromState(
  state: UnitOperationalState,
  engagements: any[],
  intelRows: any[],
): { activeSats: UnitActivitySatRow[]; history: UnitActivityHistoryRow[] } {
  const activeSats: UnitActivitySatRow[] = state.capability.assignments.map((a) => {
    const analysis = a.analysis;
    const pol = analysis.polarization !== "—" ? analysis.polarization : "KU-HH";
    const band = pol.startsWith("C")
      ? "C-band"
      : pol.startsWith("KA")
        ? "KA band"
        : pol.startsWith("KU")
          ? "KU band"
          : "Extended C-band";
    const productive =
      a.productiveCount ?? Math.floor(analysis.analyzed * 0.7);
    const nonProductive =
      a.nonProductiveCount ?? Math.max(0, analysis.analyzed - productive);

    return {
      satellite: a.name,
      band,
      pol,
      scanned: analysis.scanned,
      analyzed: analysis.analyzed,
      productive,
      nonProductive,
    };
  });

  const completed = engagements
    .filter((e) => e.unit_id === state.unitDbId && e.status === "Completed")
    .slice(0, 5);

  const history: UnitActivityHistoryRow[] = completed.map((e) => {
    const name = (e.satellites?.name as string | undefined) ?? "Unknown";
    const analysis = computeSatelliteAnalysis(e, intelRows);
    const ratio = analysis.scanned > 0 ? analysis.analyzed / analysis.scanned : 0;
    const outcome: UnitActivityHistoryRow["outcome"] =
      ratio >= 0.85 ? "productive" : ratio >= 0.5 ? "mixed" : "non-productive";
    const ts = e.observation_start ?? e.updated_at ?? "";
    let time = "—";
    if (ts) {
      try {
        time = new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      } catch { /* keep default */ }
    }
    return { satellite: name, time, outcome };
  });

  return { activeSats, history };
}

export type OptFactorKey = "resource" | "priority" | "serviceability";

export type OptFactorEntry = {
  score: number;
  issues: string[];
  severity: "ok" | "warn" | "critical";
};

export type UnitOptimizationData = {
  unitDbId: string;
  unitLabel: string;
  compositeScore: number;
  status: "OPTIMIZED" | "SUBOPTIMAL" | "MISALLOCATED";
  satelliteLoad: number;
  maxCapacity: number;
  resource: OptFactorEntry;
  priority: OptFactorEntry;
  serviceability: OptFactorEntry;
};

function optFactor(
  score: number,
  severity: OptFactorEntry["severity"],
  ...issues: string[]
): OptFactorEntry {
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    severity,
    issues,
  };
}

function severityFromScore(score: number): OptFactorEntry["severity"] {
  if (score < 40) return "critical";
  if (score < 65) return "warn";
  return "ok";
}

/** P1=high, P2=medium, P3=low — weights for priority alignment scoring. */
const PRIORITY_TIER_WEIGHT: Record<number, number> = { 1: 100, 2: 65, 3: 35 };

/**
 * Prioritization score — Satellite Priority & Allocation SSOT.
 * Monitoring high-priority (P1) satellites raises the score;
 * monitoring mostly low-priority (P3) or missing P1 allocations lowers it.
 */
function computePriorityAlignmentScore(state: UnitOperationalState): {
  score: number;
  issues: string[];
} {
  const intSlug = state.intUnitSlug;
  if (!intSlug) {
    return { score: 45, issues: ["No priority allocation slot for this unit"] };
  }

  const allocations = getAllocationsForUnit(intSlug);
  if (allocations.length === 0) {
    return { score: 45, issues: ["No priority allocations configured for this unit"] };
  }

  const activeNames = new Set(
    state.capability.assignments.map((a) => normalizeSatelliteName(a.name)),
  );

  let activeWeighted = 0;
  let activeCount = 0;
  const unmonitoredP1: string[] = [];
  let p1Total = 0;
  let p3Active = 0;

  for (const row of allocations) {
    const tier = Math.min(Math.max(Math.round(row.priority), 1), 3);
    const norm = normalizeSatelliteName(row.satelliteName);
    const weight = PRIORITY_TIER_WEIGHT[tier] ?? 35;

    if (tier === 1) p1Total++;
    if (activeNames.has(norm)) {
      activeWeighted += weight;
      activeCount++;
      if (tier === 3) p3Active++;
    } else if (tier === 1) {
      unmonitoredP1.push(row.satelliteName);
    }
  }

  const coverageRatio =
    allocations.length > 0 ? activeNames.size / allocations.length : 0;
  const priorityQuality = activeCount > 0 ? activeWeighted / activeCount : 0;

  let score = Math.round(coverageRatio * 45 + (priorityQuality / 100) * 55);

  if (unmonitoredP1.length > 0) {
    score = Math.max(0, score - unmonitoredP1.length * 10);
  }
  if (activeCount > 0 && p3Active / activeCount > 0.6) {
    score = Math.max(0, score - 12);
  }

  const issues: string[] = [];
  if (unmonitoredP1.length > 0) {
    issues.push(
      `${unmonitoredP1.length} high-priority (P1) satellite(s) allocated but not actively monitored`,
    );
  }
  if (activeCount > 0 && p3Active / activeCount > 0.6) {
    issues.push("Majority of active scans are low-priority (P3) satellites");
  }
  if (activeCount === 0) {
    issues.push("No allocated satellites are actively being scanned");
  } else if (issues.length === 0) {
    const p1Monitored = allocations.filter(
      (r) =>
        Math.round(r.priority) === 1 &&
        activeNames.has(normalizeSatelliteName(r.satelliteName)),
    ).length;
    issues.push(
      `${activeCount} active · P1 monitored ${p1Monitored}/${p1Total} · ${allocations.length} allocated`,
    );
  }

  return { score, issues };
}

/**
 * Resource utilization score — Resource Inventory SSOT.
 * Antenna/receiver/SDR chain capacity and equipment loading.
 */
function computeResourceUtilizationScore(
  state: UnitOperationalState,
  unitEquipment: any[],
): { score: number; issues: string[] } {
  const cap = state.capability;
  const maxCapacity = Math.max(cap.maxPossibleScans, 1);
  const satelliteLoad = cap.activeChains;

  const chain = countServiceableChainCapacity(unitEquipment);
  const totalEq = unitEquipment.length;
  const operational = unitEquipment.filter(
    (e) => e.serviceability === "Operational",
  ).length;

  const antennas = unitEquipment.filter((e) =>
    (e.category?.name ?? "").toLowerCase().includes("antenna"),
  );
  const operationalAntennas = antennas.filter(
    (e) => e.serviceability === "Operational",
  ).length;

  const chainUtil =
    maxCapacity > 0 ? Math.min(100, (satelliteLoad / maxCapacity) * 100) : 0;
  const equipmentUtil = totalEq > 0 ? (operational / totalEq) * 100 : 50;
  const antennaUtil =
    antennas.length > 0 ? (operationalAntennas / antennas.length) * 100 : equipmentUtil;

  let score: number;
  if (cap.feasibilityStatus === "NON_OPERATIONAL") {
    score = 15;
  } else if (cap.feasibilityStatus === "DEGRADED") {
    score = Math.round((chainUtil * 0.5 + equipmentUtil * 0.3 + antennaUtil * 0.2) * 0.75);
  } else {
    score = Math.round(chainUtil * 0.5 + equipmentUtil * 0.3 + antennaUtil * 0.2);
  }

  const issues: string[] = [];
  if (cap.feasibilityStatus === "NON_OPERATIONAL") {
    issues.push("Unit non-operational — no active scanning capacity");
  } else {
    issues.push(
      `${operationalAntennas}/${antennas.length} antennas · ${chain.totalChains} chain(s) · ${satelliteLoad}/${maxCapacity} scan slots`,
    );
    if (satelliteLoad > maxCapacity) {
      issues.push(`Overloaded — ${satelliteLoad - maxCapacity} scans above capacity`);
    }
  }

  return { score, issues };
}

/** Optimization score from live operational state — Resource, Prioritization, Serviceability. */
export function buildUnitOptimizationData(
  state: UnitOperationalState,
  unitEquipment: any[],
): UnitOptimizationData {
  const cap = state.capability;
  const maxCapacity = Math.max(cap.maxPossibleScans, 1);
  const satelliteLoad = cap.activeChains;

  const { score: resourceScore, issues: resourceIssues } =
    computeResourceUtilizationScore(state, unitEquipment);

  const { score: priorityScore, issues: priorityIssues } =
    computePriorityAlignmentScore(state);

  const chain = countServiceableChainCapacity(unitEquipment);
  const totalEq = unitEquipment.length;
  const operational = unitEquipment.filter(
    (e) => e.serviceability === "Operational",
  ).length;
  let serviceScore = totalEq === 0 ? 50 : Math.round((operational / totalEq) * 100);
  if (chain.totalChains === 0 && totalEq > 0) {
    serviceScore = Math.min(serviceScore, 25);
  }
  const serviceIssues: string[] = [];
  if (chain.totalChains === 0 && totalEq > 0) {
    serviceIssues.push("No complete operational receive chain available");
  }
  const nonOp = unitEquipment.filter((e) => e.serviceability !== "Operational");
  if (nonOp.length > 0) {
    serviceIssues.push(`${nonOp.length} component(s) not fully operational`);
  }
  if (serviceIssues.length === 0) {
    serviceIssues.push(
      `${operational}/${totalEq} equipment operational — ${chain.totalChains} chain(s) available`,
    );
  }

  const compositeScore = Math.round(
    (resourceScore + priorityScore + serviceScore) / 3,
  );
  const status: UnitOptimizationData["status"] =
    compositeScore >= 75
      ? "OPTIMIZED"
      : compositeScore >= 50
        ? "SUBOPTIMAL"
        : "MISALLOCATED";

  return {
    unitDbId: state.unitDbId,
    unitLabel: state.unitLabel,
    compositeScore,
    status,
    satelliteLoad,
    maxCapacity,
    resource: optFactor(resourceScore, severityFromScore(resourceScore), ...resourceIssues),
    priority: optFactor(priorityScore, severityFromScore(priorityScore), ...priorityIssues),
    serviceability: optFactor(
      serviceScore,
      severityFromScore(serviceScore),
      ...serviceIssues,
    ),
  };
}

export { countServiceableChainCapacity, unitCodeToSlot };
