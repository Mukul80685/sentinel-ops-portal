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
  buildUnitActivityFromState,
  buildUnitOptimizationData,
  type OperationalFleetState,
  type UnitActivityHistoryRow,
  type UnitActivitySatRow,
  type UnitOptimizationData,
} from "@/lib/operationalState";
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

  const fleetState = buildOperationalFleetState({
    dbUnits,
    equipment,
    engagements,
    intelRows,
  });

  return {
    fleetState,
    engagement: buildEngagementStatus(fleetState, dbUnits),
    activity: buildUnitActivitySnapshot(fleetState, engagements, intelRows),
    optimization: buildOptimizationScores(fleetState, equipment),
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

/** Resource Engagement Status — INT + Visibility + Inventory (via liveEngagementModel). */
export function buildEngagementStatus(
  fleetState: OperationalFleetState,
  dbUnits: { id: string; code: string; name?: string }[],
): EngagementStatusSnapshot {
  const units: EngagementUnitStatus[] = dbUnits.map((u) => {
    const state = fleetState.byUnitId.get(u.id);
    if (!state) {
      return {
        unitId: u.id,
        unitCode: u.code,
        unitLabel: u.code,
        occupancyPct: 0,
        feasibilityStatus: "NON_OPERATIONAL",
        assignedSatellites: [],
        activeSatellites: [],
        satelliteDisplay: { label: "No active scans", total: 0 },
        rfResourcesEngaged: 0,
        frequenciesScanned: 0,
        frequenciesAnalyzed: 0,
        frequenciesPending: 0,
      };
    }

    const cap = state.capability;
    const assignedSatellites =
      state.prioritySlot != null
        ? getAllocationsForUnit(state.prioritySlot as UnitSlot).map((r) => r.satelliteName)
        : state.intUnitSlug != null
          ? getAllocationsForUnit(state.intUnitSlug as UnitSlot).map((r) => r.satelliteName)
          : [];

    const activeSatellites = cap.assignments.map((a) => a.name);

    let frequenciesScanned = 0;
    let frequenciesAnalyzed = 0;
    let frequenciesPending = 0;
    for (const a of cap.assignments) {
      frequenciesScanned += a.analysis.scanned;
      frequenciesAnalyzed += a.analysis.analyzed;
      frequenciesPending += a.analysis.pending;
    }

    return {
      unitId: u.id,
      unitCode: u.code,
      unitLabel: state.unitLabel,
      occupancyPct: cap.occupancyPct,
      feasibilityStatus: cap.feasibilityStatus,
      assignedSatellites,
      activeSatellites,
      satelliteDisplay: formatLiveEngagementSatelliteLabel(cap.snapshot.satellites, 2),
      rfResourcesEngaged: cap.activeChains,
      frequenciesScanned,
      frequenciesAnalyzed,
      frequenciesPending,
    };
  });

  const occupancyValues = fleetState.units.map((u) => u.capability.occupancyPct);
  const avgOccupancy =
    occupancyValues.length > 0
      ? Math.round(occupancyValues.reduce((s, v) => s + v, 0) / occupancyValues.length)
      : 0;

  return {
    units,
    totalActiveScans: fleetState.totalActiveScans,
    avgOccupancy,
  };
}

/** Active Satellite Monitoring — INT Repository + Visibility Metrics. */
export function buildUnitActivitySnapshot(
  fleetState: OperationalFleetState,
  engagements: any[],
  intelRows: any[],
): UnitActivitySnapshotData {
  const units: UnitActivityEntry[] = fleetState.units.map((state) => {
    const activity = buildUnitActivityFromState(state, engagements, intelRows);
    const totalScanned = activity.activeSats.reduce((s, r) => s + r.scanned, 0);
    const totalAnalyzed = activity.activeSats.reduce((s, r) => s + r.analyzed, 0);
    const totalPending = activity.activeSats.reduce(
      (s, r) => s + Math.max(0, r.scanned - r.analyzed),
      0,
    );

    return {
      unitDbId: state.unitDbId,
      unitLabel: state.unitLabel,
      unitCode: state.unitCode,
      monitoredCount: activity.activeSats.length,
      activeSats: activity.activeSats,
      history: activity.history,
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

/** Optimization Engine — Resource Inventory + Priority + Serviceability. */
export function buildOptimizationScores(
  fleetState: OperationalFleetState,
  equipment: any[],
): OptimizationScoresSnapshot {
  const byUnitId = new Map<string, UnitOptimizationData>();
  const units: UnitOptimizationData[] = [];

  for (const state of fleetState.units) {
    const unitEq = equipment.filter((e) => e.unit_id === state.unitDbId);
    const data = buildUnitOptimizationData(state, unitEq);
    byUnitId.set(state.unitDbId, data);
    units.push(data);
  }

  const avgCompositeScore =
    units.length > 0
      ? Math.round(units.reduce((s, u) => s + u.compositeScore, 0) / units.length)
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
