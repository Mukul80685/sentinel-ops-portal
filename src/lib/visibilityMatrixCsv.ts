/**
 * Satellite Visibility Matrix CSV — shared export/import format.
 * Columns match the region satellite table (excluding # and Edit).
 */
import type { GeoSatellite } from "@/lib/visibilityMatrix";
import { parseCsvLine } from "@/lib/dataTableUtils";

export { parseCsvLine };

export const VISIBILITY_MATRIX_CSV_HEADERS = [
  "Satellite",
  "Orbital Position",
  "Launch",
  "Transponders",
  "Beams",
  "Visible Beams",
] as const;

/** Strip BOM and normalize punctuation from Excel / legacy exports. */
export function normalizeVisibilityCsvCell(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\u00C2\u00B7/g, ";")
    .replace(/\u00C2\u00B0/g, "°")
    .replace(/â€[\u201C\u201D-]/g, "-")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00B7|\u2022/g, ";")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
}

/** Split a compound table cell on semicolons (also accepts legacy middle-dot separators). */
export function splitVisibilityDetailParts(cell: string): string[] {
  const norm = normalizeVisibilityCsvCell(cell)
    .replace(/\s*·\s*/g, ";")
    .replace(/\s*;\s*/g, ";");
  return norm
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateVisibilityMatrixCsvHeader(headers: string[]): { ok: boolean; error?: string } {
  const norm = headers.map((h) => normalizeVisibilityCsvCell(h).toLowerCase());
  const expected = VISIBILITY_MATRIX_CSV_HEADERS.map((h) => h.toLowerCase());

  if (norm.length < 6) {
    return {
      ok: false,
      error:
        "Invalid CSV format. Expected 6 columns: Satellite, Orbital Position, Launch, Transponders, Beams, Visible Beams.",
    };
  }

  const slice = norm.slice(0, 6);
  if (!slice.every((h, i) => h === expected[i])) {
    return {
      ok: false,
      error: `Invalid header row. Expected: ${VISIBILITY_MATRIX_CSV_HEADERS.join(", ")}.`,
    };
  }

  return { ok: true };
}

export function parseSatelliteImportCell(cell: string): { name: string; orbitType: string } {
  const raw = normalizeVisibilityCsvCell(cell);
  if (!raw) return { name: "", orbitType: "GEO" };

  const paren = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    return { name: paren[1].trim(), orbitType: paren[2].trim().toUpperCase() || "GEO" };
  }

  const parts = splitVisibilityDetailParts(raw);
  if (parts.length >= 2 && /^(GEO|LEO|MEO)$/i.test(parts[1])) {
    return { name: parts[0], orbitType: parts[1].toUpperCase() };
  }

  return { name: raw, orbitType: "GEO" };
}

export function parseLaunchImportCell(cell: string): string {
  const t = normalizeVisibilityCsvCell(cell);
  if (!t) return "—";
  if (/^\d{4}$/.test(t)) return `${t}-01-01`;
  return t;
}

export function parseTranspondersImportCell(cell: string): {
  cBand?: string;
  kuBand?: string;
  transponders: string;
} {
  const parts = splitVisibilityDetailParts(cell);
  if (parts.length === 0) return { transponders: "—" };

  let cBand: string | undefined;
  let kuBand: string | undefined;

  for (const p of parts.slice(1)) {
    const cMatch = p.match(/^(\d+)\s+C(?:\b|-)/i);
    const kuMatch = p.match(/^(\d+)\s+Ku(?:\b|-)/i);
    if (cMatch) cBand = cMatch[1];
    if (kuMatch) kuBand = kuMatch[1];
  }

  if (!cBand && !kuBand && parts.length === 1) {
    return { transponders: parts[0] };
  }

  const segments = [
    cBand ? `${cBand} C-band` : "",
    kuBand ? `${kuBand} Ku-band` : "",
  ].filter(Boolean);

  return {
    cBand,
    kuBand,
    transponders: segments.length > 0 ? segments.join(" / ") : parts[0] || "—",
  };
}

export function parseBeamsImportCell(cell: string): string[] {
  const parts = splitVisibilityDetailParts(cell);
  if (parts.length <= 1) return [];

  const firstNum = parseInt(parts[0], 10);
  if (Number.isNaN(firstNum)) return parts;

  return parts.slice(1);
}

export function parseVisibleBeamsImportCell(cell: string): {
  visibilityNotes: string;
  beamEirp: Record<string, number>;
} {
  const raw = normalizeVisibilityCsvCell(cell);
  if (!raw || raw === "-" || raw === "—") {
    return { visibilityNotes: "", beamEirp: {} };
  }

  const parts = splitVisibilityDetailParts(raw);
  const beamEirp: Record<string, number> = {};
  const labels: string[] = [];

  for (const part of parts) {
    const m = part.match(/^(.+?)\s*\(EIRP\s+(\d+)\s*dBW\)\s*$/i);
    if (m) {
      const name = m[1].trim();
      labels.push(`${name} (EIRP ${m[2]} dBW)`);
      beamEirp[name] = parseInt(m[2], 10);
    } else {
      labels.push(part);
    }
  }

  return {
    visibilityNotes: labels.join("; "),
    beamEirp,
  };
}

/** Parse one CSV data row into a GeoSatellite for overlay import. */
export function parseVisibilityMatrixRow(
  cells: string[],
  regionId: string,
  rowIndex: number,
): GeoSatellite | null {
  if (cells.length < 6) return null;

  const satelliteCell = cells[0] ?? "";
  const positionCell = cells[1] ?? "";
  const launchCell = cells[2] ?? "";
  const transpondersCell = cells[3] ?? "";
  const beamsCell = cells[4] ?? "";
  const visibleCell = cells[5] ?? "";

  const { name, orbitType } = parseSatelliteImportCell(satelliteCell);
  if (!name) return null;

  const tp = parseTranspondersImportCell(transpondersCell);
  const beams = parseBeamsImportCell(beamsCell);
  const vis = parseVisibleBeamsImportCell(visibleCell);

  return {
    id: `${regionId}-csv-${Date.now()}-${rowIndex}`,
    name,
    orbitType,
    position: normalizeVisibilityCsvCell(positionCell) || "—",
    launchDate: parseLaunchImportCell(launchCell),
    transponders: tp.transponders,
    cBandTransponders: tp.cBand,
    kuBandTransponders: tp.kuBand,
    beamCoverage: "—",
    beams: beams.length > 0 ? beams : undefined,
    visibilityNotes: vis.visibilityNotes || undefined,
    beamEirp: Object.keys(vis.beamEirp).length > 0 ? vis.beamEirp : undefined,
  };
}
