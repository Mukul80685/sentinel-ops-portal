/**
 * Shared data-table utilities
 * Used identically by Satellite Visibility Metrics and Important Frequencies.
 */

/** File input `accept` attribute — CSV and Excel across import surfaces. */
export const ACCEPTED_SPREADSHEET_ACCEPT = ".csv,.xlsx,.xls,text/csv";

const SPREADSHEET_EXTENSIONS = new Set(["csv", "xlsx", "xls"]);

export function getSpreadsheetExtension(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export function isSpreadsheetFile(file: File): boolean {
  return SPREADSHEET_EXTENSIONS.has(getSpreadsheetExtension(file));
}

// ─── File import validation ───────────────────────────────────────────────────

/**
 * Validates a file selected for import.
 * Only CSV and Excel formats are accepted.
 */
export function validateImportFile(file: File): { ok: boolean; error?: string } {
  if (isSpreadsheetFile(file)) return { ok: true };
  return {
    ok: false,
    error: "Unsupported file format. Please upload a CSV or Excel (.xlsx / .xls) file.",
  };
}

// ─── Spreadsheet import parsing ───────────────────────────────────────────────

/** Parse one CSV line (handles quoted fields and escaped quotes). */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      current += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") {
        result.push(current);
        current = "";
      } else current += char;
    }
  }
  result.push(current);
  return result.map((c) => c.replace(/^\uFEFF/, "").trim());
}

/** Parse CSV text into rows of string cells. */
export function parseCsvTextToRows(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map(parseCsvLine);
}

/**
 * Read a CSV or Excel upload into a 2-D string matrix (first row = headers).
 * Uses the first worksheet for Excel files.
 */
export async function readSpreadsheetFile(file: File): Promise<string[][]> {
  const ext = getSpreadsheetExtension(file);

  if (ext === "csv") {
    const text = await file.text();
    return parseCsvTextToRows(text);
  }

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    });
    return rows
      .map((r) => (Array.isArray(r) ? r : []).map((c) => String(c ?? "").trim()))
      .filter((r) => r.some((c) => c.length > 0));
  }

  return [];
}

// ─── CSV generation ───────────────────────────────────────────────────────────

/** Wraps a cell value in quotes, escaping any internal quotes. */
function escCsv(v: string | number | null | undefined): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/**
 * Normalize text for CSV export — ASCII-safe separators and punctuation so
 * Excel on Windows does not show mojibake (e.g. Â·, â€“) when UTF-8 is misread.
 */
export function sanitizeForCsvExport(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00B7|\u2022/g, ";")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*;\s*/g, "; ")
    .replace(/;\s*;/g, ";")
    .trim();
}

/**
 * Build a properly-escaped CSV string.
 * @param headers  Column header labels.
 * @param rows     2-D array of cell values.
 * @param asciiSafe  When true, normalizes Unicode punctuation in every cell.
 */
export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  asciiSafe = false,
): string {
  const cell = (v: string | number | null | undefined) =>
    escCsv(asciiSafe && typeof v === "string" ? sanitizeForCsvExport(v) : v);
  return [
    headers.map(cell).join(","),
    ...rows.map((r) => r.map(cell).join(",")),
  ].join("\n");
}

// ─── Browser download ─────────────────────────────────────────────────────────

/** Triggers a browser "Save as" download for a CSV string (UTF-8 with BOM for Excel). */
export function downloadCsv(filename: string, csv: string): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
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
