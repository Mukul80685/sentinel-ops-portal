/**
 * Per-unit planned satellites (next three months) — user-editable rows.
 */

export const PLANNED_SATELLITES_KEY = "ssacc_planned_satellites";
export const PLANNED_SATELLITES_EVENT = "ssacc_planned_satellites_change";

export type PlannedSatelliteRow = {
  id: string;
  serialNumber: string;
  satellite: string;
  launchDate: string;
  lastScannedDate: string;
};

type PlannedSatelliteStore = Record<string, PlannedSatelliteRow[]>;

function loadStore(): PlannedSatelliteStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PLANNED_SATELLITES_KEY);
    return raw ? (JSON.parse(raw) as PlannedSatelliteStore) : {};
  } catch {
    return {};
  }
}

function saveStore(store: PlannedSatelliteStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLANNED_SATELLITES_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(PLANNED_SATELLITES_EVENT));
}

export function getPlannedSatellites(unitId: string): PlannedSatelliteRow[] {
  return loadStore()[unitId] ?? [];
}

export function setPlannedSatellites(unitId: string, rows: PlannedSatelliteRow[]): void {
  const store = loadStore();
  if (rows.length === 0) {
    delete store[unitId];
  } else {
    store[unitId] = rows;
  }
  saveStore(store);
}

export function newPlannedSatelliteRow(): PlannedSatelliteRow {
  return {
    id: `plan-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: "",
    satellite: "",
    launchDate: "",
    lastScannedDate: "",
  };
}

export function clearPlannedSatellites(unitId: string): void {
  const store = loadStore();
  if (!(unitId in store)) return;
  delete store[unitId];
  saveStore(store);
}
