/**
 * Visibility Matrix user overlay — SSOT for user-added/edited satellites.
 * Shared by Satellite Visibility Metrics and the Satellites sidebar module.
 */

import type { GeoSatellite } from "@/lib/visibilityMatrix";

export const VISIBILITY_OVERLAY_EVENT = "ssacc-visibility-overlay";

const STORAGE_KEY = "ssacc_visibility_overlay";

export type VisibilityOverlay = {
  addedSats: Record<string, GeoSatellite[]>;
  editedSats: Record<string, GeoSatellite>;
  /** Base-catalog satellite ids hidden by the user (user-added sats are removed from addedSats). */
  deletedSatIds?: string[];
};

const EMPTY: VisibilityOverlay = { addedSats: {}, editedSats: {}, deletedSatIds: [] };

function loadJson(): VisibilityOverlay {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? ({ ...EMPTY, ...JSON.parse(raw) } as VisibilityOverlay) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function saveJson(overlay: VisibilityOverlay): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay));
  window.dispatchEvent(new Event(VISIBILITY_OVERLAY_EVENT));
}

export function getVisibilityOverlay(): VisibilityOverlay {
  return loadJson();
}

export function setVisibilityOverlay(next: VisibilityOverlay): void {
  saveJson(next);
}

export function patchVisibilityOverlay(patch: Partial<VisibilityOverlay>): VisibilityOverlay {
  const merged = { ...loadJson(), ...patch };
  saveJson(merged);
  return merged;
}

/** Composite key that scopes overlay data to a specific unit. */
export function unitScopeKey(unitId: string, id: string): string {
  return `${unitId}::${id}`;
}

export function addSatelliteToRegion(regionId: string, sat: GeoSatellite): void {
  const overlay = loadJson();
  const list = [...(overlay.addedSats[regionId] ?? []), sat];
  patchVisibilityOverlay({ addedSats: { ...overlay.addedSats, [regionId]: list } });
}

/** Unit-scoped add — satellite is stored under `${unitId}::${regionId}` and only
 *  visible when the matrix is loaded for that specific unit. */
export function addSatelliteToUnitRegion(
  unitId: string,
  regionId: string,
  sat: GeoSatellite,
): void {
  const overlay = loadJson();
  const key = unitScopeKey(unitId, regionId);
  patchVisibilityOverlay({
    addedSats: { ...overlay.addedSats, [key]: [...(overlay.addedSats[key] ?? []), sat] },
  });
}

export function editSatelliteInOverlay(sat: GeoSatellite): void {
  const overlay = loadJson();
  patchVisibilityOverlay({
    editedSats: { ...overlay.editedSats, [sat.id]: sat },
  });
}

/** Unit-scoped edit — changes are stored under `${unitId}::${sat.id}` and only
 *  applied when the matrix is rendered for that specific unit. */
export function editSatelliteInUnitOverlay(unitId: string, sat: GeoSatellite): void {
  const overlay = loadJson();
  const key = unitScopeKey(unitId, sat.id);
  patchVisibilityOverlay({
    editedSats: { ...overlay.editedSats, [key]: sat },
  });
}

/** Remove a satellite from the visibility matrix (user-added or base catalog). */
export function removeSatelliteFromOverlay(regionId: string, satId: string): void {
  const overlay = loadJson();
  const deleted = new Set(overlay.deletedSatIds ?? []);
  deleted.add(satId);

  const addedList = (overlay.addedSats[regionId] ?? []).filter((s) => s.id !== satId);
  const addedSats = { ...overlay.addedSats };
  if (addedList.length > 0) addedSats[regionId] = addedList;
  else delete addedSats[regionId];

  const { [satId]: _removed, ...editedSats } = overlay.editedSats;

  patchVisibilityOverlay({
    deletedSatIds: [...deleted],
    addedSats,
    editedSats,
  });
}

/** Unit-scoped remove — only removes the satellite from the given unit's view.
 *  Base-catalog satellites are also added to global `deletedSatIds` so they
 *  disappear from the base list; user-added unit sats are simply dropped from
 *  the unit-scoped `addedSats` bucket without touching the global delete list. */
export function removeSatelliteFromUnitOverlay(
  unitId: string,
  regionId: string,
  satId: string,
): void {
  const overlay = loadJson();
  const addKey = unitScopeKey(unitId, regionId);
  const editKey = unitScopeKey(unitId, satId);

  const currentList = overlay.addedSats[addKey] ?? [];
  const isUnitAdded = currentList.some((s) => s.id === satId);

  const filteredList = currentList.filter((s) => s.id !== satId);
  const addedSats = { ...overlay.addedSats };
  if (filteredList.length > 0) addedSats[addKey] = filteredList;
  else delete addedSats[addKey];

  const editedSats = { ...overlay.editedSats };
  delete editedSats[editKey];

  // Only hide base-catalog satellites globally; unit-added ones just vanish
  // from the unit's addedSats bucket above.
  const deleted = new Set(overlay.deletedSatIds ?? []);
  if (!isUnitAdded) deleted.add(satId);

  patchVisibilityOverlay({ addedSats, editedSats, deletedSatIds: [...deleted] });
}
