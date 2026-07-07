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
  return utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false }) as unknown[][];
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

export function gridToRecords(
  grid: unknown[][],
  expectedHeaders: readonly string[],
  options?: { validateHeaders?: boolean },
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
    });
}
