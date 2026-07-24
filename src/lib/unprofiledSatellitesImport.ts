import {
  buildCsv,
  downloadCsv,
  readSpreadsheetFile,
  validateImportFile,
} from "@/lib/dataTableUtils";
import {
  UNPROFILED_SATELLITE_COLUMNS,
  type UnprofiledSatellite,
  type UnprofiledSatelliteDraft,
  listUnprofiledSatellites,
  replaceUnprofiledSatellites,
} from "@/lib/unprofiledSatellitesStore";

export { UNPROFILED_SATELLITE_COLUMNS };

const TEMPLATE_FILENAME = "unprofiled-satellites-template.csv";

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => !c.trim());
}

export function validateUnprofiledSatellitesHeaders(headers: string[]): string | null {
  if (headers.length !== UNPROFILED_SATELLITE_COLUMNS.length) {
    return `Expected exactly ${UNPROFILED_SATELLITE_COLUMNS.length} columns in this order: ${UNPROFILED_SATELLITE_COLUMNS.join(", ")}.`;
  }

  for (let i = 0; i < UNPROFILED_SATELLITE_COLUMNS.length; i++) {
    const expected = UNPROFILED_SATELLITE_COLUMNS[i];
    const actual = (headers[i] ?? "").trim();
    if (actual !== expected) {
      return `Column ${i + 1} must be "${expected}" (found "${actual || "(empty)"}"). Import failed.`;
    }
  }

  return null;
}

export function downloadUnprofiledSatellitesTemplate(): void {
  const csv = buildCsv([...UNPROFILED_SATELLITE_COLUMNS], []);
  downloadCsv(TEMPLATE_FILENAME, csv);
}

export type UnprofiledSatellitesImportResult =
  | { ok: true; imported: number; total: number }
  | { ok: false; error: string };

export async function importUnprofiledSatellitesFile(
  file: File,
  mode: "append" | "replace" = "append",
): Promise<UnprofiledSatellitesImportResult> {
  const fileCheck = validateImportFile(file);
  if (!fileCheck.ok) {
    return { ok: false, error: fileCheck.error ?? "Unsupported file." };
  }

  let rows: string[][];
  try {
    rows = await readSpreadsheetFile(file);
  } catch {
    return { ok: false, error: "Could not read the file. Ensure it is a valid CSV or Excel workbook." };
  }

  if (rows.length === 0) {
    return { ok: false, error: "The file is empty." };
  }

  const headerRow = rows[0].map((c) => c.trim());
  const headerError = validateUnprofiledSatellitesHeaders(headerRow);
  if (headerError) {
    return { ok: false, error: headerError };
  }

  const parsed: UnprofiledSatellite[] = [];
  const seenNames = new Set<string>();
  const existing = mode === "append" ? listUnprofiledSatellites() : [];
  const existingNames = new Set(existing.map((r) => normalizeName(r.satelliteName)));

  for (let lineIndex = 1; lineIndex < rows.length; lineIndex++) {
    const raw = rows[lineIndex] ?? [];
    if (isBlankRow(raw)) continue;

    if (raw.length !== UNPROFILED_SATELLITE_COLUMNS.length) {
      return {
        ok: false,
        error: `Row ${lineIndex + 1} must have exactly ${UNPROFILED_SATELLITE_COLUMNS.length} columns.`,
      };
    }

    const draft: UnprofiledSatelliteDraft = {
      satelliteName: raw[0]?.trim() ?? "",
      countryOfOrigin: raw[1]?.trim() ?? "",
      dateOfLaunch: raw[2]?.trim() ?? "",
      orbitalPosition: raw[3]?.trim() ?? "",
    };

    if (!draft.satelliteName) {
      return { ok: false, error: `Row ${lineIndex + 1}: Satellite Name is required.` };
    }

    const nameKey = normalizeName(draft.satelliteName);
    if (seenNames.has(nameKey)) {
      return {
        ok: false,
        error: `Row ${lineIndex + 1}: duplicate satellite "${draft.satelliteName}" in the import file.`,
      };
    }
    if (existingNames.has(nameKey)) {
      return {
        ok: false,
        error: `Row ${lineIndex + 1}: satellite "${draft.satelliteName}" already exists.`,
      };
    }

    seenNames.add(nameKey);
    parsed.push({
      id: crypto.randomUUID(),
      ...draft,
    });
  }

  if (parsed.length === 0) {
    return { ok: false, error: "No data rows found. Add rows below the header row and try again." };
  }

  const merged = mode === "append" ? [...existing, ...parsed] : parsed;
  replaceUnprofiledSatellites(merged);

  return { ok: true, imported: parsed.length, total: merged.length };
}
