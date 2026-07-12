/**
 * DashboardDataService — live aggregation layer for the Satellite Monitoring Dashboard.
 *
 * The dashboard NEVER stores its own operational records. All metrics are derived
 * on read from the five administrator module data sources:
 *   Intelligence Repository, Priority & Allocation, Visibility Metrics,
 *   Resource Inventory, Serviceability State.
 */

import {
  buildOperationalFleetState,
  buildUnitOptimizationData,
  type OperationalFleetState,
  type UnitActivityHistoryRow,
  type UnitActivitySatRow,
  type UnitOptimizationData,
} from "@/lib/operationalState";
import { unitDisplayLabel } from "@/lib/operationalDataset";
import { unionUnitsForScopes, filterUnitsForModule } from "@/lib/moduleUnitRegistry";
import {
  computeGatedResourceEngagementPct,
  intelRowProductiveCounts,
  listIntelMonitoringSatellites,
} from "@/lib/intelLiveBridge";
import type { IntelSatelliteReportRow } from "@/lib/intelAnalysisData";
import { computeSatelliteAnalysis } from "@/lib/engagementEngine";
import {
  getUnitScanHistory,
  previewScanHistoryFromActiveSatellites,
} from "@/lib/scanHistoryStore";
import { formatLiveEngagementSatelliteLabel } from "@/lib/operationalSync";
import {
  getAllocationsForUnit,
  type UnitSlot,
} from "@/lib/priorityAllocation";
import {
  invalidateOperationalQueries,
  notifyOperationalDerivedRefresh,
  subscribeOperationalSync,
} from "@/lib/operationalRefresh";

// ─── Input contract (sourced from administrator modules via queries.ts) ───────

export type DashboardSourceInput = {
  dbUnits: { id: string; code: string; name?: string }[];
  equipment: any[];
  engagements: any[];
  intelRows: any[];
};

// ─── Derived view types ───────────────────────────────────────────────────────

export type EngagementUnitStatus = {
  unitId: string;
  unitCode: string;
  unitLabel: string;
  occupancyPct: number;
  /** Satellites with user-uploaded INT Repository data for this unit. */
  monitoringSatelliteCount: number;
  feasibilityStatus: string;
  /** Satellites assigned via Priority & Allocation */
  assignedSatellites: string[];
  /** Satellites actively monitored (INT + Visibility + Inventory) */
  activeSatellites: string[];
  satelliteDisplay: { label: string; total: number };
  rfResourcesEngaged: number;
  frequenciesScanned: number;
  frequenciesAnalyzed: number;
  frequenciesPending: number;
};

export type EngagementStatusSnapshot = {
  units: EngagementUnitStatus[];
  totalActiveScans: number;
  avgOccupancy: number;
};

export type UnitActivityEntry = {
  unitDbId: string;
  unitLabel: string;
  unitCode: string;
  monitoredCount: number;
  activeSats: UnitActivitySatRow[];
  history: UnitActivityHistoryRow[];
  totalScanned: number;
  totalAnalyzed: number;
  totalPending: number;
};

export type UnitActivitySnapshotData = {
  units: UnitActivityEntry[];
  totalMonitoredSatellites: number;
};

export type OptimizationScoresSnapshot = {
  byUnitId: Map<string, UnitOptimizationData>;
  units: UnitOptimizationData[];
  avgCompositeScore: number;
};

export type DashboardMetrics = {
  fleetState: OperationalFleetState | null;
  engagement: EngagementStatusSnapshot;
  activity: UnitActivitySnapshotData;
  optimization: OptimizationScoresSnapshot;
};

// ─── Pure builders (no React, no caching) ───────────────────────────────────

export function buildDashboardMetrics(input: DashboardSourceInput): DashboardMetrics {
  const { dbUnits, equipment, engagements, intelRows } = input;

  if (!dbUnits.length) {
    return emptyDashboardMetrics();
  }

  /** Resource Engagement: union of Resource Inventory + Intel Repository + Serviceability. */
  const engagementUnits = unionUnitsForScopes(dbUnits, [
    "inventory",
    "intel",
    "serviceability",
  ]);

  /** Active Satellite Monitoring: Intel Repository only. */
  const activityUnits = filterUnitsForModule(dbUnits, "intel");

  /** Optimization Engine: Resource Inventory + Priority + Serviceability. */
  const optimizationUnits = unionUnitsForScopes(dbUnits, [
    "inventory",
    "priority",
    "serviceability",
  ]);

  const engagementFleet = buildOperationalFleetState({
    dbUnits: engagementUnits,
    equipment,
    engagements,
    intelRows,
  });

  const activityFleet = buildOperationalFleetState({
    dbUnits: activityUnits,
    equipment,
    engagements,
    intelRows,
  });

  const optimizationFleet = buildOperationalFleetState({
    dbUnits: optimizationUnits,
    equipment,
    engagements,
    intelRows,
  });

  return {
    fleetState: engagementFleet,
    engagement: buildEngagementStatus(
      engagementFleet,
      engagementUnits,
      equipment,
      engagements,
      intelRows,
    ),
    activity: buildUnitActivitySnapshot(
      activityFleet,
      equipment,
      engagements,
      intelRows,
    ),
    optimization: buildOptimizationScores(
      optimizationFleet,
      equipment,
      engagements,
      intelRows,
    ),
  };
}

function emptyDashboardMetrics(): DashboardMetrics {
  return {
    fleetState: null,
    engagement: { units: [], totalActiveScans: 0, avgOccupancy: 0 },
    activity: { units: [], totalMonitoredSatellites: 0 },
    optimization: { byUnitId: new Map(), units: [], avgCompositeScore: 0 },
  };
}

/** Resource Engagement Status — INT-gated inventory ring average + INT scan satellites. */
export function buildEngagementStatus(
  fleetState: OperationalFleetState,
  dbUnits: { id: string; code: string; name?: string }[],
  equipment: any[],
  engagements: any[],
  intelRows: any[],
): EngagementStatusSnapshot {
  const units: EngagementUnitStatus[] = dbUnits.map((u) => {
    const state = fleetState.byUnitId.get(u.id);
    const intMonitoring = listIntelMonitoringSatellites(
      u.id,
      u.code,
      engagements,
      equipment,
      intelRows,
    );
    const isMonitoring = intMonitoring.length > 0;
    const resourceOccupancyPct = computeGatedResourceEngagementPct(
      u.id,
      u.code,
      equipment,
      engagements,
      intelRows,
    );
    const activeSatellites = intMonitoring.map((row) => row.satelliteName);
    const monitoringSatelliteCount = activeSatellites.length;
    const satelliteDisplay = formatLiveEngagementSatelliteLabel(
      activeSatellites.map((name) => ({
        engagementId: `${u.id}-${name}`,
        name,
        status: "In Progress",
        displayStatus: "Active",
      })),
      2,
    );

    if (!state) {
      return {
        unitId: u.id,
        unitCode: u.code,
        unitLabel: unitDisplayLabel(u),
        occupancyPct: resourceOccupancyPct,
        monitoringSatelliteCount,
        feasibilityStatus: isMonitoring ? "VALID" : "NON_OPERATIONAL",
        assignedSatellites: [],
        activeSatellites,
        satelliteDisplay,
        rfResourcesEngaged: isMonitoring ? activeSatellites.length : 0,
        frequenciesScanned: intMonitoring.reduce((s, r) => s + r.totalScanned, 0),
        frequenciesAnalyzed: intMonitoring.reduce((s, r) => s + r.analyzed, 0),
        frequenciesPending: intMonitoring.reduce((s, r) => s + r.pending, 0),
      };
    }

    const cap = state.capability;
    const assignedSatellites =
      state.prioritySlot != null
        ? getAllocationsForUnit(state.prioritySlot as UnitSlot).map((r) => r.satelliteName)
        : state.intUnitSlug != null
          ? getAllocationsForUnit(state.intUnitSlug as UnitSlot).map((r) => r.satelliteName)
          : [];

    let frequenciesScanned = 0;
    let frequenciesAnalyzed = 0;
    let frequenciesPending = 0;
    for (const row of intMonitoring) {
      frequenciesScanned += row.totalScanned;
      frequenciesAnalyzed += row.analyzed;
      frequenciesPending += row.pending;
    }

    return {
      unitId: u.id,
      unitCode: u.code,
      unitLabel: state.unitLabel,
      occupancyPct: resourceOccupancyPct,
      monitoringSatelliteCount,
      feasibilityStatus: isMonitoring ? cap.feasibilityStatus : "NON_OPERATIONAL",
      assignedSatellites,
      activeSatellites,
      satelliteDisplay,
      rfResourcesEngaged: isMonitoring ? activeSatellites.length : 0,
      frequenciesScanned,
      frequenciesAnalyzed,
      frequenciesPending,
    };
  });

  const monitoringUnits = units.filter((u) => u.monitoringSatelliteCount > 0);
  const occupancyValues = monitoringUnits.map((u) => u.occupancyPct);
  const avgOccupancy =
    occupancyValues.length > 0
      ? Math.round(occupancyValues.reduce((s, v) => s + v, 0) / occupancyValues.length)
      : 0;

  return {
    units,
    totalActiveScans: monitoringUnits.reduce((s, u) => s + u.monitoringSatelliteCount, 0),
    avgOccupancy,
  };
}

function intelReportRowsToActivitySats(rows: IntelSatelliteReportRow[]): UnitActivitySatRow[] {
  return rows.map((row) => {
    const pol = row.polarization !== "—" ? row.polarization : "KU-HH";
    const band = pol.startsWith("C")
      ? "C-band"
      : pol.startsWith("KA")
        ? "KA band"
        : pol.startsWith("KU")
          ? "KU band"
          : "Extended C-band";
    const { productive, nonProductive } = intelRowProductiveCounts(row);
    return {
      satellite: row.satelliteName,
      band,
      pol,
      scanned: row.totalScanned,
      analyzed: row.analyzed,
      productive,
      nonProductive,
    };
  });
}

function buildActivityScanHistory(
  unitDbId: string,
  activeSatNames: string[],
  engagements: any[],
  intelRows: any[],
): UnitActivityHistoryRow[] {
  const seededHistory = getUnitScanHistory(unitDbId);
  if (seededHistory.length > 0) {
    return previewScanHistoryFromActiveSatellites(unitDbId, activeSatNames).map((h) => ({
      satellite: h.satellite,
      time: h.time,
      outcome: h.outcome,
    }));
  }

  const completed = engagements
    .filter((e) => e.unit_id === unitDbId && e.status === "Completed")
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
}

/** Active Satellite Monitoring — mirrors INT Repository satellite table (no hardware cap). */
export function buildUnitActivitySnapshot(
  fleetState: OperationalFleetState,
  equipment: any[],
  engagements: any[],
  intelRows: any[],
): UnitActivitySnapshotData {
  const units: UnitActivityEntry[] = fleetState.units.map((state) => {
    const intRows = listIntelMonitoringSatellites(
      state.unitDbId,
      state.unitCode,
      engagements,
      equipment,
      intelRows,
    );
    const activeSats = intelReportRowsToActivitySats(intRows);
    const activeSatNames = activeSats.map((s) => s.satellite);
    const history = buildActivityScanHistory(
      state.unitDbId,
      activeSatNames,
      engagements,
      intelRows,
    );
    const totalScanned = activeSats.reduce((s, r) => s + r.scanned, 0);
    const totalAnalyzed = activeSats.reduce((s, r) => s + r.analyzed, 0);
    const totalPending = activeSats.reduce(
      (s, r) => s + Math.max(0, r.scanned - r.analyzed),
      0,
    );

    return {
      unitDbId: state.unitDbId,
      unitLabel: state.unitLabel,
      unitCode: state.unitCode,
      monitoredCount: activeSats.length,
      activeSats,
      history,
      totalScanned,
      totalAnalyzed,
      totalPending,
    };
  });

  return {
    units,
    totalMonitoredSatellites: units.reduce((s, u) => s + u.monitoredCount, 0),
  };
}

/** Optimization Engine — INT-gated scores from Inventory, Priority, Serviceability. */
export function buildOptimizationScores(
  fleetState: OperationalFleetState,
  equipment: any[],
  engagements: any[],
  intelRows: any[],
): OptimizationScoresSnapshot {
  const byUnitId = new Map<string, UnitOptimizationData>();
  const units: UnitOptimizationData[] = [];

  for (const state of fleetState.units) {
    const unitEq = equipment.filter((e) => e.unit_id === state.unitDbId);
    const intMonitoring = listIntelMonitoringSatellites(
      state.unitDbId,
      state.unitCode,
      engagements,
      equipment,
      intelRows,
    );
    const isMonitoring = intMonitoring.length > 0;
    const monitoredSatelliteNames = intMonitoring.map((r) => r.satelliteName);
    const activeSatNames = monitoredSatelliteNames;
    const historyNames = isMonitoring
      ? previewScanHistoryFromActiveSatellites(state.unitDbId, activeSatNames).map(
          (h) => h.satellite,
        )
      : getUnitScanHistory(state.unitDbId).map((h) => h.satellite);
    const recentScanSatelliteNames = [
      ...new Set([...monitoredSatelliteNames, ...historyNames]),
    ];
    const resourceEngagementPct = isMonitoring
      ? computeGatedResourceEngagementPct(
          state.unitDbId,
          state.unitCode,
          equipment,
          engagements,
          intelRows,
        )
      : 0;

    const data = buildUnitOptimizationData(state, unitEq, {
      isMonitoring,
      monitoredSatelliteNames,
      recentScanSatelliteNames,
      resourceEngagementPct,
    });
    byUnitId.set(state.unitDbId, data);
    units.push(data);
  }

  const monitoringUnits = units.filter((u) => u.monitoringActive);
  const avgCompositeScore =
    monitoringUnits.length > 0
      ? Math.round(
          monitoringUnits.reduce((s, u) => s + u.compositeScore, 0) / monitoringUnits.length,
        )
      : 0;

  return { byUnitId, units, avgCompositeScore };
}

// ─── Public service API ───────────────────────────────────────────────────────

export function getEngagementStatus(input: DashboardSourceInput): EngagementStatusSnapshot {
  return buildDashboardMetrics(input).engagement;
}

export function getUnitActivitySnapshot(input: DashboardSourceInput): UnitActivitySnapshotData {
  return buildDashboardMetrics(input).activity;
}

export function getOptimizationScores(input: DashboardSourceInput): OptimizationScoresSnapshot {
  return buildDashboardMetrics(input).optimization;
}

/** Subscribe to administrator-module change events (live sync). */
export { subscribeOperationalSync as subscribeToChanges };

/** Signal that derived dashboard metrics should rebuild (localStorage overlays). */
export { notifyOperationalDerivedRefresh as refreshMetrics };

/** Invalidate React Query caches for all upstream administrator data. */
export { invalidateOperationalQueries };
