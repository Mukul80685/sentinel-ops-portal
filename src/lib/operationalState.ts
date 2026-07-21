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
import { countVisibleSatellitesForUnit, canonicalSatelliteKey, normalizeSatelliteName } from "@/lib/visibilityMatrix";

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
  /** Resource Engagement Status ring average (same formula as unit detail circles). */
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

function satelliteNamesMatch(a: string, b: string): boolean {
  return (
    normalizeSatelliteName(a) === normalizeSatelliteName(b) ||
    canonicalSatelliteKey(a) === canonicalSatelliteKey(b)
  );
}

function allocationTier(
  satelliteName: string,
  allocations: ReturnType<typeof getAllocationsForUnit>,
): 1 | 2 | 3 {
  const row = allocations.find((a) => satelliteNamesMatch(a.satelliteName, satelliteName));
  if (!row) return 3;
  return tierFromPriority(row.priority);
}

/** Best-case point total — fill `capacity` slots from P1 → P2 → P3 allocation pool. */
function tierFromPriority(priority: number): 1 | 2 | 3 {
  return Math.min(Math.max(Math.round(priority), 1), 3) as 1 | 2 | 3;
}

/**
 * Prioritization score — Priority & Allocation tiers for INT-monitored satellites only,
 * scaled by Resource Inventory chain capacity.
 */
function computePriorityAlignmentScore(
  state: UnitOperationalState,
  monitoredNames: string[],
  unitEquipment: any[],
): { score: number; issues: string[] } {
  if (monitoredNames.length === 0) {
    return { score: 0, issues: ["Not monitoring satellites"] };
  }

  const slot = state.prioritySlot;
  const allocations = slot ? getAllocationsForUnit(slot) : [];

  const chain = unitEquipment.length > 0
    ? countServiceableChainCapacity(unitEquipment)
    : { totalChains: state.capability.maxPossibleScans };
  const capacity = Math.max(1, chain.totalChains, state.capability.maxPossibleScans);

  const monitoredCount = monitoredNames.length;
  const allocatedCount = allocations.length;

  // Factor 1 — Priority Quality (60%): how high-priority are the monitored satellites?
  const monitoredWeight = monitoredNames.reduce(
    (sum, name) => sum + PRIORITY_TIER_POINTS[allocationTier(name, allocations)],
    0,
  );
  const maxMonitoredWeight = monitoredCount * PRIORITY_TIER_POINTS[1];
  const monitoredQualityPct = maxMonitoredWeight > 0
    ? Math.min(100, (monitoredWeight / maxMonitoredWeight) * 100)
    : 0;

  // Factor 2 — Capacity Utilisation (25%): is the unit using its capacity relative to allocation?
  // effectiveTarget = min(allocatedCount, capacity) — unit not penalised for low geographic allocation
  const effectiveTarget = allocatedCount > 0
    ? Math.min(allocatedCount, capacity)
    : capacity;
  const capabilityLoadPct = Math.min(100, (monitoredCount / Math.max(1, effectiveTarget)) * 100);

  // Factor 3 — Allocation Fulfilment (15%): are monitored satellites matched in Priority & Allocation?
  const matchedCount = monitoredNames.filter((name) =>
    allocations.some((a) => satelliteNamesMatch(a.satelliteName, name)),
  ).length;
  const fulfilmentPct = monitoredCount > 0
    ? Math.min(100, (matchedCount / monitoredCount) * 100)
    : 0;

  const score = Math.min(100, Math.max(1, Math.round(
    monitoredQualityPct * 0.60 +
    capabilityLoadPct * 0.25 +
    fulfilmentPct * 0.15,
  )));

  const tierCounts = { p1: 0, p2: 0, p3: 0, unallocated: 0 };
  for (const name of monitoredNames) {
    const t = allocationTier(name, allocations);
    if (t === 1) tierCounts.p1++;
    else if (t === 2) tierCounts.p2++;
    else if (t === 3) tierCounts.p3++;
    else tierCounts.unallocated++;
  }

  const issues = [
    `${monitoredCount} monitored / ${allocatedCount || "—"} allocated · cap ${capacity} · P1 ${tierCounts.p1} P2 ${tierCounts.p2} P3 ${tierCounts.p3}`,
    `Quality ${Math.round(monitoredQualityPct)}% · Load ${Math.round(capabilityLoadPct)}% · Fulfilment ${Math.round(fulfilmentPct)}%`,
  ];
  if (tierCounts.unallocated > 0) {
    issues.push(`${tierCounts.unallocated} monitored satellite(s) not found in Priority & Allocation`);
  }
  if (monitoredCount < effectiveTarget) {
    issues.push(`Scanning ${monitoredCount} of ${effectiveTarget} effective target — capacity underutilised`);
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
  let serviceScore = totalEq === 0 ? 0 : Math.round((operational / totalEq) * 100);
  // Cap to 25 when equipment exists but no complete receive chain is available — partial serviceability penalty
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

  const resourceScore: number = input?.resourceEngagementPct ?? 0;
  const resourceIssues: string[] = [
    `Resource engagement ${resourceScore}% across all equipment categories`,
  ];
  if (resourceScore === 0 && input?.isMonitoring) {
    resourceIssues.push("No resources assigned in Engaged Resources table despite active monitoring");
  } else if (resourceScore < 40 && input?.isMonitoring) {
    resourceIssues.push("Low resource engagement — fewer than 40% of serviceable resources assigned");
  } else if (!input?.isMonitoring) {
    resourceIssues.push("Unit not monitoring satellites — resource engagement not applicable");
  }

  const priorityResult = computePriorityAlignmentScore(
    state,
    input?.monitoredSatelliteNames ?? [],
    unitEquipment,
  );

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
