/**
 * Standalone Unprofiled Satellites registry — localStorage only, no links to other modules.
 */

export const UNPROFILED_SATELLITE_COLUMNS = [
  "Satellite Name",
  "Country of Origin",
  "Date of Launch",
  "Orbital Position",
] as const;

export type UnprofiledSatelliteColumn = (typeof UNPROFILED_SATELLITE_COLUMNS)[number];

export type UnprofiledSatellite = {
  id: string;
  satelliteName: string;
  countryOfOrigin: string;
  dateOfLaunch: string;
  orbitalPosition: string;
};

export type UnprofiledSatelliteDraft = Omit<UnprofiledSatellite, "id">;

const STORAGE_KEY = "ssacc_unprofiled_satellites_v1";
export const UNPROFILED_SATELLITES_EVENT = "ssacc_unprofiled_satellites_change";

function dispatchChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UNPROFILED_SATELLITES_EVENT));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isValidRecord(value: unknown): value is UnprofiledSatellite {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.satelliteName === "string" &&
    typeof row.countryOfOrigin === "string" &&
    typeof row.dateOfLaunch === "string" &&
    typeof row.orbitalPosition === "string"
  );
}

export function listUnprofiledSatellites(): UnprofiledSatellite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecord);
  } catch {
    return [];
  }
}

function saveAll(rows: UnprofiledSatellite[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  dispatchChange();
}

export function addUnprofiledSatellite(draft: UnprofiledSatelliteDraft): UnprofiledSatellite | null {
  const name = draft.satelliteName.trim();
  if (!name) return null;

  const rows = listUnprofiledSatellites();
  const key = normalizeName(name);
  if (rows.some((r) => normalizeName(r.satelliteName) === key)) return null;

  const created: UnprofiledSatellite = {
    id: crypto.randomUUID(),
    satelliteName: name,
    countryOfOrigin: draft.countryOfOrigin.trim(),
    dateOfLaunch: draft.dateOfLaunch.trim(),
    orbitalPosition: draft.orbitalPosition.trim(),
  };
  saveAll([...rows, created]);
  return created;
}

export function updateUnprofiledSatellite(
  id: string,
  draft: UnprofiledSatelliteDraft,
): UnprofiledSatellite | null {
  const name = draft.satelliteName.trim();
  if (!name) return null;

  const rows = listUnprofiledSatellites();
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) return null;

  const key = normalizeName(name);
  if (rows.some((r, i) => i !== index && normalizeName(r.satelliteName) === key)) return null;

  const updated: UnprofiledSatellite = {
    id,
    satelliteName: name,
    countryOfOrigin: draft.countryOfOrigin.trim(),
    dateOfLaunch: draft.dateOfLaunch.trim(),
    orbitalPosition: draft.orbitalPosition.trim(),
  };
  const next = [...rows];
  next[index] = updated;
  saveAll(next);
  return updated;
}

export function deleteUnprofiledSatellite(id: string): boolean {
  const rows = listUnprofiledSatellites();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  saveAll(next);
  return true;
}

export function replaceUnprofiledSatellites(rows: UnprofiledSatellite[]): void {
  saveAll(rows);
}
