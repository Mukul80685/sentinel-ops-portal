/**
 * Per-unit scan history for Active Satellite Monitoring — user-seeded, then rolling last 5.
 */

export const SCAN_HISTORY_KEY = "ssacc_unit_scan_history";
export const SCAN_HISTORY_EVENT = "ssacc_scan_history_change";

const MAX_HISTORY = 5;

export type StoredScanHistoryEntry = {
  satellite: string;
  time: string;
  outcome: "productive" | "mixed" | "non-productive";
};

type ScanHistoryStore = Record<string, StoredScanHistoryEntry[]>;

function loadStore(): ScanHistoryStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SCAN_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ScanHistoryStore) : {};
  } catch {
    return {};
  }
}

function saveStore(store: ScanHistoryStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(SCAN_HISTORY_EVENT));
}

export function getUnitScanHistory(unitId: string): StoredScanHistoryEntry[] {
  return loadStore()[unitId] ?? [];
}

export function setUnitScanHistory(unitId: string, entries: StoredScanHistoryEntry[]): void {
  const store = loadStore();
  const trimmed = entries
    .filter((e) => e.satellite.trim())
    .slice(0, MAX_HISTORY)
    .map((e) => ({
      satellite: e.satellite.trim(),
      time: e.time.trim() || "—",
      outcome: e.outcome,
    }));
  if (trimmed.length === 0) {
    delete store[unitId];
  } else {
    store[unitId] = trimmed;
  }
  saveStore(store);
}

export function clearUnitScanHistory(unitId: string): void {
  const store = loadStore();
  if (!(unitId in store)) return;
  delete store[unitId];
  saveStore(store);
}

function currentTimeLabel(): string {
  try {
    return new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

/** Display-only merge — does not persist (safe during dashboard metric builds). */
export function previewScanHistoryFromActiveSatellites(
  unitId: string,
  activeSatellites: string[],
): StoredScanHistoryEntry[] {
  const stored = getUnitScanHistory(unitId);
  if (stored.length === 0) return stored;

  let history = [...stored];
  for (const sat of activeSatellites) {
    const name = sat.trim();
    if (!name || history.some((h) => h.satellite === name)) continue;
    history = [
      { satellite: name, time: currentTimeLabel(), outcome: "mixed" as const },
      ...history,
    ].slice(0, MAX_HISTORY);
  }
  return history;
}

/**
 * After the user seeds history, append newly scanned satellites from intel (FIFO, max 5).
 */
export function syncScanHistoryFromActiveSatellites(
  unitId: string,
  activeSatellites: string[],
): StoredScanHistoryEntry[] {
  const stored = getUnitScanHistory(unitId);
  if (stored.length === 0) return stored;

  let history = [...stored];
  let changed = false;

  for (const sat of activeSatellites) {
    const name = sat.trim();
    if (!name || history.some((h) => h.satellite === name)) continue;
    history = [
      { satellite: name, time: currentTimeLabel(), outcome: "mixed" as const },
      ...history,
    ].slice(0, MAX_HISTORY);
    changed = true;
  }

  if (changed) {
    setUnitScanHistory(unitId, history);
    return getUnitScanHistory(unitId);
  }
  return history;
}
