/**
 * Identity normalization utilities
 * Ensures consistent matching across user-entered and system-generated IDs.
 */

function baseNormalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_-]/g, "") // normalize space, underscore, dash uniformly
    .trim();
}

/**
 * Unit IDs:
 * Normalizes:
 * - "unit 12"
 * - "unit_12"
 * - "unit-12"
 * - "UNIT12"
 * → all become "12"
 */
export function normalizeUnitId(value: string): string {
  return baseNormalize(value).replace(/^unit/, "");
}

/**
 * Satellite IDs:
 * Keeps structure, only removes separators
 */
export function normalizeSatelliteId(value: string): string {
  return baseNormalize(value);
}

/**
 * Equipment IDs:
 * Same normalization strategy as satellite IDs
 */
export function normalizeEquipmentId(value: string): string {
  return baseNormalize(value);
}