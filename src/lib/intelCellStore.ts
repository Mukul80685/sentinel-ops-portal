/** localStorage store for inline cell edits on the intelligence analysis drill-down page. */

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

export function emptyReportEdits(): ReportCellEdits {
  return {
    satellite: {},
    scan: {},
    productive: emptyTableStore(),
    nonProductive: emptyTableStore(),
    novel: emptyTableStore(),
  };
}

function normalizeTableStore(raw: Partial<TableStore> | undefined): TableStore {
  const extra = Array.isArray(raw?.extra) ? raw.extra : [];
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
    productive: normalizeTableStore(raw.productive),
    nonProductive: normalizeTableStore(raw.nonProductive),
    novel: normalizeTableStore(raw.novel),
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
