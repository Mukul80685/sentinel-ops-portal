/**
 * Unified satellite catalog — flattens Visibility Matrix SSOT + user overlay.
 */

import {
  GEO_REGIONS,
  type GeoRegion,
  type GeoSatellite,
  countVisibleSatellitesForUnit,
  canonicalSatelliteKey,
  normalizeSatelliteName,
  getBeamBreakdown,
  getVisibleBeams,
  type VisibilityMatrixSnapshot,
} from "@/lib/visibilityMatrix";
import {
  getVisibilityOverlay,
  unitScopeKey,
  VISIBILITY_OVERLAY_EVENT,
  getUnitImportedSatCount,
  type VisibilityOverlay,
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
  return dedupeFlatSatelliteRows(
    regions.flatMap((region) =>
      region.satellites.map((sat) => ({
        id: sat.id,
        name: sat.name,
        countryOfOrigin: region.label,
        launchDate: sat.launchDate,
        regionId: region.id,
        satellite: sat,
      })),
    ),
  );
}

/** One row per satellite identity — dedupe by id and canonical name (offline overlay imports). */
function dedupeFlatSatelliteRows(rows: FlatSatelliteRow[]): FlatSatelliteRow[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const out: FlatSatelliteRow[] = [];
  for (const row of rows) {
    const nameKey = canonicalSatelliteKey(row.name);
    if (seenIds.has(row.id) || seenNames.has(nameKey)) continue;
    seenIds.add(row.id);
    seenNames.add(nameKey);
    out.push(row);
  }
  return out;
}

/** Resolve overlay edits — global, unit-scoped, or any unit edit for this satellite id. */
function resolveEditedSatellite(
  sat: GeoSatellite,
  overlay: VisibilityOverlay,
  preferUnitId?: string,
): GeoSatellite {
  if (preferUnitId) {
    const unitEdit = overlay.editedSats[unitScopeKey(preferUnitId, sat.id)];
    if (unitEdit) return unitEdit;
  }

  const globalEdit = overlay.editedSats[sat.id];
  if (globalEdit) return globalEdit;

  for (const [key, edited] of Object.entries(overlay.editedSats)) {
    if (!key.includes("::")) continue;
    const editSatId = key.slice(key.indexOf("::") + 2);
    if (editSatId === sat.id) return edited;
  }

  return sat;
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

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const rows: FlatSatelliteRow[] = [];

  function addRow(sat: GeoSatellite, regionId: string, unitId?: string) {
    const resolved = resolveEditedSatellite(sat, overlay, unitId);
    if (deleted.has(resolved.id) || deleted.has(sat.id)) return;
    const nameKey = canonicalSatelliteKey(resolved.name);
    if (seenIds.has(resolved.id) || seenNames.has(nameKey)) return;
    seenIds.add(resolved.id);
    seenNames.add(nameKey);
    const region = regionById.get(regionId);
    rows.push({
      id: resolved.id,
      name: resolved.name,
      countryOfOrigin: region?.label ?? regionId,
      launchDate: resolved.launchDate,
      regionId,
      satellite: resolved,
    });
  }

  // 1. Base catalog (preferred when the same name was re-imported under a new id)
  for (const region of GEO_REGIONS) {
    for (const sat of region.satellites) addRow(sat, region.id);
  }

  // 2. All overlay additions — global (key = regionId) and unit-scoped (key = unitId::regionId)
  for (const [key, sats] of Object.entries(overlay.addedSats)) {
    if (key.includes("::")) {
      const sep = key.indexOf("::");
      const unitId = key.slice(0, sep);
      const regionId = key.slice(sep + 2);
      for (const sat of sats) addRow(sat, regionId, unitId);
    } else {
      for (const sat of sats) addRow(sat, key);
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Satellites this unit can see in the Visibility Matrix (≥1 visible beam). */
export function listVisibleSatelliteCatalogForUnit(intUnitSlug: string): FlatSatelliteRow[] {
  const regions = mergeRegionsWithOverlay(getVisibilityOverlay(), intUnitSlug);
  const rows: FlatSatelliteRow[] = [];
  const seen = new Set<string>();

  for (const region of regions) {
    for (const sat of region.satellites) {
      if (seen.has(sat.id)) continue;
      if (getVisibleBeams(intUnitSlug, sat.id, region.id).length === 0) continue;
      seen.add(sat.id);
      rows.push({
        id: sat.id,
        name: sat.name,
        countryOfOrigin: region.label,
        launchDate: sat.launchDate,
        regionId: region.id,
        satellite: sat,
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function getVisibleSatelliteCatalogIdsForUnit(intUnitSlug: string): Set<string> {
  return new Set(listVisibleSatelliteCatalogForUnit(intUnitSlug).map((r) => r.id));
}

function satelliteNamesMatch(a: string, b: string): boolean {
  return (
    normalizeSatelliteName(a) === normalizeSatelliteName(b) ||
    canonicalSatelliteKey(a) === canonicalSatelliteKey(b)
  );
}

/**
 * Look up a satellite in the Visibility Matrix catalog (base + overlay, optionally unit-scoped).
 * Uses canonical name matching so scan-report names like "APSTAR-9" resolve to "Apstar 9".
 */
export function findSatelliteInCatalog(
  satelliteName: string,
  unitId?: string,
): FlatSatelliteRow | null {
  const regions = mergeRegionsWithOverlay(getVisibilityOverlay(), unitId);
  const rows = flattenSatelliteCatalog(regions);
  return rows.find((r) => satelliteNamesMatch(r.name, satelliteName)) ?? null;
}

/** Look up a catalog row by satellite id (unit-scoped overlay when unitId is set). */
export function findSatelliteCatalogRowById(
  satelliteId: string,
  unitId?: string,
): FlatSatelliteRow | null {
  const regions = mergeRegionsWithOverlay(getVisibilityOverlay(), unitId);
  for (const region of regions) {
    const sat = region.satellites.find((s) => s.id === satelliteId);
    if (sat) {
      return {
        id: sat.id,
        name: sat.name,
        countryOfOrigin: region.label,
        launchDate: sat.launchDate,
        regionId: region.id,
        satellite: sat,
      };
    }
  }
  return null;
}

/**
 * Build a Visibility Matrix snapshot from the unified catalog (includes overlay imports).
 */
export function resolveMatrixVisibilityFromCatalog(
  unitId: string,
  satelliteName: string,
): VisibilityMatrixSnapshot | null {
  const row = findSatelliteInCatalog(satelliteName, unitId);
  if (!row) return null;
  const { satellite: sat, regionId } = row;
  const { total, beams } = getBeamBreakdown(sat);
  const visible = getVisibleBeams(unitId, sat.id, regionId);
  return {
    satelliteName: sat.name,
    unitId,
    regionId,
    satelliteId: sat.id,
    totalBeamCount: total,
    beamInventory: beams,
    beamsVisibleToUnit: visible,
    canScan: visible.length > 0,
    source: "visibility_matrix",
  };
}

/** Parse launch date for sorting — NOT string comparison. */
export function parseLaunchDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return null;
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) return iso;
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
  const [rows, setRows] = useState(() => flattenGlobalSatelliteCatalog());

  useEffect(() => {
    const refresh = () => setRows(flattenGlobalSatelliteCatalog());
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
