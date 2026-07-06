/**
 * Unified satellite catalog — flattens Visibility Matrix SSOT + user overlay.
 */

import {
  GEO_REGIONS,
  type GeoRegion,
  type GeoSatellite,
  countVisibleSatellitesForUnit,
} from "@/lib/visibilityMatrix";
import { getVisibilityOverlay, unitScopeKey, VISIBILITY_OVERLAY_EVENT } from "@/lib/visibilityOverlay";
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

/** Live visible-satellite counts per INT unit id (alpha … hotel). */
export function useVisibleSatelliteCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const refresh = () => {
      const overlay = getVisibilityOverlay();
      const next: Record<string, number> = {};
      for (const unit of INT_UNITS) {
        const regions = mergeRegionsWithOverlay(overlay, unit.id);
        next[unit.id] = countVisibleSatellitesForUnit(unit.id, regions);
      }
      setCounts(next);
    };
    refresh();
    window.addEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
    return () => window.removeEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
  }, []);

  return counts;
}
