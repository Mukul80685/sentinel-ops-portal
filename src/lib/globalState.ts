/**
 * GLOBAL STATE ENGINE (SSOT)
 * --------------------------
 * This is the single source of truth for ALL derived operational state.
 * It ensures consistency across:
 * - Control Center
 * - Intelligence Repository
 * - Unit Dashboard
 * - Engagement Engine
 */

import {
    computeBottleneckEngagement,
    buildAllocatedIds,
    filterActiveScans,
    buildUnitScanSnapshot,
    computeSatelliteAnalysis,
    scanStatusLabel,
    NON_OPERATIONAL,
  } from "@/lib/engagementEngine";
  
  /**
   * Global unified snapshot
   */
  export interface GlobalState {
    engagements: any[];
    equipment: any[];
    intel: any[];
  
    activeEngagements: any[];
  
    allocatedIds: Set<string>;
  
    bottleneck: any;
  
    unitSnapshots: Record<string, any>;
  
    satelliteAnalysis: Record<string, any>;
  
    summary: {
      totalEngagements: number;
      activeScans: number;
      totalUnits: number;
      bottleneckPct: number;
    };
  }
  
  /**
   * Build ONE consistent snapshot for the entire app
   */
  export function buildGlobalState(params: {
    engagements: any[];
    equipment: any[];
    intel: any[];
    unitIds: string[];
  }): GlobalState {
    const { engagements, equipment, intel, unitIds } = params;
  
    // 1. ACTIVE ENGAGEMENTS (single definition of truth)
    const activeEngagements = filterActiveScans(engagements);
  
    // 2. ALLOCATED RESOURCES
    const allocatedIds = buildAllocatedIds(activeEngagements);
  
    // 3. BOTTLENECK (fleet level)
    const bottleneck = computeBottleneckEngagement(equipment, allocatedIds);
  
    // 4. UNIT SNAPSHOTS (consistent across UI)
    const unitSnapshots: Record<string, any> = {};
  
    for (const unitId of unitIds) {
      const unitEngagements = engagements.filter((e) => e.unit_id === unitId);
  
      const snapshot = buildUnitScanSnapshot(unitEngagements, unitId);
  
      unitSnapshots[unitId] = {
        ...snapshot,
        displayStatus: snapshot.satellites.map((s) => s.displayStatus),
      };
    }
  
    // 5. SATELLITE ANALYSIS (consistent per engagement)
    const satelliteAnalysis: Record<string, any> = {};
  
    for (const eng of engagements) {
      satelliteAnalysis[eng.id] = computeSatelliteAnalysis(eng, intel);
    }
  
    // 6. SUMMARY METRICS (single source of truth)
    const totalEngagements = engagements.length;
    const activeScans = activeEngagements.length;
    const totalUnits = unitIds.length;
  
    const bottleneckPct = bottleneck.pct;
  
    return {
      engagements,
      equipment,
      intel,
      activeEngagements,
      allocatedIds,
      bottleneck,
      unitSnapshots,
      satelliteAnalysis,
      summary: {
        totalEngagements,
        activeScans,
        totalUnits,
        bottleneckPct,
      },
    };
  }