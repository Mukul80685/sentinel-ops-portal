/**
 * INT Repository → Live Engagement bridge.
 * Satellite scan lists and frequency counts derive from buildIntelSatelliteTable (INT SSOT).
 */

import {
  isActiveScanStatus,
  scanStatusLabel,
  resolveEngagementWithHardware,
  pickAvailableOperationalChain,
  type SatelliteAnalysis,
} from "@/lib/engagementEngine";
import {
  buildIntelLinkageContext,
  buildIntelLinkageVisibilityRows,
  buildIntelSatelliteTable,
  hasIntelData,
  type IntelSatelliteReportRow,
} from "@/lib/intelAnalysisData";
import { mergeIntelSatelliteTableWithStorage } from "@/lib/intelScanStorage";

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

function buildSyntheticEngagement(
  satelliteName: string,
  unitDbId: string,
  chain: { antenna_id: string; demodulator_id: string; processing_server_id: string },
): any {
  return {
    id: `synthetic-${unitDbId}-${satelliteName.replace(/\s+/g, "-")}`,
    unit_id: unitDbId,
    status: "In Progress",
    antenna_id: chain.antenna_id,
    demodulator_id: chain.demodulator_id,
    processing_server_id: chain.processing_server_id,
    satellites: { name: satelliteName },
  };
}

/** Map INT table row → Live Engagement SatelliteAnalysis. */
export function intelRowToAnalysis(row: IntelSatelliteReportRow): SatelliteAnalysis {
  const scanned = row.totalScanned;
  const analyzed = row.analyzed;
  const pending = row.pending;
  return {
    polarization: row.polarization !== "—" ? row.polarization : "—",
    lastUpdate: row.reportTimestamp,
    scanned,
    analyzed,
    pending,
    analysisPct: scanned > 0 ? Math.round((analyzed / scanned) * 100) : 0,
  };
}

/** Productive / non-productive counts — same formula as summarizeIntelSatelliteRows. */
export function intelRowProductiveCounts(row: IntelSatelliteReportRow): {
  productive: number;
  nonProductive: number;
} {
  const productive = Math.floor(row.analyzed * ((row.productivityScore ?? 0) / 100));
  const nonProductive = Math.max(0, row.analyzed - productive);
  return { productive, nonProductive };
}

export type IntelBackedAssignment = {
  engagementId: string;
  name: string;
  status: string;
  displayStatus: string;
  engagement: any;
  analysis: SatelliteAnalysis;
  productiveCount: number;
  nonProductiveCount: number;
};

export type IntelBackedAssignmentResult = {
  assignments: IntelBackedAssignment[];
  violations: string[];
};

/**
 * Build Live Engagement assignments from INT Repository active scan rows.
 * Only satellites with engagementStatus In Progress / Paused appear (matches INT unit page).
 */
export function buildIntelBackedAssignments(
  intUnitSlug: string,
  unitDbId: string,
  engagements: any[],
  equipment: any[],
  intelRows: any[],
  maxAssignments: number,
  unitCode?: string,
): IntelBackedAssignmentResult {
  if (!hasIntelData(intUnitSlug, unitDbId)) {
    return { assignments: [], violations: [] };
  }

  const unitEngs = engagements.filter((e) => e.unit_id === unitDbId);
  const unitEq = equipment.filter((e) => e.unit_id === unitDbId);
  const eqById = new Map(unitEq.map((e) => [e.id as string, e]));

  const visibilityRows = buildIntelLinkageVisibilityRows(intUnitSlug, unitDbId, unitEngs);
  const ctx = buildIntelLinkageContext(intUnitSlug, unitEngs, visibilityRows, unitEq, intelRows);
  const baseTable = buildIntelSatelliteTable(intUnitSlug, ctx, unitEngs);
  const table = mergeIntelSatelliteTableWithStorage(intUnitSlug, baseTable, unitCode);

  const activeIntelRows = table.filter(
    (r) =>
      r.scanEligible &&
      r.engagementStatus != null &&
      isActiveScanStatus(r.engagementStatus),
  );

  const engBySatName = new Map<string, any>();
  for (const e of unitEngs) {
    const name = e.satellites?.name as string | undefined;
    if (name) engBySatName.set(name, e);
  }

  const usedAntennas = new Set<string>();
  const usedDemods = new Set<string>();
  const usedProcessors = new Set<string>();
  const assignments: IntelBackedAssignment[] = [];
  const violations: string[] = [];

  for (const row of activeIntelRows) {
    let eng = engBySatName.get(row.satelliteName) ?? null;

    if (eng) {
      eng = resolveEngagementWithHardware(
        eng,
        unitEq,
        eqById,
        usedAntennas,
        usedDemods,
        usedProcessors,
      );
    }

    if (!eng) {
      const chain = pickAvailableOperationalChain(
        unitEq,
        usedAntennas,
        usedDemods,
        usedProcessors,
      );
      if (chain) {
        eng = buildSyntheticEngagement(row.satelliteName, unitDbId, chain);
      }
    }

    if (!eng) {
      violations.push(`"${row.satelliteName}": no operational inventory chain available`);
      continue;
    }

    const chain = engagementHasOperationalChain(eng, eqById);
    if (!chain.valid) {
      violations.push(`"${row.satelliteName}": ${chain.reason}`);
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
      violations.push(`"${row.satelliteName}" blocked: hardware already allocated to another scan`);
      continue;
    }

    if (assignments.length >= maxAssignments) {
      violations.push(`"${row.satelliteName}" blocked: exceeds maxActiveScans (${maxAssignments})`);
      continue;
    }

    usedAntennas.add(antennaId);
    usedDemods.add(demodId);
    usedProcessors.add(procId);

    const { productive, nonProductive } = intelRowProductiveCounts(row);

    assignments.push({
      engagementId: eng.id as string,
      name: row.satelliteName,
      status: eng.status as string,
      displayStatus: scanStatusLabel(eng.status as string),
      engagement: eng,
      analysis: intelRowToAnalysis(row),
      productiveCount: productive,
      nonProductiveCount: nonProductive,
    });
  }

  return { assignments, violations };
}
