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

export type ReportCellEdits = {
  satellite: SatelliteDetailEdits;
  scan: ScanSummaryEdits;
  productive: TableStore;
  nonProductive: TableStore;
  novel: TableStore;
};

export type ImportTableKey = "productive" | "nonProductive" | "novel";

function emptyTableStore(): TableStore {
  return { cells: {}, extra: [] };
}

const PRODUCTIVE_EXTRA_FIELDS = ["outputType", "details", "protocol"] as const;
const NON_PRODUCTIVE_EXTRA_FIELDS = ["level", "protocol", "remarks"] as const;
const NOVEL_EXTRA_FIELDS = ["protocol", "remarks"] as const;

/** Remove persisted ghost rows (band labels, frequency-only entries). */
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
  const otherFields =
    kind === "productive" ? PRODUCTIVE_EXTRA_FIELDS : NON_PRODUCTIVE_EXTRA_FIELDS;
  return otherFields.some((field) => (row[field] ?? "").trim().length > 0);
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

export function emptyReportEdits(): ReportCellEdits {
  return {
    satellite: {},
    scan: {},
    productive: emptyTableStore(),
    nonProductive: emptyTableStore(),
    novel: emptyTableStore(),
  };
}

function normalizeTableStore(
  raw: Partial<TableStore> | undefined,
  kind: ImportTableKey,
): TableStore {
  const extra = sanitizeTableStoreExtra(raw, kind);
  return {
    cells: raw?.cells ?? {},
    extra,
    importedMode: raw?.importedMode === true || extra.length > 0,
  };
}

function normalizeReportEdits(raw: Partial<ReportCellEdits> | undefined): ReportCellEdits {
  if (!raw) return emptyReportEdits();
  return {
    satellite: raw.satellite ?? {},
    scan: raw.scan ?? {},
    productive: normalizeTableStore(raw.productive, "productive"),
    nonProductive: normalizeTableStore(raw.nonProductive, "nonProductive"),
    novel: normalizeTableStore(raw.novel, "novel"),
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
