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
import { countVisibleSatellitesForUnit } from "@/lib/visibilityMatrix";

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

/** Optimization score from live operational state — Resource, Prioritization, Serviceability. */
export function buildUnitOptimizationData(
  state: UnitOperationalState,
  unitEquipment: any[],
): UnitOptimizationData {
  const cap = state.capability;
  const maxCapacity = Math.max(cap.maxPossibleScans, 1);
  const satelliteLoad = cap.activeChains;

  const resourceScore =
    cap.feasibilityStatus === "NON_OPERATIONAL"
      ? 15
      : cap.feasibilityStatus === "DEGRADED"
        ? Math.round(cap.occupancyPct * 0.75)
        : cap.occupancyPct;
  const resourceIssues: string[] = [];
  if (cap.feasibilityStatus === "NON_OPERATIONAL") {
    resourceIssues.push("Unit non-operational — no active scanning capacity");
  } else if (satelliteLoad > maxCapacity) {
    resourceIssues.push(
      `${satelliteLoad} active scans vs ${maxCapacity} optimal capacity — overloaded`,
    );
  } else {
    resourceIssues.push(
      `${satelliteLoad}/${maxCapacity} capacity utilized (${cap.occupancyPct}% occupancy)`,
    );
  }

  let priorityScore = 70;
  const priorityIssues: string[] = [];
  if (state.visibleSatellites > 0 && state.allocatedSatellites > 0) {
    const coverageRatio =
      Math.min(state.allocatedSatellites, state.visibleSatellites) /
      state.visibleSatellites;
    const activeRatio =
      state.allocatedSatellites > 0
        ? Math.min(state.activeSatellites, state.allocatedSatellites) /
          state.allocatedSatellites
        : 0;
    priorityScore = Math.round((coverageRatio * 0.5 + activeRatio * 0.5) * 100);
    if (state.activeSatellites < state.allocatedSatellites) {
      priorityIssues.push(
        `${state.allocatedSatellites - state.activeSatellites} allocated satellites not actively scanned`,
      );
    }
    if (state.allocatedSatellites < state.visibleSatellites * 0.5) {
      priorityIssues.push("Less than half of visible satellites are priority-allocated");
    }
    if (priorityIssues.length === 0) {
      priorityIssues.push(
        `${state.activeSatellites} active of ${state.allocatedSatellites} allocated (${state.visibleSatellites} visible)`,
      );
    }
  } else if (state.allocatedSatellites === 0) {
    priorityScore = 45;
    priorityIssues.push("No priority allocations configured for this unit");
  } else {
    priorityIssues.push("Priority alignment within acceptable range");
  }

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
