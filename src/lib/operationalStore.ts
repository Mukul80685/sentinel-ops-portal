/**
 * Operational store — persisted SSOT used when Supabase has no seeded data.
 */

import {
  generateOperationalDataset,
  type OperationalDataset,
  type OpEngagement,
  type OpEquipment,
  type OpIntelRow,
} from "@/lib/operationalDataset";
import { OPERATIONAL_DATASET_VERSION, OPERATIONAL_STORE_EVENT, OPERATIONAL_STORE_KEY } from "@/lib/operationalConstants";

/** Minimum fleet equipment rows — stale cached datasets below this are regenerated. */
const MIN_FLEET_EQUIPMENT = 300;

let _cache: OperationalDataset | null = null;

function isValidCachedDataset(parsed: OperationalDataset): boolean {
  return (
    parsed.version === OPERATIONAL_DATASET_VERSION &&
    parsed.units.length > 0 &&
    (parsed.equipment?.length ?? 0) >= MIN_FLEET_EQUIPMENT
  );
}

export function getOperationalDataset(): OperationalDataset {
  if (_cache && isValidCachedDataset(_cache)) return _cache;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(OPERATIONAL_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OperationalDataset;
        if (isValidCachedDataset(parsed)) {
          _cache = parsed;
          return _cache;
        }
      }
    } catch { /* regenerate */ }
  }
  _cache = generateOperationalDataset();
  persistOperationalDataset(_cache);
  return _cache;
}

export function persistOperationalDataset(dataset: OperationalDataset): void {
  _cache = dataset;
  if (typeof window === "undefined") return;
  localStorage.setItem(OPERATIONAL_STORE_KEY, JSON.stringify(dataset));
  window.dispatchEvent(new Event(OPERATIONAL_STORE_EVENT));
}

export function resetOperationalDataset(): OperationalDataset {
  _cache = generateOperationalDataset();
  persistOperationalDataset(_cache);
  return _cache;
}

export function ensureOperationalDataset(): OperationalDataset {
  return getOperationalDataset();
}

export function isUsingOperationalStore(): boolean {
  return _cache !== null || (typeof window !== "undefined" && localStorage.getItem(OPERATIONAL_STORE_KEY) !== null);
}

export function updateOperationalEquipment(
  equipmentId: string,
  patch: Partial<Pick<OpEquipment, "serviceability">>,
): void {
  const ds = getOperationalDataset();
  const eq = ds.equipment.find((e) => e.id === equipmentId);
  if (!eq) return;
  Object.assign(eq, patch);
  persistOperationalDataset(ds);
}

export function getOperationalEngagements(): OpEngagement[] {
  return getOperationalDataset().engagements;
}

export function getOperationalIntelRows(): OpIntelRow[] {
  return getOperationalDataset().intelRows ?? [];
}

export { OPERATIONAL_STORE_EVENT };
