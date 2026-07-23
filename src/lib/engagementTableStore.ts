/**
 * Per-unit INT scan rows hidden from the Engaged Resources table (delete removes the row).
 * Does not affect Intelligence Repository — engagement dashboard view only.
 */

import { scanRowKey } from "@/lib/intelScanStorage";

export const ENGAGEMENT_TABLE_HIDDEN_KEY = "ssacc_engagement_table_hidden";
export const ENGAGEMENT_TABLE_HIDDEN_EVENT = "ssacc_engagement_table_hidden_change";

export const INT_REPORT_REMARK_PREFIX = "INT_REPORT:";

type HiddenStore = Record<string, string[]>;

export type EngagementIntelRowRef = {
  reportId?: string;
  satelliteName: string;
  polarization?: string | null;
};

/** Stable row key — matches INT Repository scan table row identity. */
export function engagementTableRowKey(row: EngagementIntelRowRef): string {
  if (row.reportId?.trim()) return row.reportId.trim();
  return scanRowKey(row.satelliteName, row.polarization ?? "—");
}

export function parseIntelReportIdFromRemarks(remarks: string | null | undefined): string | null {
  if (!remarks) return null;
  const match = remarks.match(/INT_REPORT:([^|]+)/);
  return match?.[1]?.trim() ?? null;
}

export function mergeIntelReportIntoRemarks(
  remarks: string | null | undefined,
  reportId: string,
): string {
  const stripped = (remarks ?? "")
    .split("|")
    .filter((part) => !part.startsWith(INT_REPORT_REMARK_PREFIX))
    .join("|");
  const tag = `${INT_REPORT_REMARK_PREFIX}${reportId}`;
  return stripped ? `${tag}|${stripped}` : tag;
}

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

export function getHiddenEngagementRowKeys(unitId: string): Set<string> {
  const list = loadStore()[unitId] ?? [];
  return new Set(
    list
      .filter((key) => key.includes("__") || key.includes("::"))
      .map((key) => key.toLowerCase()),
  );
}

/** @deprecated Legacy name-only hidden set — used only for backward-compatible filtering. */
export function getHiddenEngagementSatellites(unitId: string): Set<string> {
  return getHiddenEngagementRowKeys(unitId);
}

export function hideEngagementTableRow(unitId: string, rowKey: string): void {
  const trimmed = rowKey.trim();
  if (!trimmed) return;
  const store = loadStore();
  const existing = store[unitId] ?? [];
  const lower = trimmed.toLowerCase();
  if (existing.some((key) => key.toLowerCase() === lower)) return;
  // Drop legacy name-only keys so deleting one scan row never hides same-name siblings.
  const withoutLegacy = existing.filter((key) => key.includes("__") || key.includes("::"));
  store[unitId] = [...withoutLegacy, trimmed];
  saveStore(store);
}

/** Drop legacy satellite-name-only hidden keys (they hid every row sharing a name). */
export function pruneLegacyHiddenEngagementKeys(unitId: string): void {
  const store = loadStore();
  const existing = store[unitId];
  if (!existing?.length) return;
  const next = existing.filter((key) => key.includes("__") || key.includes("::"));
  if (next.length === existing.length) return;
  if (next.length === 0) delete store[unitId];
  else store[unitId] = next;
  saveStore(store);
}

export function restoreEngagementTableRow(unitId: string, rowKey: string): void {
  const trimmed = rowKey.trim();
  if (!trimmed) return;
  const store = loadStore();
  const existing = store[unitId];
  if (!existing?.length) return;
  const lower = trimmed.toLowerCase();
  const next = existing.filter((key) => key.toLowerCase() !== lower);
  if (next.length === 0) {
    delete store[unitId];
  } else {
    store[unitId] = next;
  }
  saveStore(store);
}

export function filterEngagementVisibleIntelRows<
  T extends { satelliteName: string; reportId?: string; polarization?: string | null },
>(unitId: string, rows: T[]): T[] {
  const hidden = getHiddenEngagementRowKeys(unitId);
  if (hidden.size === 0) return rows;
  return rows.filter((row) => !hidden.has(engagementTableRowKey(row).toLowerCase()));
}
