/**
 * Unified satellite catalog — flattens Visibility Matrix SSOT + user overlay.
 */

import {
  GEO_REGIONS,
  type GeoRegion,
  type GeoSatellite,
  countVisibleSatellitesForUnit,
} from "@/lib/visibilityMatrix";
import {
  getVisibilityOverlay,
  unitScopeKey,
  VISIBILITY_OVERLAY_EVENT,
  getUnitImportedSatCount,
} from "@/lib/visibilityOverlay";
import { useEffect, useState } from "react";
import { INT_UNITS } from "@/lib/intelUnits";

export type FlatSatelliteRow = {
  id: string;
  name: string;
  countryOfOrigin: string;
  launchDate: string;
  regionId: string;
  satellite: GeoSatellite;
};

/**
 * Merge the base GEO_REGIONS catalog with the user overlay.
 *
 * When `unitId` is provided the merge includes:
 *   • globally-added satellites (`addedSats[regionId]`)
 *   • unit-specific satellites (`addedSats[unitId::regionId]`)
 *   • unit-specific edits (`editedSats[unitId::satId]`) falling back to global edits
 *
 * Without `unitId` only the globally-keyed buckets are used (sidebar, fleet state, etc.).
 */
export function mergeRegionsWithOverlay(
  overlay = getVisibilityOverlay(),
  unitId?: string,
): GeoRegion[] {
  const deleted = new Set(overlay.deletedSatIds ?? []);
  return GEO_REGIONS.map((r) => {
    const globalAdded = overlay.addedSats[r.id] ?? [];
    const unitAdded = unitId ? (overlay.addedSats[unitScopeKey(unitId, r.id)] ?? []) : [];
    return {
      ...r,
      satellites: [...r.satellites, ...globalAdded, ...unitAdded]
        .map((s) => {
          if (unitId) {
            return (
              overlay.editedSats[unitScopeKey(unitId, s.id)] ??
              overlay.editedSats[s.id] ??
              s
            );
          }
          return overlay.editedSats[s.id] ?? s;
        })
        .filter((s) => !deleted.has(s.id)),
    };
  });
}

/** Flatten unit-based/hierarchical structure into a single unified dataset. */
export function flattenSatelliteCatalog(
  regions: GeoRegion[] = mergeRegionsWithOverlay(),
): FlatSatelliteRow[] {
  return regions.flatMap((region) =>
    region.satellites.map((sat) => ({
      id: sat.id,
      name: sat.name,
      countryOfOrigin: region.label,
      launchDate: sat.launchDate,
      regionId: region.id,
      satellite: sat,
    })),
  );
}

/**
 * Global satellite catalog for the "Add Satellite" picker.
 *
 * Aggregates the base GEO_REGIONS catalog plus every satellite ever added
 * through the Satellite Visibility Matrix — whether added globally or scoped
 * to a specific unit — so that the allocation picker stays in sync with the
 * visibility matrix regardless of which unit performed the addition.
 *
 * Satellites in `deletedSatIds` are excluded. Results are sorted
 * alphabetically by name.
 */
export function flattenGlobalSatelliteCatalog(): FlatSatelliteRow[] {
  const overlay = getVisibilityOverlay();
  const deleted = new Set(overlay.deletedSatIds ?? []);
  const regionById = new Map(GEO_REGIONS.map((r) => [r.id, r]));

  const seen = new Set<string>();
  const rows: FlatSatelliteRow[] = [];

  function addRow(sat: GeoSatellite, regionId: string) {
    if (deleted.has(sat.id) || seen.has(sat.id)) return;
    seen.add(sat.id);
    const region = regionById.get(regionId);
    const resolved = overlay.editedSats[sat.id] ?? sat;
    rows.push({
      id: resolved.id,
      name: resolved.name,
      countryOfOrigin: region?.label ?? regionId,
      launchDate: resolved.launchDate,
      regionId,
      satellite: resolved,
    });
  }

  // 1. Base catalog
  for (const region of GEO_REGIONS) {
    for (const sat of region.satellites) addRow(sat, region.id);
  }

  // 2. All overlay additions — global (key = regionId) and unit-scoped (key = unitId::regionId)
  for (const [key, sats] of Object.entries(overlay.addedSats)) {
    const regionId = key.includes("::") ? key.split("::").slice(1).join("::") : key;
    for (const sat of sats) addRow(sat, regionId);
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Parse launch date for sorting — NOT string comparison. */
export function parseLaunchDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return null;
  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) return iso;
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

export type NameSort = "asc" | "desc" | null;
export type DateSort = "asc" | "desc" | null;

export function sortSatelliteRows(
  rows: FlatSatelliteRow[],
  nameSort: NameSort,
  dateSort: DateSort,
): FlatSatelliteRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (dateSort) {
      const da = parseLaunchDate(a.launchDate);
      const db = parseLaunchDate(b.launchDate);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      const cmp = da - db;
      if (cmp !== 0) return dateSort === "asc" ? cmp : -cmp;
    }
    if (nameSort) {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return nameSort === "asc" ? cmp : -cmp;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return copy;
}

export function useSatelliteCatalog(): FlatSatelliteRow[] {
  const [rows, setRows] = useState(() => flattenSatelliteCatalog());

  useEffect(() => {
    const refresh = () => setRows(flattenSatelliteCatalog());
    refresh();
    window.addEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
    return () => window.removeEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
  }, []);

  return rows;
}

/**
 * Returns a region list containing ONLY satellites explicitly imported for a
 * specific unit. Unlike mergeRegionsWithOverlay, this never includes
 * base-catalog satellites — preventing newly created units from inheriting the
 * global satellite inventory.
 */
export function mergeUnitOnlyRegions(unitId: string): GeoRegion[] {
  const overlay = getVisibilityOverlay();
  return GEO_REGIONS.map((r) => ({
    ...r,
    satellites: (overlay.addedSats[unitScopeKey(unitId, r.id)] ?? []).map(
      (s) => overlay.editedSats[unitScopeKey(unitId, s.id)] ?? s,
    ),
  }));
}

/**
 * React hook — returns per-unit imported satellite counts for a list of unit
 * ids, updating whenever the visibility overlay changes.
 */
export function useUnitImportedCounts(unitIds: string[]): Record<string, number> {
  const idsKey = unitIds.join(",");
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const id of unitIds) result[id] = getUnitImportedSatCount(id);
    return result;
  });

  useEffect(() => {
    const refresh = () => {
      const result: Record<string, number> = {};
      for (const id of idsKey.split(",").filter(Boolean)) {
        result[id] = getUnitImportedSatCount(id);
      }
      setCounts(result);
    };
    refresh();
    window.addEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
    return () => window.removeEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
  }, [idsKey]);

  return counts;
}

/** Live visible-satellite counts per INT unit id (alpha … hotel). */
export function useVisibleSatelliteCounts(unitIds?: string[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const idsKey = (unitIds ?? INT_UNITS.map((u) => u.id)).join(",");

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    const refresh = () => {
      const overlay = getVisibilityOverlay();
      const next: Record<string, number> = {};
      for (const id of ids) {
        const regions = mergeRegionsWithOverlay(overlay, id);
        next[id] = countVisibleSatellitesForUnit(id, regions);
      }
      setCounts(next);
    };
    refresh();
    window.addEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
    return () => window.removeEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
  }, [idsKey]);

  return counts;
}
