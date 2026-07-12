/**
 * Derived operational views — all modules consume the same upstream inputs.
 */

import { computeSatelliteAnalysis, type UnitScanSnapshot } from "@/lib/engagementEngine";
import { hasIntRepositoryContent } from "@/lib/intelAnalysisData";
import { buildIntelActiveMonitoringRows } from "@/lib/intelLiveBridge";
import { canUnitScanSatellite } from "@/lib/intelIntegrity";
import {
  buildLiveEngagementFleetModel,
  countServiceableChainCapacity,
  type UnitCapability,
} from "@/lib/liveEngagementModel";
import { unitDisplayFromRecord } from "@/lib/unitDisplay";
import { resolveIntUnitSlug } from "@/lib/operationalSync";
import {
  getAllocationsForUnit,
  allocationSlotForUnit,
  unitCodeToSlot,
  type UnitSlot,
} from "@/lib/priorityAllocation";
import { mergeRegionsWithOverlay } from "@/lib/satelliteCatalog";
import {
  getUnitScanHistory,
  syncScanHistoryFromActiveSatellites,
} from "@/lib/scanHistoryStore";
import { countVisibleSatellitesForUnit, normalizeSatelliteName } from "@/lib/visibilityMatrix";

export type UnitOperationalState = {
  unitDbId: string;
  unitCode: string;
  unitLabel: string;
  unitLocation: string;
  intUnitSlug: UnitSlot | null;
  /** Slot used by Priority & Allocation storage (may differ from intUnitSlug). */
  prioritySlot: UnitSlot | null;
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
  dbUnits: { id: string; code: string; name: string; description?: string | null }[];
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
    const intSlug = (resolveIntUnitSlug(unit.id, unit.code) ?? null) as UnitSlot | null;
    const prioritySlot = allocationSlotForUnit(unit) as UnitSlot;

    const capability =
      fleetModel.get(unit.id) ?? {
        activeChains: 0,
        snapshot: {} as UnitScanSnapshot,
        assignments: [],
      };

    const visibleSatellites = intSlug
      ? countVisibleSatellitesForUnit(intSlug, regions)
      : 0;

    const allocations = getAllocationsForUnit(prioritySlot);
    const allocatedSatellites = allocations.length;

    const display = unitDisplayFromRecord(unit);

    return {
      unitDbId: unit.id,
      unitCode: unit.code,
      unitLabel: display.name,
      unitLocation: display.location,
      intUnitSlug: intSlug,
      prioritySlot,
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

/** Map INT / capability assignment analysis → Active Satellite Monitoring row. */
function assignmentToActivitySatRow(a: {
  name: string;
  analysis: {
    polarization: string;
    scanned: number;
    analyzed: number;
  };
  productiveCount?: number;
  nonProductiveCount?: number;
}): UnitActivitySatRow {
  const analysis = a.analysis;
  const pol = analysis.polarization !== "—" ? analysis.polarization : "KU-HH";
  const band = pol.startsWith("C")
    ? "C-band"
    : pol.startsWith("KA")
      ? "KA band"
      : pol.startsWith("KU")
        ? "KU band"
        : "Extended C-band";
  const productive = a.productiveCount ?? Math.floor(analysis.analyzed * 0.7);
  const nonProductive = a.nonProductiveCount ?? Math.max(0, analysis.analyzed - productive);

  return {
    satellite: a.name,
    band,
    pol,
    scanned: analysis.scanned,
    analyzed: analysis.analyzed,
    productive,
    nonProductive,
  };
}

/** Control Center + dashboard activity — INT Repository SSOT for active satellites. */
export function buildUnitActivityFromState(
  state: UnitOperationalState,
  engagements: any[],
  intelRows: any[],
  equipment: any[] = [],
): { activeSats: UnitActivitySatRow[]; history: UnitActivityHistoryRow[] } {
  let activeSats: UnitActivitySatRow[] = [];

  if (state.intUnitSlug && hasIntRepositoryContent(state.intUnitSlug, state.unitCode)) {
    const intelAssignments = buildIntelActiveMonitoringRows(
      state.intUnitSlug,
      state.unitDbId,
      engagements,
      equipment,
      intelRows,
      state.unitCode,
    );
    activeSats = intelAssignments.map(assignmentToActivitySatRow);
  }

  const history: UnitActivityHistoryRow[] =
    state.intUnitSlug && hasIntRepositoryContent(state.intUnitSlug, state.unitCode)
      ? (() => {
          const seededHistory = getUnitScanHistory(state.unitDbId);
          const activeSatNames = activeSats.map((s) => s.satellite);
          if (seededHistory.length > 0) {
            return syncScanHistoryFromActiveSatellites(state.unitDbId, activeSatNames).map((h) => ({
              satellite: h.satellite,
              time: h.time,
              outcome: h.outcome,
            }));
          }
          const completed = engagements
            .filter((e) => e.unit_id === state.unitDbId && e.status === "Completed")
            .slice(0, 5);
          return completed.map((e) => {
          const name = (e.satellites?.name as string | undefined) ?? "Unknown";
          const analysis = computeSatelliteAnalysis(e, intelRows);
          const ratio = analysis.scanned > 0 ? analysis.analyzed / analysis.scanned : 0;
          const outcome: UnitActivityHistoryRow["outcome"] =
            ratio >= 0.85 ? "productive" : ratio >= 0.5 ? "mixed" : "non-productive";
          const ts = e.observation_start ?? e.updated_at ?? "";
          let time = "—";
          if (ts) {
            try {
              time = new Date(ts).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              });
            } catch {
              /* keep default */
            }
          }
          return { satellite: name, time, outcome };
        });
        })()
      : [];

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
  status: "OPTIMIZED" | "SUBOPTIMAL" | "MISALLOCATED" | "NOT_ALLOTTED";
  satelliteLoad: number;
  maxCapacity: number;
  /** False when INT Repository shows no active satellite monitoring. */
  monitoringActive: boolean;
  resource: OptFactorEntry;
  priority: OptFactorEntry;
  serviceability: OptFactorEntry;
};

/** Dashboard-only inputs — INT gating + cross-module factor scores. */
export type UnitOptimizationInput = {
  isMonitoring: boolean;
  /** Satellites with scan data in INT Repository (current monitoring). */
  monitoredSatelliteNames: string[];
  /** Union of active INT satellites + recent scan history (last 5). */
  recentScanSatelliteNames: string[];
  /** Resource Inventory engagement % (0 when not monitoring). */
  resourceEngagementPct: number;
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

/** P1=10, P2=7, P3=4 — P3 always contributes; score is zero only when not monitoring. */
const PRIORITY_TIER_POINTS: Record<1 | 2 | 3, number> = { 1: 10, 2: 7, 3: 4 };

function allocationTier(
  satelliteName: string,
  allocations: ReturnType<typeof getAllocationsForUnit>,
): 1 | 2 | 3 {
  const norm = normalizeSatelliteName(satelliteName);
  const row = allocations.find((a) => normalizeSatelliteName(a.satelliteName) === norm);
  if (!row) return 3;
  return Math.min(Math.max(Math.round(row.priority), 1), 3) as 1 | 2 | 3;
}

/** Best-case point total — fill `capacity` slots from P1 → P2 → P3 allocation pool. */
function idealPriorityPoints(
  allocations: ReturnType<typeof getAllocationsForUnit>,
  capacity: number,
): number {
  const byTier: Record<1 | 2 | 3, number[]> = { 1: [], 2: [], 3: [] };
  for (const row of allocations) {
    const tier = Math.min(Math.max(Math.round(row.priority), 1), 3) as 1 | 2 | 3;
    byTier[tier].push(PRIORITY_TIER_POINTS[tier]);
  }

  let points = 0;
  let filled = 0;
  for (const tier of [1, 2, 3] as const) {
    for (const pt of byTier[tier]) {
      if (filled >= capacity) return Math.max(points, PRIORITY_TIER_POINTS[3]);
      points += pt;
      filled++;
    }
  }
  return Math.max(points, PRIORITY_TIER_POINTS[3]);
}

/** Actual points for INT-monitored satellites (cap at capacity, keep highest-priority slots). */
function actualPriorityPoints(
  monitoredNames: string[],
  allocations: ReturnType<typeof getAllocationsForUnit>,
  capacity: number,
): number {
  const ranked = monitoredNames
    .map((name) => ({
      name,
      pts: PRIORITY_TIER_POINTS[allocationTier(name, allocations)],
    }))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, capacity);

  return ranked.reduce((sum, r) => sum + r.pts, 0);
}

/**
 * Prioritization score — Priority & Allocation vs INT monitoring, scaled by scan capacity.
 * Compares monitored satellite mix (P1/P2/P3 points) to the best achievable fill for that
 * unit's resource capacity. Non-zero whenever any satellite is monitored; zero only when idle.
 */
function computePriorityAlignmentScore(
  state: UnitOperationalState,
  monitoredNames: string[],
  scanCapacity: number,
): { score: number; issues: string[] } {
  if (monitoredNames.length === 0) {
    return { score: 0, issues: ["Not monitoring satellites"] };
  }

  const capacity = Math.max(
    1,
    scanCapacity,
    monitoredNames.length,
    state.capability.maxPossibleScans,
  );

  const intSlug = state.prioritySlot ?? state.intUnitSlug;
  const allocations = intSlug ? getAllocationsForUnit(intSlug) : [];

  const idealPoints =
    allocations.length > 0
      ? idealPriorityPoints(allocations, capacity)
      : capacity * PRIORITY_TIER_POINTS[1];

  const actualPoints = actualPriorityPoints(monitoredNames, allocations, capacity);

  let score = Math.round((actualPoints / idealPoints) * 100);
  score = Math.min(100, Math.max(1, score));

  const tierCounts = { p1: 0, p2: 0, p3: 0 };
  for (const name of monitoredNames) {
    const t = allocationTier(name, allocations);
    if (t === 1) tierCounts.p1++;
    else if (t === 2) tierCounts.p2++;
    else tierCounts.p3++;
  }

  return {
    score,
    issues: [
      `${monitoredNames.length} monitored · cap ${capacity} · P1 ${tierCounts.p1} P2 ${tierCounts.p2} P3 ${tierCounts.p3}`,
    ],
  };
}

/** Legacy prioritization — uses live engagement assignments (control-center fallback). */
function computePriorityAlignmentScoreLegacy(state: UnitOperationalState): {
  score: number;
  issues: string[];
} {
  const activeNames = state.capability.assignments.map((a) => a.name);
  const capacity = Math.max(state.capability.maxPossibleScans, activeNames.length, 1);
  return computePriorityAlignmentScore(state, activeNames, capacity);
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

  const actualEngagementUtil = chainUtil;

  let score: number;
  if (cap.feasibilityStatus === "NON_OPERATIONAL") {
    score = 15;
  } else if (cap.feasibilityStatus === "DEGRADED") {
    score = Math.round((actualEngagementUtil * 0.6 + equipmentUtil * 0.25 + antennaUtil * 0.15) * 0.75);
  } else {
    score = Math.round(actualEngagementUtil * 0.6 + equipmentUtil * 0.25 + antennaUtil * 0.15);
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
  input?: UnitOptimizationInput,
): UnitOptimizationData {
  const cap = state.capability;
  const maxCapacity = Math.max(cap.maxPossibleScans, 1);
  const satelliteLoad = cap.activeChains;

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

  const monitoringActive = input ? input.isMonitoring : cap.activeChains > 0;

  if (input && !input.isMonitoring) {
    return {
      unitDbId: state.unitDbId,
      unitLabel: state.unitLabel,
      compositeScore: 0,
      status: "MISALLOCATED",
      satelliteLoad,
      maxCapacity,
      monitoringActive: false,
      resource: optFactor(0, "critical", "Not monitoring satellites — no resource engagement"),
      priority: optFactor(0, "critical", "Not monitoring satellites — prioritization N/A"),
      serviceability: optFactor(
        serviceScore,
        severityFromScore(serviceScore),
        ...serviceIssues,
      ),
    };
  }

  let resourceScore: number;
  let resourceIssues: string[];
  if (input?.isMonitoring) {
    resourceScore = input.resourceEngagementPct;
    resourceIssues = [
      `Resource Inventory engagement ${resourceScore}% (INT-gated inventory rings)`,
    ];
    if (resourceScore < 40) {
      resourceIssues.push("Low inventory utilization despite active monitoring");
    }
  } else {
    const resource = computeResourceUtilizationScore(state, unitEquipment);
    resourceScore = resource.score;
    resourceIssues = resource.issues;
  }

  const priorityResult = input?.isMonitoring
    ? computePriorityAlignmentScore(
        state,
        input.monitoredSatelliteNames,
        Math.max(
          maxCapacity,
          chain.totalChains,
          input.monitoredSatelliteNames.length,
          1,
        ),
      )
    : computePriorityAlignmentScoreLegacy(state);

  const compositeScore = monitoringActive
    ? Math.round((resourceScore + priorityResult.score + serviceScore) / 3)
    : 0;
  const status: UnitOptimizationData["status"] = !monitoringActive
    ? "MISALLOCATED"
    : compositeScore >= 75
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
    monitoringActive,
    resource: optFactor(resourceScore, severityFromScore(resourceScore), ...resourceIssues),
    priority: optFactor(
      priorityResult.score,
      severityFromScore(priorityResult.score),
      ...priorityResult.issues,
    ),
    serviceability: optFactor(
      serviceScore,
      severityFromScore(serviceScore),
      ...serviceIssues,
    ),
  };
}

export { countServiceableChainCapacity, unitCodeToSlot };
