import {
  buildCsv,
  downloadCsv,
  readSpreadsheetFile,
  validateImportFile,
} from "@/lib/dataTableUtils";
import {
  BEIDOU_EQUIPMENT_COLUMNS,
  type BeidouEquipmentDraft,
  type BeidouEquipmentRow,
  listBeidouEquipment,
  replaceBeidouEquipment,
} from "@/lib/beidouStore";

export { BEIDOU_EQUIPMENT_COLUMNS };

const TEMPLATE_FILENAME = "beidou-equipment-template.csv";

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => !c.trim());
}

export function validateBeidouEquipmentHeaders(headers: string[]): string | null {
  if (headers.length !== BEIDOU_EQUIPMENT_COLUMNS.length) {
    return `Expected exactly ${BEIDOU_EQUIPMENT_COLUMNS.length} columns in this order: ${BEIDOU_EQUIPMENT_COLUMNS.join(", ")}.`;
  }

  for (let i = 0; i < BEIDOU_EQUIPMENT_COLUMNS.length; i++) {
    const expected = BEIDOU_EQUIPMENT_COLUMNS[i];
    const actual = (headers[i] ?? "").trim();
    if (actual !== expected) {
      return `Column ${i + 1} must be "${expected}" (found "${actual || "(empty)"}"). Import failed.`;
    }
  }

  return null;
}

export function downloadBeidouEquipmentTemplate(): void {
  const csv = buildCsv([...BEIDOU_EQUIPMENT_COLUMNS], []);
  downloadCsv(TEMPLATE_FILENAME, csv);
}

export type BeidouEquipmentImportResult =
  | { ok: true; imported: number; total: number }
  | { ok: false; error: string };

export async function importBeidouEquipmentFile(
  file: File,
  mode: "append" | "replace" = "append",
): Promise<BeidouEquipmentImportResult> {
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
  const headerError = validateBeidouEquipmentHeaders(headerRow);
  if (headerError) {
    return { ok: false, error: headerError };
  }

  const parsed: BeidouEquipmentRow[] = [];
  const existing = mode === "append" ? listBeidouEquipment() : [];

  for (let lineIndex = 1; lineIndex < rows.length; lineIndex++) {
    const raw = rows[lineIndex] ?? [];
    if (isBlankRow(raw)) continue;

    if (raw.length !== BEIDOU_EQUIPMENT_COLUMNS.length) {
      return {
        ok: false,
        error: `Row ${lineIndex + 1} must have exactly ${BEIDOU_EQUIPMENT_COLUMNS.length} columns.`,
      };
    }

    const draft: BeidouEquipmentDraft = {
      equipmentName: raw[0]?.trim() ?? "",
      serialNumber: raw[1]?.trim() ?? "",
      serviceability: raw[2]?.trim() ?? "",
    };

    if (!draft.equipmentName) {
      return { ok: false, error: `Row ${lineIndex + 1}: Equipment is required.` };
    }

    parsed.push({
      id: crypto.randomUUID(),
      ...draft,
    });
  }

  if (parsed.length === 0) {
    return { ok: false, error: "No data rows found. Add rows below the header row and try again." };
  }

  const merged = mode === "append" ? [...existing, ...parsed] : parsed;
  replaceBeidouEquipment(merged);

  return { ok: true, imported: parsed.length, total: merged.length };
}
