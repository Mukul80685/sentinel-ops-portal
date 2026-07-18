/**
 * Per-unit satellites hidden from the Engaged Resources table (delete removes the row).
 * Does not affect Intelligence Repository — engagement dashboard view only.
 */

export const ENGAGEMENT_TABLE_HIDDEN_KEY = "ssacc_engagement_table_hidden";
export const ENGAGEMENT_TABLE_HIDDEN_EVENT = "ssacc_engagement_table_hidden_change";

type HiddenStore = Record<string, string[]>;

function loadStore(): HiddenStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ENGAGEMENT_TABLE_HIDDEN_KEY);
    return raw ? (JSON.parse(raw) as HiddenStore) : {};
  } catch {
    return {};
  }
}

function saveStore(store: HiddenStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ENGAGEMENT_TABLE_HIDDEN_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(ENGAGEMENT_TABLE_HIDDEN_EVENT));
}

export function getHiddenEngagementSatellites(unitId: string): Set<string> {
  const list = loadStore()[unitId] ?? [];
  return new Set(list.map((n) => n.toLowerCase()));
}

export function hideEngagementTableRow(unitId: string, satelliteName: string): void {
  const trimmed = satelliteName.trim();
  if (!trimmed) return;
  const store = loadStore();
  const existing = store[unitId] ?? [];
  const lower = trimmed.toLowerCase();
  if (existing.some((n) => n.toLowerCase() === lower)) return;
  store[unitId] = [...existing, trimmed];
  saveStore(store);
}

export function restoreEngagementTableRow(unitId: string, satelliteName: string): void {
  const trimmed = satelliteName.trim();
  if (!trimmed) return;
  const store = loadStore();
  const existing = store[unitId];
  if (!existing?.length) return;
  const lower = trimmed.toLowerCase();
  const next = existing.filter((n) => n.toLowerCase() !== lower);
  if (next.length === 0) {
    delete store[unitId];
  } else {
    store[unitId] = next;
  }
  saveStore(store);
}

export function filterEngagementVisibleIntelRows<T extends { satelliteName: string }>(
  unitId: string,
  rows: T[],
): T[] {
  const hidden = getHiddenEngagementSatellites(unitId);
  if (hidden.size === 0) return rows;
  return rows.filter((r) => !hidden.has(r.satelliteName.toLowerCase()));
}
