/**

 * Shared Intel scan override / suppression storage — used by INT UI and dashboard derivation.

 */



import { renameReportCellEdits } from "@/lib/intelCellStore";

import { migrateIntelFrequencyReportId } from "@/lib/intelFrequencyActions";

import { deriveIntPendingFrequencies, deriveIntScanPhaseStatus } from "@/lib/intelAnalysisData";

import type { IntelSatelliteReportRow } from "@/lib/intelAnalysisData";

import { slugify } from "@/lib/intelRepository";

import { scheduleElectronStorageFlush } from "@/lib/electronPersist";

import {

  intelScanOverridesKey,

  intelStorageSlug,

  intelSuppressedSatsKey,

  readIntelLocalJson,

} from "@/lib/intelStorageKeys";

const EXCEL_EPOCH_MS = new Date(Date.UTC(1899, 11, 30)).getTime();
const MONTH_NAMES_LOWER = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Convert Excel/CSV date cells to canonical YYYY-MM-DD (UTC). */
export function parseIntelImportDate(raw: unknown): string {
  const fallback = new Date().toISOString().slice(0, 10);

  if (typeof raw === "number" && !isNaN(raw) && raw > 1 && raw < 2_958_466) {
    const ms = EXCEL_EPOCH_MS + Math.round(raw) * 86_400_000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const str = String(raw ?? "").trim();
  if (!str) return fallback;

  // Strict ISO first — parseFloat("2024-01-15") === 2024 would otherwise match Excel serial.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // Excel serial from plain numeric strings only (not ISO dates).
  if (/^\d+(\.\d+)?$/.test(str)) {
    const numVal = parseFloat(str);
    if (!isNaN(numVal) && numVal > 1 && numVal < 2_958_466) {
      const ms = EXCEL_EPOCH_MS + Math.round(numVal) * 86_400_000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  const namedMatch = str.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (namedMatch) {
    const [, d, mon, y] = namedMatch;
    const mIdx = MONTH_NAMES_LOWER.indexOf(mon.slice(0, 3).toLowerCase());
    if (mIdx !== -1) {
      const dt = new Date(Date.UTC(+y, mIdx, +d));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }

  const numericMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numericMatch) {
    let [, a, b, y] = numericMatch;
    if (y.length === 2) y = `20${y}`;
    const aNum = +a;
    const bNum = +b;
    if (aNum > 12) {
      const dt = new Date(Date.UTC(+y, bNum - 1, aNum));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    if (bNum > 12) {
      const dt = new Date(Date.UTC(+y, aNum - 1, bNum));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    const dt = new Date(Date.UTC(+y, aNum - 1, bNum));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) return fallbackDate.toISOString().slice(0, 10);

  return fallback;
}

export function intelSuppressedRowsKey(slug: string): string {
  return `intel-suppressed-rows-${intelStorageSlug(slug)}`;
}

export type ScanReportOverride = {

  /** Stable per-row identity — survives renames of satellite name / polarization. */

  rowId?: string;

  satelliteName: string;

  polarization: string;

  totalScanned: number;

  analyzed: number;

  pending: number;

  productivityScore: number | null;

  updatedOn: string;

};



export function normalizeScanPolarization(polarization: string | undefined | null): string {

  const value = (polarization ?? "").trim();

  return value && value !== "—" ? value : "—";

}



/** Legacy grouping key — satellite name + polarization (case-insensitive). */

export function scanRowKey(satelliteName: string, polarization: string): string {

  return `${satelliteName.trim().toLowerCase()}::${normalizeScanPolarization(polarization).toLowerCase()}`;

}

export function isIntelRowSuppressed(
  satelliteName: string,
  polarization: string,
  suppressedNames: Set<string>,
  suppressedRowKeys: Set<string>,
): boolean {
  if (suppressedRowKeys.has(scanRowKey(satelliteName, polarization).toLowerCase())) return true;
  if (suppressedNames.has(satelliteName.toLowerCase())) return true;
  return false;
}

/** Content fingerprint — all table columns must match to be considered the same scan row. */

export function scanRowContentKey(override: ScanReportOverride): string {

  return [

    override.satelliteName.trim().toLowerCase(),

    normalizeScanPolarization(override.polarization).toLowerCase(),

    override.totalScanned,

    override.analyzed,

    override.pending,

    override.productivityScore ?? "null",

    override.updatedOn,

  ].join("|");

}



export function overrideRowKey(override: Pick<ScanReportOverride, "rowId" | "satelliteName" | "polarization">): string {

  if (override.rowId) return override.rowId;

  return scanRowKey(override.satelliteName, override.polarization);

}



function newRowId(): string {

  if (typeof crypto !== "undefined" && crypto.randomUUID) {

    return crypto.randomUUID();

  }

  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

}



/**

 * Drill-down / cell-edit report id — unique per scan table row per unit.

 * When rowId is present it is appended so same satellite + pol with different metrics stay distinct.

 */

export function buildIntelReportId(

  intUnitSlug: string,

  satelliteName: string,

  polarization = "—",

  rowId?: string,

): string {

  const pol = normalizeScanPolarization(polarization);

  const satSlug = satelliteName.trim().replace(/\s+/g, "-");

  let base: string;

  if (pol === "—") {

    base = `${intUnitSlug}__${satSlug}`;

  } else {

    base = `${intUnitSlug}__${slugify(satelliteName)}__${slugify(pol)}`;

  }

  if (rowId) return `${base}__${rowId}`;

  return base;

}



export function reportIdForOverride(intUnitSlug: string, override: ScanReportOverride): string {

  return buildIntelReportId(intUnitSlug, override.satelliteName, override.polarization, override.rowId);

}



/** Locate the scan override backing a merged table row (report id or embedded row id). */

export function findScanOverrideForReportId(

  intUnitSlug: string,

  overrides: ScanReportOverride[],

  reportId: string,

): ScanReportOverride | undefined {

  const direct = overrides.find((o) => reportIdForOverride(intUnitSlug, o) === reportId);

  if (direct) return direct;



  const rowIdSuffix = reportId.match(/__([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})$/i);

  if (rowIdSuffix) {

    const byRowId = overrides.find((o) => o.rowId === rowIdSuffix[1]);

    if (byRowId) return byRowId;

  }



  const legacy = findOverrideByLegacyReportId(intUnitSlug, overrides, reportId);

  if (legacy) return legacy;



  return overrides.find((o) => o.rowId && reportId.endsWith(`__${o.rowId}`));

}



/** Match overrides when report id uses legacy shape (no rowId suffix). */

function findOverrideByLegacyReportId(

  intUnitSlug: string,

  overrides: ScanReportOverride[],

  reportId: string,

): ScanReportOverride | undefined {

  const legacyMatches = overrides.filter(

    (o) => buildIntelReportId(intUnitSlug, o.satelliteName, o.polarization) === reportId,

  );

  return legacyMatches.length === 1 ? legacyMatches[0] : undefined;

}



/** YYYY-MM-DD for `<input type="date">` / text edit fields. */

export function formatIsoDateForEditInput(iso: string | null | undefined): string {

  if (!iso?.trim()) return "";

  const trimmed = iso.trim();

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);

  if (isoPrefix) return isoPrefix[1];

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const d = new Date(trimmed);

  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return trimmed;

}



export function buildScanOverrideFromTableRow(

  row: Pick<

    IntelSatelliteReportRow,

    | "satelliteName"

    | "polarization"

    | "totalScanned"

    | "analyzed"

    | "pending"

    | "productivityScore"

    | "reportTimestamp"

  >,

): ScanReportOverride {

  return {

    rowId: newRowId(),

    satelliteName: row.satelliteName,

    polarization: row.polarization,

    totalScanned: row.totalScanned,

    analyzed: row.analyzed,

    pending: row.pending,

    productivityScore: row.productivityScore,

    updatedOn: formatIsoDateForEditInput(row.reportTimestamp),

  };

}



export function tableRowEditKey(

  intUnitSlug: string,

  overrides: ScanReportOverride[],

  reportId: string,

): string {

  const override = findScanOverrideForReportId(intUnitSlug, overrides, reportId);

  if (override) return overrideRowKey(override);

  return reportId;

}



/**

 * Merge pinned / matched overrides with existing storage before persisting a row edit.

 * Does not auto-materialize unrelated visible table rows (prevents phantom satellites).

 */

export function materializeTableRowsAsScanOverrides(

  intUnitSlug: string,

  tableRows: IntelSatelliteReportRow[],

  existingOverrides: ScanReportOverride[] = [],

  /** Pre-assigned overrides for rows being edited (keeps rowId stable before first save). */

  pinnedByReportId: Record<string, ScanReportOverride> = {},

): ScanReportOverride[] {

  const usedKeys = new Set<string>();

  const result: ScanReportOverride[] = [];



  for (const row of tableRows) {

    const contentKey = tableRowContentKey(row);

    const matched =

      pinnedByReportId[row.reportId] ??

      findScanOverrideForReportId(intUnitSlug, existingOverrides, row.reportId) ??

      existingOverrides.find(

        (o) =>

          !usedKeys.has(overrideRowKey(o)) &&

          scanRowContentKey(o) === contentKey,

      ) ??

      existingOverrides.find(

        (o) =>

          !usedKeys.has(overrideRowKey(o)) &&

          scanRowKey(o.satelliteName, o.polarization) ===

            scanRowKey(row.satelliteName, row.polarization),

      );

    if (matched && !usedKeys.has(overrideRowKey(matched))) {

      result.push(matched);

      usedKeys.add(overrideRowKey(matched));

      continue;

    }

    if (pinnedByReportId[row.reportId]) {

      const built = pinnedByReportId[row.reportId];

      result.push(built);

      usedKeys.add(overrideRowKey(built));

    }

  }



  for (const o of existingOverrides) {

    const key = overrideRowKey(o);

    if (!usedKeys.has(key)) {

      result.push(o);

      usedKeys.add(key);

    }

  }



  migrateLegacyDrillDownForAllOverrides(intUnitSlug, result);



  return result;

}



function setupStorageKey(reportId: string, satelliteName: string): string {

  return `intel-setup-${reportId}-${satelliteName.replace(/\s+/g, "-").toLowerCase()}`;

}



function migrateLegacySetupProgress(

  oldReportId: string,

  oldSatelliteName: string,

  newReportId: string,

  newSatelliteName: string,

): void {

  if (typeof window === "undefined" || oldReportId === newReportId) return;

  const oldKey = setupStorageKey(oldReportId, oldSatelliteName);

  const raw = localStorage.getItem(oldKey);

  if (!raw) return;

  localStorage.setItem(setupStorageKey(newReportId, newSatelliteName), raw);

  localStorage.removeItem(oldKey);

}



/** All historical report-id shapes that may hold drill-down data for one scan row. */

export function legacyReportIdsForScanRow(

  intUnitSlug: string,

  satelliteName: string,

  polarization: string,

): string[] {

  const ids = new Set<string>();

  ids.add(buildIntelReportId(intUnitSlug, satelliteName, "—"));

  ids.add(buildIntelReportId(intUnitSlug, satelliteName, polarization));

  ids.add(`${intUnitSlug}__${satelliteName.trim().replace(/\s+/g, "-")}`);

  return [...ids];

}



function tableRowContentKey(row: Pick<

  IntelSatelliteReportRow,

  | "satelliteName"

  | "polarization"

  | "totalScanned"

  | "analyzed"

  | "pending"

  | "productivityScore"

  | "reportTimestamp"

>): string {

  return scanRowContentKey({

    satelliteName: row.satelliteName,

    polarization: row.polarization,

    totalScanned: row.totalScanned,

    analyzed: row.analyzed,

    pending: row.pending,

    productivityScore: row.productivityScore,

    updatedOn: formatIsoDateForEditInput(row.reportTimestamp),

  });

}



/** Move drill-down / frequency data from legacy report ids onto the canonical row id. */

export function migrateLegacyDrillDownForOverride(

  intUnitSlug: string,

  override: ScanReportOverride,

  allOverrides: ScanReportOverride[],

): void {

  if (!override.rowId || typeof window === "undefined") return;



  const newId = reportIdForOverride(intUnitSlug, override);

  const legacyIds = legacyReportIdsForScanRow(

    intUnitSlug,

    override.satelliteName,

    override.polarization,

  ).filter((id) => id !== newId);



  for (const legacyId of legacyIds) {

    const sameSatPol = allOverrides.filter(

      (o) =>

        o.satelliteName.trim().toLowerCase() === override.satelliteName.trim().toLowerCase() &&

        normalizeScanPolarization(o.polarization) === normalizeScanPolarization(override.polarization),

    );

    if (sameSatPol.length > 1) continue;



    renameReportCellEdits(legacyId, newId, override.satelliteName);

    migrateLegacySetupProgress(legacyId, override.satelliteName, newId, override.satelliteName);

    migrateIntelFrequencyReportId(legacyId, newId, override.satelliteName);

  }

}



/** Run legacy drill-down migration for every override (safe no-op when already migrated). */

export function migrateLegacyDrillDownForAllOverrides(

  intUnitSlug: string,

  overrides: ScanReportOverride[],

): void {

  for (const override of overrides) {

    migrateLegacyDrillDownForOverride(intUnitSlug, override, overrides);

  }

}



export function ensureOverrideRowIds(

  intUnitSlug: string,

  overrides: ScanReportOverride[],

  unitCode?: string,

): ScanReportOverride[] {

  let changed = false;

  const withIds = overrides.map((o) => {

    if (o.rowId) return o;

    changed = true;

    return { ...o, rowId: newRowId() };

  });



  if (changed) {

    for (const o of withIds) {

      migrateLegacyDrillDownForOverride(intUnitSlug, o, withIds);

    }

    saveScanOverrides(intUnitSlug, withIds, unitCode);

  }



  return withIds;

}



export function loadScanOverrides(

  unitIdOrSlug: string,

  unitCode?: string,

): ScanReportOverride[] {

  const slug = intelStorageSlug(unitIdOrSlug, unitCode);

  const raw = readIntelLocalJson<ScanReportOverride[]>(intelScanOverridesKey(slug), unitIdOrSlug) ?? [];

  return ensureOverrideRowIds(unitIdOrSlug, raw, unitCode);

}

/** One-time startup cleanup — drop blank satellite names only; never remove user metrics. */
export function sanitizeIntelScanOverridesStorage(): boolean {
  if (typeof window === "undefined") return false;
  let changed = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("intel-scan-overrides-")) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as ScanReportOverride[];
      if (!Array.isArray(parsed)) continue;
      const cleaned = parsed.filter((o) => o.satelliteName?.trim());
      if (cleaned.length === parsed.length) continue;
      localStorage.setItem(key, JSON.stringify(cleaned));
      changed = true;
    } catch {
      /* ignore */
    }
  }
  if (changed) scheduleElectronStorageFlush();
  return changed;
}

export function saveScanOverrides(

  unitIdOrSlug: string,

  overrides: ScanReportOverride[],

  unitCode?: string,

): void {

  if (typeof window === "undefined") return;

  const slug = intelStorageSlug(unitIdOrSlug, unitCode);

  localStorage.setItem(intelScanOverridesKey(slug), JSON.stringify(overrides));

  scheduleElectronStorageFlush();

}



export function loadSuppressedSatNames(

  unitIdOrSlug: string,

  unitCode?: string,

): Set<string> {

  const slug = intelStorageSlug(unitIdOrSlug, unitCode);

  const list =

    readIntelLocalJson<string[]>(intelSuppressedSatsKey(slug), unitIdOrSlug) ?? [];

  return new Set(list.map((n) => n.toLowerCase()));

}



export function loadSuppressedSatNamesList(

  unitIdOrSlug: string,

  unitCode?: string,

): string[] {

  const slug = intelStorageSlug(unitIdOrSlug, unitCode);

  return readIntelLocalJson<string[]>(intelSuppressedSatsKey(slug), unitIdOrSlug) ?? [];

}



export function saveSuppressedSatNames(

  unitIdOrSlug: string,

  names: string[],

  unitCode?: string,

): void {

  if (typeof window === "undefined") return;

  const slug = intelStorageSlug(unitIdOrSlug, unitCode);

  localStorage.setItem(intelSuppressedSatsKey(slug), JSON.stringify(names));

  scheduleElectronStorageFlush();

}

export function loadSuppressedScanRowKeys(

  unitIdOrSlug: string,

  unitCode?: string,

): Set<string> {

  const slug = intelStorageSlug(unitIdOrSlug, unitCode);

  const list = readIntelLocalJson<string[]>(intelSuppressedRowsKey(slug), unitIdOrSlug) ?? [];

  return new Set(list.map((key) => key.toLowerCase()));

}

export function saveSuppressedScanRowKeys(

  unitIdOrSlug: string,

  keys: string[],

  unitCode?: string,

): void {

  if (typeof window === "undefined") return;

  const slug = intelStorageSlug(unitIdOrSlug, unitCode);

  localStorage.setItem(intelSuppressedRowsKey(slug), JSON.stringify(keys));

  scheduleElectronStorageFlush();

}

export function clearSuppressedScanRowKeys(unitIdOrSlug: string, unitCode?: string): void {

  saveSuppressedScanRowKeys(unitIdOrSlug, [], unitCode);

}



function overrideToReportRow(

  intUnitSlug: string,

  override: ScanReportOverride,

): IntelSatelliteReportRow {

  const pending = deriveIntPendingFrequencies(override.totalScanned, override.analyzed);

  const engagementStatus = deriveIntScanPhaseStatus(

    override.totalScanned,

    override.analyzed,

    pending,

  );

  return {

    reportId: reportIdForOverride(intUnitSlug, override),

    satelliteName: override.satelliteName,

    scanEligible: true,

    totalScanned: override.totalScanned,

    analyzed: override.analyzed,

    pending,

    productivityScore: override.productivityScore,

    reportTimestamp: override.updatedOn,

    polarization: override.polarization,

    processingStatus: override.pending > 0 ? "Active Scanning" : "Analysis Complete",

    engagementStatus,

  };

}

export function scanOverrideToReportRow(

  intUnitSlug: string,

  override: ScanReportOverride,

): IntelSatelliteReportRow {

  return overrideToReportRow(intUnitSlug, override);

}



function findOverrideForBaseRow(

  intUnitSlug: string,

  overrides: ScanReportOverride[],

  base: IntelSatelliteReportRow,

): ScanReportOverride | undefined {

  const byReportId = findScanOverrideForReportId(intUnitSlug, overrides, base.reportId);

  if (byReportId) return byReportId;



  const baseKey = scanRowKey(base.satelliteName, base.polarization);

  const matches = overrides.filter(

    (o) => scanRowKey(o.satelliteName, o.polarization) === baseKey,

  );

  return matches.length === 1 ? matches[0] : undefined;

}



/** Apply scan overrides + suppressions — same merge rules as the INT unit page. */

export function mergeIntelSatelliteTableWithStorage(

  intUnitSlug: string,

  baseRows: IntelSatelliteReportRow[],

  unitCode?: string,

): IntelSatelliteReportRow[] {

  const scanOverrides = loadScanOverrides(intUnitSlug, unitCode);

  const suppressed = loadSuppressedSatNames(intUnitSlug, unitCode);

  const suppressedRowKeys = loadSuppressedScanRowKeys(intUnitSlug, unitCode);

  const filteredBase = baseRows.filter(

    (row) => !isIntelRowSuppressed(row.satelliteName, row.polarization, suppressed, suppressedRowKeys),

  );



  if (scanOverrides.length === 0) {

    return filteredBase;

  }

  // User-uploaded / edited scan overrides are the SSOT — never merge seeded roster or
  // engagement-derived base rows (prevents phantom satellites like PAKSAT MM1).
  return scanOverrides
    .filter(
      (override) =>
        !isIntelRowSuppressed(
          override.satelliteName,
          override.polarization,
          suppressed,
          suppressedRowKeys,
        ),
    )
    .map((override) => overrideToReportRow(intUnitSlug, override));

}


