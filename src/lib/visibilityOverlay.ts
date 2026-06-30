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

export function addSatelliteToRegion(regionId: string, sat: GeoSatellite): void {
  const overlay = loadJson();
  const list = [...(overlay.addedSats[regionId] ?? []), sat];
  patchVisibilityOverlay({ addedSats: { ...overlay.addedSats, [regionId]: list } });
}

export function editSatelliteInOverlay(sat: GeoSatellite): void {
  const overlay = loadJson();
  patchVisibilityOverlay({
    editedSats: { ...overlay.editedSats, [sat.id]: sat },
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
