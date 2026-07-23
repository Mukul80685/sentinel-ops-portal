/** Shared CSV / Excel parsing for intelligence analysis imports. */

export function coerceSpreadsheetCell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  return String(value).replace(/^\uFEFF/, "").trim();
}

export function normalizeSpreadsheetHeader(value: unknown): string {
  return coerceSpreadsheetCell(value);
}

function parseCsvRows(text: string): unknown[][] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cells.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

export async function parseIntelSpreadsheet(file: File): Promise<unknown[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const hasUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    const text = new TextDecoder(hasUtf8Bom ? "utf-8" : "windows-1252").decode(buf);
    return parseCsvRows(hasUtf8Bom ? text.slice(1) : text);
  }
  const { read, utils } = await import("xlsx");
  const wb = read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  return utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  }) as unknown[][];
}

/** Band / transponder labels that must never become Frequency ID rows. */
const BAND_LABEL_RE =
  /^(?:\d+\s*)?(?:c|ku|ka|x)(?:[- ]?band)?(?:\s*\/\s*(?:c|ku|ka|x)(?:[- ]?band)?)?$/i;
const TRANSPONDER_SUMMARY_RE =
  /^\d+\s*(?:c|ku|ka|x)[-/+\s\\]?(?:\d+\s*)?(?:c|ku|ka|x)?[- ]?band/i;
const POLARIZATION_ONLY_RE = /^(?:c|ku|ka|x)[-/ ]?(?:hh|hl|vh|vl)$/i;

/** True when a cell value is a band label, not an operational frequency ID. */
export function isSpuriousBandLabel(value: string): boolean {
  const v = coerceSpreadsheetCell(value);
  if (!v) return true;
  const lower = v.toLowerCase();
  if (BAND_LABEL_RE.test(lower)) return true;
  if (TRANSPONDER_SUMMARY_RE.test(lower)) return true;
  if (POLARIZATION_ONLY_RE.test(v)) return true;
  if (/^c\/ku|^ku\/c/i.test(lower)) return true;
  return false;
}

/** Row has a frequency column filled but every other mapped column is blank. */
export function isFrequencyOnlyImportRow(
  record: Record<string, string>,
  freqHeader: string,
  otherHeaders: readonly string[],
): boolean {
  const freq = coerceSpreadsheetCell(record[freqHeader]);
  if (!freq) return true;
  return otherHeaders.every((header) => !coerceSpreadsheetCell(record[header]));
}

/**
 * Drop ghost rows from productive / non-productive frequency imports:
 * blank IDs, band labels (e.g. "C-band"), and frequency-only rows with no other data.
 */
export function filterFrequencyImportRecords(
  records: Record<string, string>[],
  expectedHeaders: readonly string[],
  freqHeader = "Frequency ID",
): Record<string, string>[] {
  const others = expectedHeaders.filter((header) => header !== freqHeader);
  const seen = new Set<string>();
  const kept: Record<string, string>[] = [];

  for (const record of records) {
    const freq = coerceSpreadsheetCell(record[freqHeader]);
    if (!freq || isSpuriousBandLabel(freq)) continue;
    if (isFrequencyOnlyImportRow(record, freqHeader, others)) continue;
    const key = freq.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(record);
  }

  return kept;
}

export class SpreadsheetHeaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetHeaderError";
  }
}

export function validateSpreadsheetHeaders(
  grid: unknown[][],
  expectedHeaders: readonly string[],
): void {
  const fileHeaders = (grid[0] ?? []).map(normalizeSpreadsheetHeader);
  for (let i = 0; i < expectedHeaders.length; i++) {
    const expected = expectedHeaders[i]!;
    const got = fileHeaders[i] ?? "";
    if (got !== expected) {
      throw new SpreadsheetHeaderError(
        got
          ? `Column ${i + 1} is labelled "${got}" — it should be "${expected}".`
          : `Column ${i + 1} is missing — it should be "${expected}".`,
      );
    }
  }
}

/** True when a data row matches the downloadable template example row exactly. */
export function isTemplateExampleRecord(
  record: Record<string, string>,
  expectedHeaders: readonly string[],
  templateExample?: readonly string[],
): boolean {
  if (!templateExample?.length) return false;
  return expectedHeaders.every((header, i) => {
    const cell = coerceSpreadsheetCell(record[header]).toLowerCase();
    const sample = coerceSpreadsheetCell(templateExample[i] ?? "").toLowerCase();
    return cell === sample;
  });
}

export function gridToRecords(
  grid: unknown[][],
  expectedHeaders: readonly string[],
  options?: { validateHeaders?: boolean; templateExample?: readonly string[] },
): Record<string, string>[] {
  if (grid.length < 2) return [];

  if (options?.validateHeaders !== false) {
    validateSpreadsheetHeaders(grid, expectedHeaders);
  }

  return grid
    .slice(1)
    .filter((row) => (row ?? []).some((c) => coerceSpreadsheetCell(c) !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      for (let i = 0; i < expectedHeaders.length; i++) {
        record[expectedHeaders[i]!] = coerceSpreadsheetCell(row?.[i]);
      }
      return record;
    })
    .filter((record) => !isTemplateExampleRecord(record, expectedHeaders, options?.templateExample));
}
