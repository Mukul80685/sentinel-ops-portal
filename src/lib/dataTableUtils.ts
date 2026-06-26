/**
 * Shared data-table utilities
 * Used identically by Satellite Visibility Metrics and Important Frequencies.
 */

// ─── File import validation ───────────────────────────────────────────────────

/**
 * Validates a file selected for import.
 * Only CSV and Excel formats are accepted.
 */
export function validateImportFile(file: File): { ok: boolean; error?: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["csv", "xlsx", "xls"].includes(ext)) return { ok: true };
  return {
    ok: false,
    error: "Unsupported file format. Please upload a CSV or Excel file.",
  };
}

// ─── CSV generation ───────────────────────────────────────────────────────────

/** Wraps a cell value in quotes, escaping any internal quotes. */
function escCsv(v: string | number | null | undefined): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/**
 * Build a properly-escaped CSV string.
 * @param headers  Column header labels.
 * @param rows     2-D array of cell values.
 */
export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  return [
    headers.map(escCsv).join(","),
    ...rows.map((r) => r.map(escCsv).join(",")),
  ].join("\n");
}

// ─── Browser download ─────────────────────────────────────────────────────────

/** Triggers a browser "Save as" download for a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Triggers Excel download from headers + rows. */
export function downloadExcel(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  // Dynamic import keeps bundle lean for non-export paths
  import("xlsx").then((XLSX) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export");
    XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
  });
}

// ─── Checkbox helpers ─────────────────────────────────────────────────────────

/** Toggle a single id in a selection Set (immutably). */
export function toggleSelection<T>(set: Set<T>, id: T): Set<T> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Return true if every id in `visibleIds` is present in `selection`. */
export function allSelected<T>(visibleIds: T[], selection: Set<T>): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));
}
