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
  deriveIntScanPhaseStatus,
  hasIntelData,
  hasIntRepositoryContent,
  UNIT_SATELLITE_ROSTER,
  type IntelSatelliteReportRow,
} from "@/lib/intelAnalysisData";
import { loadImportedRecords } from "@/lib/intelRepository";
import {
  loadScanOverrides,
  loadSuppressedSatNames,
  mergeIntelSatelliteTableWithStorage,
} from "@/lib/intelScanStorage";
import { intelStorageSlug } from "@/lib/intelStorageKeys";
import { resolveIntUnitSlug } from "@/lib/operationalSync";
import { computeUnitResourceEngagementPct } from "@/lib/resourceEngagementStats";

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

function buildIntelActiveScanTable(
  intUnitSlug: string,
  unitDbId: string,
  engagements: any[],
  equipment: any[],
  intelRows: any[],
  unitCode?: string,
): {
  activeIntelRows: IntelSatelliteReportRow[];
  unitEngs: any[];
  unitEq: any[];
  eqById: Map<string, any>;
} | null {
  if (!hasIntRepositoryContent(intUnitSlug, unitCode)) return null;

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

  return { activeIntelRows, unitEngs, unitEq, eqById };
}

function engagementForSatellite(unitEngs: any[], satelliteName: string): any | null {
  const active = unitEngs.find(
    (e) =>
      (e.satellites?.name as string | undefined) === satelliteName &&
      isActiveScanStatus(e.status as string),
  );
  if (active) return active;
  return (
    unitEngs.find((e) => (e.satellites?.name as string | undefined) === satelliteName) ?? null
  );
}

/**
 * INT Repository satellites in active scan — full list for Engagement detail monitoring table.
 * Matches INT unit page badges; no chain-cap or hardware dedup filtering.
 */
export function buildIntelActiveMonitoringRows(
  intUnitSlug: string,
  unitDbId: string,
  engagements: any[],
  equipment: any[],
  intelRows: any[],
  unitCode?: string,
): IntelBackedAssignment[] {
  const built = buildIntelActiveScanTable(
    intUnitSlug,
    unitDbId,
    engagements,
    equipment,
    intelRows,
    unitCode,
  );
  if (!built) return [];

  const { activeIntelRows, unitEngs, unitEq, eqById } = built;
  const emptyUsed = new Set<string>();
  const assignments: IntelBackedAssignment[] = [];

  for (const row of activeIntelRows) {
    let eng = engagementForSatellite(unitEngs, row.satelliteName);
    if (eng) {
      const rebound = resolveEngagementWithHardware(
        eng,
        unitEq,
        eqById,
        emptyUsed,
        emptyUsed,
        emptyUsed,
      );
      eng = rebound ?? eng;
    } else {
      eng = {
        id: `monitoring-${unitDbId}-${row.satelliteName.replace(/\s+/g, "-")}`,
        unit_id: unitDbId,
        status: row.engagementStatus,
        satellites: { name: row.satelliteName },
        antenna_id: null,
        demodulator_id: null,
        processing_server_id: null,
      };
    }

    const { productive, nonProductive } = intelRowProductiveCounts(row);
    const status = (eng.status as string) ?? row.engagementStatus!;

    assignments.push({
      engagementId: eng.id as string,
      name: row.satelliteName,
      status,
      displayStatus: scanStatusLabel(status),
      engagement: eng,
      analysis: intelRowToAnalysis(row),
      productiveCount: productive,
      nonProductiveCount: nonProductive,
    });
  }

  return assignments;
}

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
  const built = buildIntelActiveScanTable(
    intUnitSlug,
    unitDbId,
    engagements,
    equipment,
    intelRows,
    unitCode,
  );
  if (!built) {
    return { assignments: [], violations: [] };
  }

  const { activeIntelRows, unitEngs, unitEq, eqById } = built;

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

/** Unit appears in INT Repository (seed roster or user uploads) — not generic fleet units. */
export function unitHasIntRepositoryPresence(intUnitSlug: string, unitCode?: string): boolean {
  if (UNIT_SATELLITE_ROSTER[intUnitSlug]) return true;
  const slug = intelStorageSlug(intUnitSlug, unitCode);
  if (loadScanOverrides(slug, unitCode).length > 0) return true;
  if (loadImportedRecords(slug).length > 0) return true;
  return false;
}

/**
 * Satellites a unit is monitoring — mirrors the INT Repository unit table.
 * Includes roster units (alpha/bravo/charlie) with scan data, plus any unit
 * with user-uploaded overrides/imports. Units with no INT presence return [].
 */
export function listIntelMonitoringSatellites(
  unitDbId: string,
  unitCode: string | undefined,
  engagements: any[],
  equipment: any[],
  intelRows: any[],
): IntelSatelliteReportRow[] {
  const intUnitSlug = resolveIntUnitSlug(unitDbId, unitCode);
  if (!intUnitSlug || !unitHasIntRepositoryPresence(intUnitSlug, unitCode)) {
    return [];
  }

  const slug = intelStorageSlug(intUnitSlug, unitCode);
  const suppressed = loadSuppressedSatNames(slug, unitCode);
  const allOverrides = loadScanOverrides(slug, unitCode);
  const zeroImported = new Set(
    allOverrides
      .filter((o) => o.totalScanned === 0)
      .map((o) => o.satelliteName.toLowerCase()),
  );

  const unitEngs = engagements.filter((e) => e.unit_id === unitDbId);
  const unitEq = equipment.filter((e: any) => e.unit_id === unitDbId);
  const visibilityRows = buildIntelLinkageVisibilityRows(intUnitSlug, unitDbId, unitEngs);
  const ctx = buildIntelLinkageContext(intUnitSlug, unitEngs, visibilityRows, unitEq, intelRows);
  const table = mergeIntelSatelliteTableWithStorage(
    intUnitSlug,
    buildIntelSatelliteTable(intUnitSlug, ctx, unitEngs),
    unitCode,
  );

  const fromTable = table.filter(
    (row) =>
      !suppressed.has(row.satelliteName.toLowerCase()) &&
      !zeroImported.has(row.satelliteName.toLowerCase()) &&
      row.scanEligible &&
      row.engagementStatus != null &&
      row.totalScanned > 0,
  );

  if (fromTable.length > 0 || UNIT_SATELLITE_ROSTER[intUnitSlug]) {
    return fromTable;
  }

  // Upload-only unit (no seed roster): build rows from overrides + imports.
  const overrides = allOverrides.filter(
    (o) => o.totalScanned > 0 && !suppressed.has(o.satelliteName.toLowerCase()),
  );
  const imports = loadImportedRecords(slug).filter(
    (r) => !r.archived && !suppressed.has(r.satellite.toLowerCase()),
  );
  const satNames = new Set<string>();
  for (const o of overrides) satNames.add(o.satelliteName);
  for (const r of imports) satNames.add(r.satellite);

  const rows: IntelSatelliteReportRow[] = [];
  for (const name of satNames) {
    const key = name.toLowerCase();
    const ov = overrides.find((o) => o.satelliteName.toLowerCase() === key);
    if (ov) {
      rows.push({
        reportId: `${intUnitSlug}__${name.replace(/\s+/g, "-")}`,
        satelliteName: name,
        scanEligible: true,
        totalScanned: ov.totalScanned,
        analyzed: ov.analyzed,
        pending: ov.pending,
        productivityScore: ov.productivityScore,
        reportTimestamp: ov.updatedOn,
        polarization: ov.polarization,
        processingStatus: ov.pending > 0 ? "Active Scanning" : "Analysis Complete",
        engagementStatus: deriveIntScanPhaseStatus(ov.totalScanned, ov.analyzed, ov.pending),
      });
      continue;
    }
    const satImports = imports.filter((r) => r.satellite.toLowerCase() === key);
    if (satImports.length > 0) {
      const analyzed = satImports.filter((r) => r.productivity === "productive").length;
      const totalScanned = satImports.length;
      const pending = Math.max(0, totalScanned - analyzed);
      rows.push({
        reportId: `${intUnitSlug}__${name.replace(/\s+/g, "-")}`,
        satelliteName: name,
        scanEligible: true,
        totalScanned,
        analyzed,
        pending,
        productivityScore:
          analyzed > 0 ? Math.round((analyzed / totalScanned) * 100) : null,
        reportTimestamp: satImports[0]?.collectionDate ?? null,
        polarization: satImports[0]?.polarization ?? "—",
        processingStatus: pending > 0 ? "Active Scanning" : "Analysis Complete",
        engagementStatus: deriveIntScanPhaseStatus(totalScanned, analyzed, pending),
      });
    }
  }

  return rows.filter((r) => r.totalScanned > 0 && r.engagementStatus != null);
}

/** True when INT Repository reports at least one satellite with scan data for this unit. */
export function unitHasIntMonitoringActivity(
  unitDbId: string,
  unitCode: string | undefined,
  engagements: any[],
  equipment: any[],
  intelRows: any[],
): boolean {
  return (
    listIntelMonitoringSatellites(unitDbId, unitCode, engagements, equipment, intelRows).length > 0
  );
}

/**
 * Resource engagement % is meaningful only when INT shows active monitoring.
 * Units with no INT scan data always return 0% (no seeded-inventory hallucination).
 */
export function computeGatedResourceEngagementPct(
  unitDbId: string,
  unitCode: string | undefined,
  equipment: any[],
  engagements: any[],
  intelRows: any[],
): number {
  if (!unitHasIntMonitoringActivity(unitDbId, unitCode, engagements, equipment, intelRows)) {
    return 0;
  }
  return computeUnitResourceEngagementPct(unitDbId, equipment, engagements);
}
