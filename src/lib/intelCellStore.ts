/** localStorage store for inline cell edits on the intelligence analysis drill-down page. */

import {
  isFrequencyOnlyImportRow,
  isSpuriousBandLabel,
} from "@/lib/intelSpreadsheetImport";

import { scheduleElectronStorageFlush } from "@/lib/electronPersist";

const STORAGE_KEY = "ssacc_intel_cell_edits";

export const INTEL_CELL_EDITS_EVENT = "ssacc-intel-cell-edits-change";

/** Edits for a single row — maps field name → overridden value. */
export type RowEdits = Record<string, string>;

/** Per-table storage: cell overrides + user-added rows. */
export type TableStore = {
  /** rowId → {field → value} overrides applied on top of computed data */
  cells: Record<string, RowEdits>;
  /** Rows the user added manually or imported (not in the original report) */
  extra: Array<{ id: string } & Record<string, string>>;
  /**
   * When true the computed (seeded) rows are hidden entirely;
   * only the rows in `extra` (imported / manually added) are shown.
   * Set automatically when the user imports data for this section.
   */
  importedMode?: boolean;
};

export type ScanSummaryEdits = {
  polarization?: string;
  totalScanned?: string;
  analyzed?: string;
  pending?: string;
  scanStartDate?: string;
};

export type SatelliteDetailEdits = {
  name?: string;
  originCountry?: string;
  launchDate?: string;
  orbitalPosition?: string;
  totalTransponders?: string;
};

/** Merged C-section summary — counts plus protocol names (replaces legacy C1/C2/C3 row tables). */
export type FrequencyAnalysisEdits = {
  productiveCount?: string;
  nonProductiveCount?: string;
  protocols?: string[];
  importedMode?: boolean;
};

export type ReportCellEdits = {
  satellite: SatelliteDetailEdits;
  scan: ScanSummaryEdits;
  /** @deprecated Legacy per-frequency rows — migrated into frequencyAnalysis when possible. */
  productive: TableStore;
  /** @deprecated Legacy per-frequency rows — migrated into frequencyAnalysis when possible. */
  nonProductive: TableStore;
  /** @deprecated Legacy per-frequency rows — migrated into frequencyAnalysis when possible. */
  novel: TableStore;
  frequencyAnalysis: FrequencyAnalysisEdits;
};

export type ImportTableKey = "productive" | "nonProductive" | "novel";

function emptyTableStore(): TableStore {
  return { cells: {}, extra: [] };
}

/** Remove persisted ghost rows (band labels, frequency-only entries). Keeps valid user rows. */
function sanitizeFrequencyExtraRow(
  row: { id: string } & Record<string, string>,
  kind: "productive" | "nonProductive" | "novel",
): boolean {
  if (kind === "novel") {
    const frequency = row.frequency?.trim() ?? "";
    if (!frequency || isSpuriousBandLabel(frequency)) return false;
    return !isFrequencyOnlyImportRow(
      { Frequency: frequency, Protocol: row.protocol ?? "", Remarks: row.remarks ?? "" },
      "Frequency",
      ["Protocol", "Remarks"],
    );
  }

  const frequencyId = row.frequencyId?.trim() ?? "";
  if (!frequencyId || isSpuriousBandLabel(frequencyId)) return false;

  if (kind === "productive") {
    return !isFrequencyOnlyImportRow(
      {
        "Frequency ID": frequencyId,
        "Output Type": row.outputType ?? "",
        "Details of Interception": row.details ?? "",
        Protocol: row.protocol ?? "",
      },
      "Frequency ID",
      ["Output Type", "Details of Interception", "Protocol"],
    );
  }

  return !isFrequencyOnlyImportRow(
    {
      "Frequency ID": frequencyId,
      Level: row.level ?? "",
      Protocol: row.protocol ?? "",
      Remarks: row.remarks ?? "",
    },
    "Frequency ID",
    ["Level", "Protocol", "Remarks"],
  );
}

function sanitizeTableStoreExtra(raw: Partial<TableStore> | undefined, kind: ImportTableKey): TableStore["extra"] {
  const extra = Array.isArray(raw?.extra) ? raw.extra : [];
  const seen = new Set<string>();
  const cleaned: TableStore["extra"] = [];

  for (const row of extra) {
    if (!row?.id || typeof row !== "object") continue;
    if (!sanitizeFrequencyExtraRow(row as { id: string } & Record<string, string>, kind)) continue;
    const key =
      kind === "novel"
        ? (row.frequency ?? "").trim().toLowerCase()
        : (row.frequencyId ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(row as TableStore["extra"][number]);
  }

  return cleaned;
}

function emptyFrequencyAnalysis(): FrequencyAnalysisEdits {
  return { protocols: [] };
}

function normalizeProtocols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function normalizeFrequencyAnalysis(
  raw: Partial<FrequencyAnalysisEdits> | undefined,
  legacy?: Partial<ReportCellEdits>,
): FrequencyAnalysisEdits {
  const hasNewData =
    raw &&
    (raw.productiveCount?.trim() ||
      raw.nonProductiveCount?.trim() ||
      (Array.isArray(raw.protocols) && raw.protocols.some((p) => typeof p === "string" && p.trim())));

  if (hasNewData) {
    return {
      productiveCount: raw?.productiveCount?.trim() ?? "",
      nonProductiveCount: raw?.nonProductiveCount?.trim() ?? "",
      protocols: normalizeProtocols(raw?.protocols),
      importedMode: raw?.importedMode === true,
    };
  }

  const legacyProd = legacy?.productive?.extra?.length ?? 0;
  const legacyNp = legacy?.nonProductive?.extra?.length ?? 0;
  const legacyProtocols = normalizeProtocols(
    (legacy?.novel?.extra ?? [])
      .map((row) => row.protocol ?? "")
      .filter(Boolean),
  );
  const legacyImported =
    legacy?.productive?.importedMode === true ||
    legacy?.nonProductive?.importedMode === true ||
    legacy?.novel?.importedMode === true;

  if (legacyProd || legacyNp || legacyProtocols.length || legacyImported) {
    return {
      productiveCount: legacyProd ? String(legacyProd) : "",
      nonProductiveCount: legacyNp ? String(legacyNp) : "",
      protocols: legacyProtocols,
      importedMode: legacyImported,
    };
  }

  return emptyFrequencyAnalysis();
}

export function emptyReportEdits(): ReportCellEdits {
  return {
    satellite: {},
    scan: {},
    productive: emptyTableStore(),
    nonProductive: emptyTableStore(),
    novel: emptyTableStore(),
    frequencyAnalysis: emptyFrequencyAnalysis(),
  };
}

/** Parse merged C-section spreadsheet rows into stored frequency analysis summary. */
export function parseFrequencyAnalysisImportRows(
  rows: Record<string, string>[],
): FrequencyAnalysisEdits {
  let productiveCount = "";
  let nonProductiveCount = "";
  const protocols: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const prod = (row["Productive Frequencies"] ?? "").trim();
    const np = (row["Non-Productive Frequencies"] ?? "").trim();
    const protocolCell = (row["Newly Encountered Protocols"] ?? "").trim();

    if (prod && !productiveCount) productiveCount = prod;
    if (np && !nonProductiveCount) nonProductiveCount = np;

    if (!protocolCell) continue;
    for (const part of protocolCell.split(/[;\n\r]+/)) {
      const protocol = part.trim();
      if (!protocol) continue;
      const key = protocol.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      protocols.push(protocol);
    }
  }

  return { productiveCount, nonProductiveCount, protocols, importedMode: true };
}

function normalizeTableStore(
  raw: Partial<TableStore> | undefined,
  kind: ImportTableKey,
): TableStore {
  const extra = sanitizeTableStoreExtra(raw, kind);
  return {
    cells: raw?.cells ?? {},
    extra,
    // Stale importedMode with empty extra (e.g. after bad sanitize) must not trigger metric wipes.
    importedMode: raw?.importedMode === true && extra.length > 0,
  };
}

function normalizeReportEdits(raw: Partial<ReportCellEdits> | undefined): ReportCellEdits {
  if (!raw) return emptyReportEdits();
  const productive = normalizeTableStore(raw.productive, "productive");
  const nonProductive = normalizeTableStore(raw.nonProductive, "nonProductive");
  const novel = normalizeTableStore(raw.novel, "novel");
  return {
    satellite: raw.satellite ?? {},
    scan: raw.scan ?? {},
    productive,
    nonProductive,
    novel,
    frequencyAnalysis: normalizeFrequencyAnalysis(raw.frequencyAnalysis, raw),
  };
}

function loadAll(): Record<string, ReportCellEdits> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      Partial<ReportCellEdits>
    >;
    const out: Record<string, ReportCellEdits> = {};
    for (const [id, edits] of Object.entries(parsed)) {
      out[id] = normalizeReportEdits(edits);
    }
    return out;
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, ReportCellEdits>): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    scheduleElectronStorageFlush();
    return true;
  } catch {
    return false;
  }
}

function notifyChange(reportId: string) {
  window.dispatchEvent(
    new CustomEvent(INTEL_CELL_EDITS_EVENT, { detail: { reportId } }),
  );
}

export function getReportCellEdits(reportId: string): ReportCellEdits {
  const all = loadAll();
  return all[reportId] ?? emptyReportEdits();
}

export function setReportCellEdits(reportId: string, edits: ReportCellEdits): boolean {
  const all = loadAll();
  all[reportId] = normalizeReportEdits(edits);
  const ok = saveAll(all);
  if (ok) notifyChange(reportId);
  return ok;
}

export function patchReportTableImport(
  reportId: string,
  table: ImportTableKey,
  extra: TableStore["extra"],
): ReportCellEdits {
  const current = getReportCellEdits(reportId);
  const next: ReportCellEdits = {
    ...current,
    [table]: { cells: {}, extra, importedMode: true },
  };
  setReportCellEdits(reportId, next);
  return next;
}

export function removeReportCellEdits(reportId: string) {
  const all = loadAll();
  delete all[reportId];
  saveAll(all);
  notifyChange(reportId);
}

/** Move drill-down edits when a satellite row is renamed in the INT unit table. */
export function renameReportCellEdits(
  oldReportId: string,
  newReportId: string,
  newSatelliteName?: string,
): void {
  if (oldReportId === newReportId && !newSatelliteName) return;
  const all = loadAll();
  const edits = all[oldReportId];
  if (!edits) return;
  delete all[oldReportId];
  if (newSatelliteName) {
    edits.satellite = { ...edits.satellite, name: newSatelliteName };
  }
  all[newReportId] = normalizeReportEdits({
    ...all[newReportId],
    ...edits,
    satellite: { ...all[newReportId]?.satellite, ...edits.satellite },
  });
  saveAll(all);
  notifyChange(newReportId);
}

/** Strip ghost frequency rows from persisted drill-down imports (EXE / offline storage). */
export function sanitizeIntelCellEditsStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Partial<ReportCellEdits>>;
    const sanitized: Record<string, ReportCellEdits> = {};
    for (const [id, edits] of Object.entries(parsed)) {
      sanitized[id] = normalizeReportEdits(edits);
    }
    const next = JSON.stringify(sanitized);
    if (next !== raw) saveAll(sanitized);
  } catch {
    /* ignore corrupt storage */
  }
}
