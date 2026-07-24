/**
 * Resource Engagement — CSV / Excel import for the Engaged Resources table.
 * Matches INT scan rows (satellite + polarization) and resolves inventory names to ids.
 */

import {
  buildCsv,
  downloadCsv,
  readSpreadsheetFile,
  sanitizeForCsvExport,
  validateImportFile,
} from "@/lib/dataTableUtils";
import {
  engagementTableRowKey,
  type EngagementIntelRowRef,
} from "@/lib/engagementTableStore";
import { canonicalSatelliteKey, normalizeSatelliteName } from "@/lib/visibilityMatrix";

export const ENGAGEMENT_IMPORT_COMMENT =
  "# Fill resource columns with exact names from Resource Inventory. Names that do not match will be highlighted in red.";

export const ENGAGEMENT_IMPORT_RESOURCE_COLUMNS = [
  "Antenna",
  "Demodulator",
  "Other Resources",
] as const;

export type EngagementImportResourceColumn = (typeof ENGAGEMENT_IMPORT_RESOURCE_COLUMNS)[number];

export const ENGAGEMENT_TEMPLATE_COLUMNS = [
  "Satellite",
  "Polarization",
  ...ENGAGEMENT_IMPORT_RESOURCE_COLUMNS,
] as const;

export type EngagementMonitoringRow = EngagementIntelRowRef & {
  engagementStatus?: string | null;
};

export type EngagementImportEquipment = {
  id: string;
  unit_id: string;
  name?: string;
  serviceability?: string;
  category?: { name?: string } | null;
  specifications?: string;
};

export type ResolvedImportResources = {
  antennaIds: string[];
  demodIds: string[];
  otherIds: string[];
  unmatchedColumns: EngagementImportResourceColumn[];
};

export type EngagementImportSkipReason =
  | "empty_row"
  | "satellite_not_found"
  | "polarization_required"
  | "polarization_mismatch"
  | "ambiguous_match"
  | "no_matched_resources";

export type EngagementImportSkippedRow = {
  line: number;
  satellite: string;
  reason: EngagementImportSkipReason;
  detail?: string;
};

export type EngagementImportParsedRow = {
  line: number;
  monitoringRow: EngagementMonitoringRow;
  rowKey: string;
  resources: ResolvedImportResources;
};

export type EngagementImportParseResult = {
  ok: boolean;
  error?: string;
  headerIndex: number;
  parsed: EngagementImportParsedRow[];
  skipped: EngagementImportSkippedRow[];
  warnings: Map<string, Set<EngagementImportResourceColumn>>;
};

export function satelliteNamesMatch(a: string, b: string): boolean {
  return (
    normalizeSatelliteName(a) === normalizeSatelliteName(b) ||
    canonicalSatelliteKey(a) === canonicalSatelliteKey(b)
  );
}

export function normalizeImportCell(value: string): string {
  return sanitizeForCsvExport(value).replace(/\s+/g, " ").trim();
}

export function normalizeEquipmentImportName(name: string): string {
  return normalizeImportCell(name).toLowerCase();
}

export function importPolarizationMatches(
  rowPolarization: string | undefined | null,
  importPolarization: string,
): boolean {
  const imported = normalizeImportCell(importPolarization);
  if (!imported || imported === "—" || imported === "-") return true;
  const rowPol = normalizeImportCell(rowPolarization ?? "—");
  const normalizedRow = !rowPol || rowPol === "—" ? "—" : rowPol;
  return normalizedRow.toLowerCase() === imported.toLowerCase();
}

export function importWarningKey(row: EngagementIntelRowRef): string {
  return engagementTableRowKey(row);
}

function isOtherResourcesCategory(name: string): boolean {
  return name.trim().toLowerCase() === "other resources";
}

export function equipmentMatchesImportColumn(
  e: EngagementImportEquipment,
  column: EngagementImportResourceColumn,
): boolean {
  const cat = (e.category?.name ?? "").toLowerCase();
  switch (column) {
    case "Antenna":
      return cat.includes("antenna");
    case "Demodulator":
      return cat.includes("demodulat");
    case "Other Resources":
      return isOtherResourcesCategory(e.category?.name ?? "");
    default:
      return false;
  }
}

export function resolveImportEquipmentNames(
  rawValue: string,
  column: EngagementImportResourceColumn,
  equipment: EngagementImportEquipment[],
  unitId: string,
): { ids: string[]; hasUnmatched: boolean } {
  const names = rawValue
    .split(",")
    .map((part) => normalizeImportCell(part))
    .filter(Boolean);
  if (!names.length) return { ids: [], hasUnmatched: false };

  const unitOperational = equipment.filter(
    (e) => e.unit_id === unitId && e.serviceability === "Operational",
  );

  const ids: string[] = [];
  let hasUnmatched = false;

  for (const name of names) {
    const normalized = normalizeEquipmentImportName(name);
    const eq = unitOperational.find(
      (e) =>
        equipmentMatchesImportColumn(e, column) &&
        normalizeEquipmentImportName(e.name ?? "") === normalized,
    );
    if (eq) {
      if (!ids.includes(eq.id)) ids.push(eq.id);
    } else {
      hasUnmatched = true;
    }
  }

  return { ids, hasUnmatched };
}

export function findImportHeaderIndex(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const first = (rows[i]?.[0] ?? "").trim();
    if (first.startsWith("#")) continue;
    if (rows[i]?.some((cell) => normalizeImportCell(cell).toLowerCase() === "satellite")) {
      return i;
    }
  }
  return -1;
}

export function validateEngagementImportHeaders(headers: string[]): string | null {
  const normalized = headers.map((h) => normalizeImportCell(h).toLowerCase());
  if (!normalized.includes("satellite")) {
    return 'Missing required "Satellite" column.';
  }
  const missing = ENGAGEMENT_IMPORT_RESOURCE_COLUMNS.filter(
    (col) => !normalized.includes(col.toLowerCase()),
  );
  if (missing.length > 0) {
    return `Missing required column(s): ${missing.join(", ")}. Download the template and match its headers exactly.`;
  }
  return null;
}

function getImportCell(record: Record<string, string>, column: string): string {
  const target = column.toLowerCase();
  const key = Object.keys(record).find((k) => normalizeImportCell(k).toLowerCase() === target);
  return key ? normalizeImportCell(record[key]) : "";
}

export function matchMonitoringRowForImport(
  satelliteRaw: string,
  polarizationRaw: string,
  monitoringRows: EngagementMonitoringRow[],
):
  | { ok: true; row: EngagementMonitoringRow }
  | { ok: false; reason: EngagementImportSkipReason; detail?: string } {
  const satellite = normalizeImportCell(satelliteRaw);
  if (!satellite) return { ok: false, reason: "empty_row" };

  const candidates = monitoringRows.filter((row) =>
    satelliteNamesMatch(row.satelliteName, satellite),
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "satellite_not_found",
      detail: `"${satellite}" is not in the Intelligence Repository scan table for this unit.`,
    };
  }

  const polRaw = normalizeImportCell(polarizationRaw);
  if (candidates.length > 1 && (!polRaw || polRaw === "—" || polRaw === "-")) {
    return {
      ok: false,
      reason: "polarization_required",
      detail: `${candidates.length} scan rows exist for "${satellite}" — fill the Polarization column (e.g. ${candidates.map((c) => c.polarization ?? "—").join(", ")}).`,
    };
  }

  const matched = candidates.filter((row) =>
    importPolarizationMatches(row.polarization, polarizationRaw),
  );

  if (matched.length === 0) {
    return {
      ok: false,
      reason: "polarization_mismatch",
      detail: `Polarization "${polRaw || "—"}" does not match any scan row for "${satellite}".`,
    };
  }

  if (matched.length > 1) {
    return {
      ok: false,
      reason: "ambiguous_match",
      detail: `Multiple scan rows match "${satellite}" with polarization "${polRaw}".`,
    };
  }

  return { ok: true, row: matched[0]! };
}

function recordFromRow(headers: string[], values: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, colIdx) => {
    record[normalizeImportCell(header)] = normalizeImportCell(values[colIdx] ?? "");
  });
  return record;
}

export function resolveImportResourcesFromRecord(
  record: Record<string, string>,
  equipment: EngagementImportEquipment[],
  unitId: string,
): ResolvedImportResources {
  const columnValues: { column: EngagementImportResourceColumn; raw: string }[] = [
    { column: "Antenna", raw: getImportCell(record, "Antenna") },
    { column: "Demodulator", raw: getImportCell(record, "Demodulator") },
    { column: "Other Resources", raw: getImportCell(record, "Other Resources") },
  ];

  const unmatchedColumns: EngagementImportResourceColumn[] = [];
  const resolved: Record<EngagementImportResourceColumn, string[]> = {
    Antenna: [],
    Demodulator: [],
    "Other Resources": [],
  };

  for (const { column, raw } of columnValues) {
    const { ids, hasUnmatched } = resolveImportEquipmentNames(raw, column, equipment, unitId);
    resolved[column] = column === "Antenna" ? ids.slice(0, 1) : ids;
    if (hasUnmatched) unmatchedColumns.push(column);
  }

  return {
    antennaIds: resolved.Antenna,
    demodIds: resolved.Demodulator,
    otherIds: resolved["Other Resources"],
    unmatchedColumns,
  };
}

export function parseEngagementImportGrid(
  rows: string[][],
  monitoringRows: EngagementMonitoringRow[],
  equipment: EngagementImportEquipment[],
  unitId: string,
): EngagementImportParseResult {
  const headerIndex = findImportHeaderIndex(rows);
  if (headerIndex < 0) {
    return {
      ok: false,
      error: "Could not find a header row with a Satellite column.",
      headerIndex: -1,
      parsed: [],
      skipped: [],
      warnings: new Map(),
    };
  }

  const headers = rows[headerIndex].map((cell) => normalizeImportCell(cell));
  const headerError = validateEngagementImportHeaders(headers);
  if (headerError) {
    return {
      ok: false,
      error: headerError,
      headerIndex,
      parsed: [],
      skipped: [],
      warnings: new Map(),
    };
  }

  const parsed: EngagementImportParsedRow[] = [];
  const skipped: EngagementImportSkippedRow[] = [];
  const warnings = new Map<string, Set<EngagementImportResourceColumn>>();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const values = rows[i] ?? [];
    const firstCell = normalizeImportCell(values[0] ?? "");
    if (!firstCell || firstCell.startsWith("#")) continue;

    const record = recordFromRow(headers, values);
    const satelliteRaw = getImportCell(record, "Satellite");
    const polarizationRaw = getImportCell(record, "Polarization");

    const match = matchMonitoringRowForImport(satelliteRaw, polarizationRaw, monitoringRows);
    if (!match.ok) {
      skipped.push({
        line: i + 1,
        satellite: satelliteRaw || firstCell,
        reason: match.reason,
        detail: match.detail,
      });
      continue;
    }

    const monitoringRow = match.row;
    const rowKey = importWarningKey(monitoringRow);
    const resources = resolveImportResourcesFromRecord(record, equipment, unitId);

    const matchedCount =
      resources.antennaIds.length +
      resources.demodIds.length +
      resources.otherIds.length;

    if (resources.unmatchedColumns.length > 0) {
      warnings.set(rowKey, new Set(resources.unmatchedColumns));
    }

    if (matchedCount === 0) {
      skipped.push({
        line: i + 1,
        satellite: monitoringRow.satelliteName,
        reason: "no_matched_resources",
        detail: resources.unmatchedColumns.length
          ? "Every resource name failed to match inventory — fix names or leave row blank."
          : "No resource columns filled — row skipped.",
      });
      continue;
    }

    parsed.push({
      line: i + 1,
      monitoringRow,
      rowKey,
      resources,
    });
  }

  return {
    ok: true,
    headerIndex,
    parsed,
    skipped,
    warnings,
  };
}

export async function readEngagementImportSpreadsheet(file: File): Promise<string[][]> {
  const validation = validateImportFile(file);
  if (!validation.ok) {
    throw new Error(validation.error ?? "Unsupported file format.");
  }
  const rows = await readSpreadsheetFile(file);
  if (!rows.length) {
    throw new Error("The file is empty.");
  }
  return rows;
}

export function downloadEngagementImportTemplate(
  unitCode: string,
  monitoringRows: { satelliteName: string; polarization?: string | null }[],
): void {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `SSACC-Engagement-Template-${unitCode}-${date}.csv`;
  const dataRows = monitoringRows.map((row) => [
    sanitizeForCsvExport(row.satelliteName),
    row.polarization && row.polarization !== "—"
      ? sanitizeForCsvExport(row.polarization)
      : "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const csv = buildCsv([...ENGAGEMENT_TEMPLATE_COLUMNS], dataRows, true);
  downloadCsv(filename, `${ENGAGEMENT_IMPORT_COMMENT}\n${csv}`);
}

const SKIP_REASON_LABELS: Record<EngagementImportSkipReason, string> = {
  empty_row: "empty row",
  satellite_not_found: "satellite not in INT scan table",
  polarization_required: "polarization required",
  polarization_mismatch: "polarization mismatch",
  ambiguous_match: "ambiguous satellite match",
  no_matched_resources: "no matched inventory names",
};

export function summarizeEngagementImportResult(
  importedCount: number,
  saveFailures: number,
  parseResult: EngagementImportParseResult,
): { message: string; variant: "success" | "warning" | "error" } {
  const unmatchedCells = [...parseResult.warnings.values()].reduce(
    (sum, cols) => sum + cols.size,
    0,
  );
  const skippedCount = parseResult.skipped.length;

  if (!parseResult.ok && parseResult.error) {
    return { message: parseResult.error, variant: "error" };
  }

  if (importedCount === 0 && saveFailures === 0 && skippedCount === 0) {
    return {
      message: "No data rows found in the file. Fill the template and try again.",
      variant: "warning",
    };
  }

  const parts: string[] = [];
  if (importedCount > 0) {
    parts.push(`${importedCount} row${importedCount === 1 ? "" : "s"} imported`);
  } else {
    parts.push("No rows imported");
  }
  if (unmatchedCells > 0) {
    parts.push(`${unmatchedCells} cell${unmatchedCells === 1 ? "" : "s"} had unmatched resource names`);
  }
  if (saveFailures > 0) {
    parts.push(`${saveFailures} row${saveFailures === 1 ? "" : "s"} failed to save`);
  }
  if (skippedCount > 0) {
    parts.push(`${skippedCount} row${skippedCount === 1 ? "" : "s"} skipped`);
  }

  const variant =
    importedCount > 0 && saveFailures === 0
      ? unmatchedCells > 0 || skippedCount > 0
        ? "warning"
        : "success"
      : "warning";

  return { message: parts.join("; ") + ".", variant };
}

export function formatEngagementImportSkipLog(skipped: EngagementImportSkippedRow[]): string {
  if (!skipped.length) return "";
  return skipped
    .slice(0, 8)
    .map((row) => {
      const label = SKIP_REASON_LABELS[row.reason] ?? row.reason;
      const detail = row.detail ? ` — ${row.detail}` : "";
      return `Line ${row.line} (${row.satellite || "?"}): ${label}${detail}`;
    })
    .join("\n");
}
