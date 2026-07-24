/**
 * Resource Inventory SSOT — three equipment categories only.
 * Antennas, Demodulators, and Other Resources (LNA/LNB/Processing Servers removed).
 */

export const EQUIPMENT_CATEGORY_DEFS = [
  {
    id: "op-cat-antenna",
    name: "Antenna",
    sort_order: 1,
    ringLabel: "Antennas",
    tableLabel: "Antenna",
    match: "antenna",
    short: "Antenna",
  },
  {
    id: "op-cat-demod",
    name: "Demodulators",
    sort_order: 2,
    ringLabel: "Demodulators",
    tableLabel: "Demodulator",
    match: "demodulat",
    short: "Demodulator",
  },
  {
    id: "op-cat-other",
    name: "Other Resources",
    sort_order: 3,
    ringLabel: "Other Resources",
    tableLabel: "Other Resources",
    match: "other resources",
    short: "Other",
  },
] as const;

export type EquipmentCategoryName = (typeof EQUIPMENT_CATEGORY_DEFS)[number]["name"];

export const REMOVED_EQUIPMENT_CATEGORY_IDS = new Set([
  "op-cat-lna",
  "op-cat-lnb",
  "op-cat-proc",
]);

export const REMOVED_EQUIPMENT_CATEGORY_NAMES = new Set([
  "LNA",
  "LNB",
  "Processing Servers",
]);

/** RF chain stages for capacity / bottleneck (antenna → demodulator). */
export const CHAIN_CATEGORIES = [
  { label: "Antennas", match: "antenna", short: "Antenna" },
  { label: "Demodulators", match: "demodulat", short: "Demodulator" },
] as const;

/** Engagement ring + table column categories (three resource types). */
export const RESOURCE_RING_CATEGORIES = EQUIPMENT_CATEGORY_DEFS.map((c) => ({
  label: c.ringLabel,
  matches: (name: string) => matchesEquipmentCategory(name, c.match),
}));

export function matchesEquipmentCategory(catName: string, match: string): boolean {
  const lower = catName.trim().toLowerCase();
  if (match === "antenna") return lower.includes("antenna");
  if (match === "demodulat") return lower.includes("demodulat");
  if (match === "other resources") return lower === "other resources";
  return false;
}

export function isRemovedEquipmentCategory(idOrName: string): boolean {
  return (
    REMOVED_EQUIPMENT_CATEGORY_IDS.has(idOrName) ||
    REMOVED_EQUIPMENT_CATEGORY_NAMES.has(idOrName)
  );
}

/** Strip legacy LNA/LNB/processor tokens from engagement remarks. */
export function stripLegacyChainRemarkTokens(remarks: string | null | undefined): string {
  return (remarks ?? "")
    .replace(/INT_REPORT:[^|]+\s*\|\s*/g, "")
    .replace(/LNA\/LNB:[^|]+\s*\|\s*/g, "")
    .replace(/LNA_IDS:[^|]+\s*\|\s*/g, "")
    .replace(/LNB_IDS:[^|]+\s*\|\s*/g, "")
    .replace(/LNA_ID:[^|]+\s*\|\s*/g, "")
    .replace(/LNB_ID:[^|]+\s*\|\s*/g, "")
    .replace(/PROC_IDS:[^|]+\s*\|\s*/g, "")
    .replace(/PROC_ID:[^|]+\s*\|\s*/g, "")
    .trim();
}
