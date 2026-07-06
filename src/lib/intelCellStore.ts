/** localStorage store for inline cell edits on the intelligence analysis drill-down page. */

const STORAGE_KEY = "ssacc_intel_cell_edits";

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

function loadAll(): Record<string, ReportCellEdits> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, ReportCellEdits>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export function getReportCellEdits(reportId: string): ReportCellEdits {
  const all = loadAll();
  return all[reportId] ?? emptyReportEdits();
}

export function setReportCellEdits(reportId: string, edits: ReportCellEdits) {
  const all = loadAll();
  all[reportId] = edits;
  saveAll(all);
}

export function removeReportCellEdits(reportId: string) {
  const all = loadAll();
  delete all[reportId];
  saveAll(all);
}
