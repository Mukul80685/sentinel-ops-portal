/**
 * INT Repository → Live Engagement bridge.
 * Satellite scan lists and frequency counts derive from buildIntelSatelliteTable (INT SSOT).
 */

import {
  isActiveScanStatus,
  scanStatusLabel,
  type SatelliteAnalysis,
} from "@/lib/engagementEngine";
import {
  buildIntelLinkageContext,
  buildIntelSatelliteTable,
  hasIntelData,
  type IntelSatelliteReportRow,
} from "@/lib/intelAnalysisData";

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
): IntelBackedAssignmentResult {
  if (!hasIntelData(intUnitSlug)) {
    return { assignments: [], violations: [] };
  }

  const unitEngs = engagements.filter((e) => e.unit_id === unitDbId);
  const unitEq = equipment.filter((e) => e.unit_id === unitDbId);
  const eqById = new Map(unitEq.map((e) => [e.id as string, e]));

  const ctx = buildIntelLinkageContext(intUnitSlug, unitEngs, [], unitEq, intelRows);
  const table = buildIntelSatelliteTable(intUnitSlug, ctx, unitEngs);

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
    const eng = engBySatName.get(row.satelliteName);
    if (!eng) {
      violations.push(`"${row.satelliteName}": active in INT but no engagement record`);
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
