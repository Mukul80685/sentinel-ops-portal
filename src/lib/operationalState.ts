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

  const normalizedEngagements = engagements.map((e) => ({
    ...e,
    status: (e.status ?? "UNKNOWN").toString().trim(),
  }));

  const units: UnitOperationalState[] = dbUnits.map((unit) => {
    const intSlug = resolveIntUnitSlug(unit.id, unit.code) as UnitSlot | null;
  
    const capability = buildLiveEngagementFleetModel({
      engagements,
      equipment,
      dbUnits: [unit],
      intelRows,
    }).get(unit.id)!;

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
      activeSatellites: capability.activeChains,
      capability,
      snapshot: capability.snapshot,
    };
  });

  return {
    units,
    byUnitId: new Map(units.map((u) => [u.unitDbId, u])),
    totalActiveScans: units.reduce((s, u) => s + u.activeSatellites, 0),
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
    const productive = Math.round(analysis.analyzed * 0.7);
    const nonProductive = Math.max(0, analysis.analyzed - productive);

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

export { countServiceableChainCapacity, unitCodeToSlot };
