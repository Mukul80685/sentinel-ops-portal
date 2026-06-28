/**
 * Live Engagement Status — pure derived, constraint-validated aggregation layer.
 * Single pipeline: inventory + INT + allocations + visibility → UnitCapability.
 */

import {
  CHAIN_CATEGORIES,
  computeSatelliteAnalysis,
  isActiveScanStatus,
  scanStatusLabel,
  type SatelliteAnalysis,
  type UnitScanSnapshot,
} from "@/lib/engagementEngine";
import { canUnitScanSatellite } from "@/lib/intelIntegrity";
import { isSatelliteInIntRoster } from "@/lib/intelAnalysisData";
import {
  isIntGenerationComplete,
  isIntGenerationInProgress,
  resolveIntUnitSlug,
  shouldShowOnLiveEngagement,
} from "@/lib/operationalSync";

export type FeasibilityStatus = "VALID" | "DEGRADED" | "NON_OPERATIONAL";

export type StageAvailability = {
  antennas: number;
  lnbs: number;
  demodulators: number;
  processors: number;
};

export type ValidatedSatelliteAssignment = {
  engagementId: string;
  name: string;
  status: string;
  displayStatus: string;
  engagement: any;
  analysis: SatelliteAnalysis;
};

export type UnitCapability = {
  unitId: string;
  intUnitSlug: string | null;
  feasibilityStatus: FeasibilityStatus;
  constraintViolations: string[];
  totalChains: number;
  maxPossibleScans: number;
  activeChains: number;
  occupancyPct: number;
  availableByStage: StageAvailability;
  assignments: ValidatedSatelliteAssignment[];
  /** Tile summary — same data as assignments, no separate logic. */
  snapshot: UnitScanSnapshot;
};

export type LiveEngagementInputs = {
  engagements: any[];
  equipment: any[];
  dbUnits: { id: string; code: string; name?: string }[];
  intelRows: any[];
};

/** Per-satellite analysis — uses intel when present, otherwise deterministic mock (never zeroed). */
export function computeSatelliteAnalysisForEngagement(
  engagement: any,
  intelRows: any[],
): SatelliteAnalysis {
  return computeSatelliteAnalysis(engagement, intelRows);
}

function equipmentByIdMap(equipment: any[]): Map<string, any> {
  return new Map(equipment.map((e) => [e.id as string, e]));
}

/** Count operational (serviceable) components per mandatory chain stage. */
export function countServiceableChainCapacity(equipment: any[]): StageAvailability & { totalChains: number } {
  const claimed = new Set<string>();
  const stageCounts: number[] = [];

  for (const { match } of CHAIN_CATEGORIES) {
    const catEq = equipment.filter((e: any) => {
      const name = (e.category?.name ?? "").toLowerCase();
      return name.includes(match) && !claimed.has(e.id);
    });
    catEq.forEach((e: any) => claimed.add(e.id));
    stageCounts.push(
      catEq.filter((e: any) => e.serviceability === "Operational").length,
    );
  }

  const [antennas = 0, lnbs = 0, demodulators = 0, processors = 0] = stageCounts;
  const totalChains =
    stageCounts.length === 0 ? 0 : Math.min(...stageCounts);

  return { antennas, lnbs, demodulators, processors, totalChains };
}

function engagementHasOperationalChain(
  eng: any,
  eqById: Map<string, any>,
): { valid: boolean; reason?: string } {
  const checks: { id: string | null | undefined; label: string }[] = [
    { id: eng.antenna_id, label: "Antenna" },
    { id: eng.demodulator_id, label: "Demodulator" },
    { id: eng.processing_server_id, label: "Processor" },
  ];

  for (const { id, label } of checks) {
    if (!id) return { valid: false, reason: `Missing ${label} allocation` };
    const eq = eqById.get(id);
    if (!eq) return { valid: false, reason: `${label} not found in inventory` };
    if (eq.serviceability !== "Operational") {
      return { valid: false, reason: `${label} is not serviceable` };
    }
  }

  return { valid: true };
}

function existsInIntOrActiveScan(
  eng: any,
  intUnitSlug: string | null,
  intelRows: any[],
): boolean {
  if (isActiveScanStatus(eng.status as string)) return true;

  const name = (eng.satellites?.name as string | undefined) ?? "";
  if (intUnitSlug && isSatelliteInIntRoster(intUnitSlug, name)) return true;

  const satId = eng.satellite_id as string | undefined;
  const unitId = eng.unit_id as string | undefined;
  if (satId && intelRows.some((r) => r.satellite_id === satId && r.unit_id === unitId)) {
    return true;
  }

  return false;
}

function passesVisibilityGate(
  satelliteName: string,
  intUnitSlug: string | null,
): boolean {
  if (!intUnitSlug) return false;
  return canUnitScanSatellite(satelliteName, intUnitSlug);
}

function engagementPriority(eng: any): number {
  if (eng.status === "In Progress") return 0;
  if (eng.status === "Paused") return 1;
  return 2;
}

function sortEngagementCandidates(engagements: any[]): any[] {
  return [...engagements].sort((a, b) => {
    const pa = engagementPriority(a);
    const pb = engagementPriority(b);
    if (pa !== pb) return pa - pb;
    const ta = a.observation_start ?? a.updated_at ?? "";
    const tb = b.observation_start ?? b.updated_at ?? "";
    return tb.localeCompare(ta);
  });
}

function toSnapshot(assignments: ValidatedSatelliteAssignment[]): UnitScanSnapshot {
  return {
    activeCount: assignments.length,
    satellites: assignments.map((a) => ({
      engagementId: a.engagementId,
      name: a.name,
      status: a.status,
      displayStatus: a.displayStatus,
    })),
  };
}

/**
 * Authoritative per-unit Live Engagement model — tiles and detail expand this object only.
 */
export function computeUnitCapability(
  unitDbId: string,
  unitCode: string | undefined,
  engagements: any[],
  equipment: any[],
  intelRows: any[],
): UnitCapability {
  const intUnitSlug = resolveIntUnitSlug(unitDbId, unitCode);
  const unitEq = equipment.filter((e: any) => e.unit_id === unitDbId);
  const eqById = equipmentByIdMap(unitEq);
  const capacity = countServiceableChainCapacity(unitEq);
  const violations: string[] = [];

  const empty: UnitCapability = {
    unitId: unitDbId,
    intUnitSlug,
    feasibilityStatus: "NON_OPERATIONAL",
    constraintViolations: [],
    totalChains: capacity.totalChains,
    maxPossibleScans: capacity.totalChains,
    activeChains: 0,
    occupancyPct: 0,
    availableByStage: {
      antennas: capacity.antennas,
      lnbs: capacity.lnbs,
      demodulators: capacity.demodulators,
      processors: capacity.processors,
    },
    assignments: [],
    snapshot: { activeCount: 0, satellites: [] },
  };

  if (capacity.totalChains === 0) {
    const zeroStages = CHAIN_CATEGORIES.filter((_, i) => {
      const vals = [
        capacity.antennas,
        capacity.lnbs,
        capacity.demodulators,
        capacity.processors,
      ];
      return vals[i] === 0;
    }).map((c) => c.short);

    if (zeroStages.length > 0) {
      violations.push(
        `No functional scan chain: ${zeroStages.join(", ")} unavailable (0 serviceable)`,
      );
    } else {
      violations.push("No functional end-to-end scan chain available");
    }

    return {
      ...empty,
      constraintViolations: violations,
      feasibilityStatus: "NON_OPERATIONAL",
    };
  }

  const unitEngs = engagements.filter((e) => e.unit_id === unitDbId);
  const rawActive = unitEngs.filter((e) => {
    const status = e.status as string;
    return isActiveScanStatus(status);
  });

  if (rawActive.length > capacity.totalChains) {
    violations.push(
      `${rawActive.length} active engagement(s) exceed ${capacity.totalChains} available chain(s)`,
    );
  }

  const usedAntennas = new Set<string>();
  const usedDemods = new Set<string>();
  const usedProcessors = new Set<string>();
  const assignments: ValidatedSatelliteAssignment[] = [];

  for (const eng of sortEngagementCandidates(unitEngs)) {
    const name = (eng.satellites?.name as string | undefined) ?? "Unassigned";
    const analysis = computeSatelliteAnalysisForEngagement(eng, intelRows);

    if (!existsInIntOrActiveScan(eng, intUnitSlug, intelRows)) continue;

    if (!passesVisibilityGate(name, intUnitSlug)) {
      if (isActiveScanStatus(eng.status as string)) {
        violations.push(`"${name}" blocked: not visible in Visibility Matrix`);
      }
      continue;
    }

    if (
      !shouldShowOnLiveEngagement(
        name,
        intUnitSlug,
        analysis.scanned,
        analysis.analyzed,
        analysis.pending,
        eng.status as string,
      )
    ) {
      continue;
    }

    const chain = engagementHasOperationalChain(eng, eqById);
    if (!chain.valid) {
      if (isActiveScanStatus(eng.status as string)) {
        violations.push(`"${name}": ${chain.reason}`);
      }
      continue;
    }

    const antennaId = eng.antenna_id as string;
    const demodId = eng.demodulator_id as string;
    const procId = eng.processing_server_id as string;

    if (
      usedAntennas.has(antennaId) ||
      usedDemods.has(demodId) ||
      usedProcessors.has(procId)
    ) {
      violations.push(`"${name}" blocked: hardware already allocated to another scan`);
      continue;
    }

    if (assignments.length >= capacity.totalChains) {
      violations.push(`"${name}" blocked: exceeds maxActiveScans (${capacity.totalChains})`);
      continue;
    }

    usedAntennas.add(antennaId);
    usedDemods.add(demodId);
    usedProcessors.add(procId);

    assignments.push({
      engagementId: eng.id as string,
      name,
      status: eng.status as string,
      displayStatus: scanStatusLabel(eng.status as string),
      engagement: eng,
      analysis,
    });
  }

  const activeChains = assignments.length;
  const occupancyPct =
    capacity.totalChains === 0
      ? 0
      : Math.min(100, Math.round((activeChains / capacity.totalChains) * 100));

  const feasibilityStatus: FeasibilityStatus =
    violations.length === 0 ? "VALID" : "DEGRADED";

  return {
    unitId: unitDbId,
    intUnitSlug,
    feasibilityStatus,
    constraintViolations: violations,
    totalChains: capacity.totalChains,
    maxPossibleScans: capacity.totalChains,
    activeChains,
    occupancyPct,
    availableByStage: {
      antennas: capacity.antennas,
      lnbs: capacity.lnbs,
      demodulators: capacity.demodulators,
      processors: capacity.processors,
    },
    assignments,
    snapshot: toSnapshot(assignments),
  };
}

/** Fleet-wide derived model — one call feeds dashboard tiles and validation. */
export function buildLiveEngagementFleetModel(
  input: LiveEngagementInputs,
): Map<string, UnitCapability> {
  const { engagements, equipment, dbUnits, intelRows } = input;
  const map = new Map<string, UnitCapability>();

  for (const unit of dbUnits) {
    map.set(
      unit.id,
      computeUnitCapability(unit.id, unit.code, engagements, equipment, intelRows),
    );
  }

  return map;
}

export function fleetActiveScanTotal(model: Map<string, UnitCapability>): number {
  let total = 0;
  for (const cap of model.values()) {
    total += cap.activeChains;
  }
  return total;
}

/** Detail view rows — expansion of capability assignments (same engagement objects). */
export function assignmentsToEngagementRows(
  capability: UnitCapability,
  enrichedEngagements: any[],
): any[] {
  const byId = new Map(enrichedEngagements.map((r) => [r.id as string, r]));
  return capability.assignments
    .map((a) => byId.get(a.engagementId) ?? a.engagement)
    .filter(Boolean);
}

export function computeUnitOptimizationScore(cap: UnitCapability): number {
  const chainUtilization =
    cap.totalChains === 0 ? 0 : cap.activeChains / cap.totalChains;

  const violationPenalty = Math.min(1, cap.constraintViolations.length * 0.15);

  const snapshotBonus =
    cap.snapshot?.satellites?.length > 0 ? 0.1 : 0;

  const base =
    chainUtilization * 0.7 +
    snapshotBonus -
    violationPenalty;

  return Math.max(0, Math.min(1, base)) * 100;
}