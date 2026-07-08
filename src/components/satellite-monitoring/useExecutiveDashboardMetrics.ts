import { useMemo } from "react";
import {
  buildUnitActivityFromState,
  buildUnitOptimizationData,
} from "@/lib/operationalState";
import { useOperationalState } from "@/hooks/useOperationalState";

export function useExecutiveDashboardMetrics() {
  const {
    fleetState,
    units,
    equipment,
    engagements,
    intelRows,
    isLoading,
    derivedRevision,
  } = useOperationalState();

  return useMemo(() => {
    if (!fleetState || units.length === 0) {
      return {
        isLoading,
        hasData: false,
        avgEngagement: 0,
        totalActiveSatellites: 0,
        avgOptimizationScore: 0,
      };
    }

    const engagementValues = fleetState.units.map((u) => u.capability.occupancyPct);
    const avgEngagement = Math.round(
      engagementValues.reduce((sum, v) => sum + v, 0) / engagementValues.length,
    );

    let totalActiveSatellites = 0;
    for (const state of fleetState.units) {
      const activity = buildUnitActivityFromState(state, engagements, intelRows);
      totalActiveSatellites += activity.activeSats.length;
    }

    const optimizationScores = fleetState.units.map((state) => {
      const unitEq = equipment.filter((e) => e.unit_id === state.unitDbId);
      return buildUnitOptimizationData(state, unitEq).compositeScore;
    });
    const avgOptimizationScore = Math.round(
      optimizationScores.reduce((sum, v) => sum + v, 0) / optimizationScores.length,
    );

    return {
      isLoading,
      hasData: true,
      avgEngagement,
      totalActiveSatellites,
      avgOptimizationScore,
    };
  }, [fleetState, units, equipment, engagements, intelRows, isLoading, derivedRevision]);
}
