/**
 * Timezone-safe launch date normalization for Satellite Visibility Matrix.
 * Date-only values are stored and displayed as YYYY-MM-DD without UTC shifts.
 */

const EMPTY_MARKERS = new Set(["", "—", "-", "n/a", "na"]);

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MONTH_NAMES_LOWER = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDateString(y: number, m: number, d: number): string | null {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function isEmptyLaunchDate(value: string | undefined | null): boolean {
  const t = String(value ?? "").trim().toLowerCase();
  return EMPTY_MARKERS.has(t);
}

/** Canonical YYYY-MM-DD or "—" for storage. */
export function normalizeLaunchDateForStorage(raw: string | undefined | null): string {
  const str = String(raw ?? "").trim();
  if (isEmptyLaunchDate(str)) return "—";

  // ISO date-only (allow trailing time from legacy saves)
  const isoPrefix = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    const iso = toIsoDateString(
      Number(isoPrefix[1]),
      Number(isoPrefix[2]),
      Number(isoPrefix[3]),
    );
    if (iso) return iso;
  }

  // Year only
  if (/^\d{4}$/.test(str)) return `${str}-01-01`;

  // Excel serial number (string or number-like)
  const numVal = Number(str);
  if (!Number.isNaN(numVal) && numVal > 1 && numVal < 2_958_466) {
    const ms = EXCEL_EPOCH_MS + Math.round(numVal) * 86_400_000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const iso = toIsoDateString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      if (iso) return iso;
    }
  }

  // ISO with slashes: YYYY/MM/DD
  const isoSlash = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoSlash) {
    const iso = toIsoDateString(+isoSlash[1], +isoSlash[2], +isoSlash[3]);
    if (iso) return iso;
  }

  // Compact YYYYMMDD
  const compact = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const iso = toIsoDateString(+compact[1], +compact[2], +compact[3]);
    if (iso) return iso;
  }

  // Named month: DD-Mon-YYYY or DD Mon YYYY
  const named = str.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (named) {
    const mIdx = MONTH_NAMES_LOWER.indexOf(named[2].slice(0, 3).toLowerCase());
    if (mIdx !== -1) {
      const iso = toIsoDateString(+named[3], mIdx + 1, +named[1]);
      if (iso) return iso;
    }
  }

  // Numeric with separator: MM/DD/YYYY or DD/MM/YYYY
  const numeric = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numeric) {
    let y = numeric[3];
    if (y.length === 2) y = `20${y}`;
    const a = +numeric[1];
    const b = +numeric[2];
    const year = +y;

    if (a > 12) {
      const iso = toIsoDateString(year, b, a);
      if (iso) return iso;
    }
    if (b > 12) {
      const iso = toIsoDateString(year, a, b);
      if (iso) return iso;
    }
    const iso = toIsoDateString(year, a, b);
    if (iso) return iso;
  }

  return str;
}

/** Value for `<input type="date">` — empty when unknown. */
export function normalizeLaunchDateForInput(raw: string | undefined | null): string {
  const stored = normalizeLaunchDateForStorage(raw);
  if (stored === "—" || !/^\d{4}-\d{2}-\d{2}$/.test(stored)) return "";
  return stored;
}

/** Human-readable display in tables and detail panels. */
export function formatLaunchDateDisplay(raw: string | undefined | null): string {
  const stored = normalizeLaunchDateForStorage(raw);
  return stored === "—" ? "—" : stored;
}

/** Extract launch year for filters and compact views. */
export function launchDateYear(raw: string | undefined | null): number | null {
  const stored = normalizeLaunchDateForStorage(raw);
  if (stored === "—") return null;
  const y = parseInt(stored.slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
}
