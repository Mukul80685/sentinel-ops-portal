/**
 * Satellite Priority & Allocation — seeded from Visibility Matrix SSOT (46 satellites).
 * Excludes visibility metrics; operational allocation data only.
 */

import {
  findSatelliteCatalogRowById,
  flattenGlobalSatelliteCatalog,
  getVisibleSatelliteCatalogIdsForUnit,
  listVisibleSatelliteCatalogForUnit,
  parseLaunchDate,
  type FlatSatelliteRow,
} from "@/lib/satelliteCatalog";
import { scheduleElectronStorageFlush } from "@/lib/electronPersist";
import { resolveIntUnitSlug } from "@/lib/operationalSync";
import type { GeoSatellite } from "@/lib/visibilityMatrix";
import {
  canonicalSatelliteKey,
  formatSatelliteTransponders,
  formatUnitBeamDetailsForAllocation,
} from "@/lib/visibilityMatrix";
import { VISIBILITY_OVERLAY_EVENT } from "@/lib/visibilityOverlay";
import { useEffect, useState } from "react";

export const UNIT_SLOTS = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
] as const;

/** Seed slots are alpha…hotel; dynamically created units get generated slot strings. */
export type UnitSlot = string;

export const UNIT_SLOT_DISPLAY: Record<UnitSlot, string> = {
  alpha: "Alpha",
  bravo: "Bravo",
  charlie: "Charlie",
  delta: "Delta",
  echo: "Echo",
  foxtrot: "Foxtrot",
  golf: "Golf",
  hotel: "Hotel",
};

/** Short labels for headers — Unit A … Unit H */
export const UNIT_SHORT_LABEL: Record<UnitSlot, string> = {
  alpha: "Unit A",
  bravo: "Unit B",
  charlie: "Unit C",
  delta: "Unit D",
  echo: "Unit E",
  foxtrot: "Unit F",
  golf: "Unit G",
  hotel: "Unit H",
};

/** Preset operational locations (aligned with Resource Inventory). */
export const UNIT_LOCATIONS: Record<UnitSlot, string> = {
  alpha: "New York",
  bravo: "London",
  charlie: "Melbourne",
  delta: "Sydney",
  echo: "Singapore",
  foxtrot: "Dubai",
  golf: "Tokyo",
  hotel: "Frankfurt",
};

export const PRIORITY_ALLOCATION_EVENT = "ssacc_priority_allocation_change";

/** P1 = highest importance, P3 = lowest. */
export type SatPriority = 1 | 2 | 3;
export const SAT_PRIORITIES: SatPriority[] = [1, 2, 3];
export const SAT_PRIORITY_LABEL: Record<SatPriority, string> = { 1: "P1", 2: "P2", 3: "P3" };

const P_OVERRIDES_KEY = "ssacc_priority_p_overrides";
type POverrideStore = Record<string, Record<string, SatPriority>>;

function loadPOverrides(slot: UnitSlot): Record<string, SatPriority> {
  try {
    const raw = localStorage.getItem(P_OVERRIDES_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) as POverrideStore)[slot] ?? {};
  } catch { return {}; }
}

function savePOverride(slot: UnitSlot, satelliteId: string, p: SatPriority): void {
  try {
    const raw = localStorage.getItem(P_OVERRIDES_KEY);
    const parsed: POverrideStore = raw ? JSON.parse(raw) : {};
    parsed[slot] = { ...(parsed[slot] ?? {}), [satelliteId]: p };
    localStorage.setItem(P_OVERRIDES_KEY, JSON.stringify(parsed));
    notifyAllocationChange();
  } catch { /* ignore */ }
}

export function clearPOverridesForSlot(slot: UnitSlot): void {
  try {
    const raw = localStorage.getItem(P_OVERRIDES_KEY);
    if (!raw) return;
    const parsed: POverrideStore = JSON.parse(raw);
    delete parsed[slot];
    localStorage.setItem(P_OVERRIDES_KEY, JSON.stringify(parsed));
  } catch { /* ignore */ }
}

/** Set explicit P1/P2/P3 priority for a satellite in a unit's allocation list. */
export function updateAllocationPriority(slot: UnitSlot, satelliteId: string, p: SatPriority): void {
  savePOverride(slot, satelliteId, p);
}

/** Effective priority for display: P-override if set, else the row's auto-assigned number clamped to P1–P3. */
export function effectivePriority(row: Pick<PriorityAllocationRow, "priority" | "satelliteId">, overrides: Record<string, SatPriority>): SatPriority {
  if (overrides[row.satelliteId] !== undefined) return overrides[row.satelliteId];
  // Clamp auto-assigned numbers to P1–P3 (1=highest, cap at 3)
  const p = Math.min(Math.max(Math.round(row.priority), 1), 3) as SatPriority;
  return p;
}

const ASSIGNED_BY = [
  "Col. Rajesh Mehta",
  "Maj. Priya Sharma",
  "Lt. Col. Arun Nair",
  "Capt. Meera Singh",
  "Wg. Cdr. Vikram Desai",
] as const;

const STORAGE_KEY = "ssacc_priority_user_allocations";

export type AllocationStatus = "Primary Monitor" | "Active" | "Secondary Monitor" | "Standby";

export type PriorityAllocationRow = {
  id: string;
  satelliteId: string;
  priority: number;
  satelliteName: string;
  country: string;
  orbitalPosition: string;
  launchDate: string;
  orbitType: string;
  frequencyBand: string;
  transponders: string;
  beamDetails: string;
  status: AllocationStatus;
  assignedBy: string;
  lastUpdated: string;
  /** True for rows added via "Add Satellite" — seed rows cannot be deleted. */
  isUserAdded?: boolean;
};

export type SortDir = "asc" | "desc";

export type AllocationSortKey = "priority" | "satelliteName" | "launchDate";

/** Map GATE-A … GATE-H to unit slot. */
export function unitCodeToSlot(code: string): UnitSlot | null {
  const letter = code.replace(/^GATE-/i, "").charAt(0).toLowerCase();
  const map: Record<string, UnitSlot> = {
    a: "alpha",
    b: "bravo",
    c: "charlie",
    d: "delta",
    e: "echo",
    f: "foxtrot",
    g: "golf",
    h: "hotel",
  };
  return map[letter] ?? null;
}

export function unitShortLabel(code: string): string {
  const slot = unitCodeToSlot(code);
  if (slot && UNIT_SHORT_LABEL[slot]) return UNIT_SHORT_LABEL[slot];
  return "Unit";
}

export function unitTileTitle(slot: UnitSlot): string {
  return `Unit ${UNIT_SLOT_DISPLAY[slot] ?? slot}`;
}

/** Derive the storage slot from an operational unit id (`op-unit-<slot>`). */
export function slotFromUnitId(unitId: string): UnitSlot | null {
  const m = unitId.match(/^op-unit-(.+)$/);
  return m ? m[1] : null;
}

/**
 * Resolve the allocation storage slot for a unit. Seed slots (alpha…hotel)
 * carry pre-seeded allocation data, so only genuine seed units (GATE-* codes)
 * may map onto them — a user-created unit that happens to sit on a seed slot
 * (possible with data created before slot reuse was disabled) is quarantined
 * onto its own unit id so it never inherits the seed unit's satellites.
 */
export function allocationSlotForUnit(unit: { id: string; code: string }): UnitSlot {
  const raw = slotFromUnitId(unit.id) ?? unitCodeToSlot(unit.code) ?? unit.id;
  const isSeedSlot = (UNIT_SLOTS as readonly string[]).includes(raw);
  if (isSeedSlot && !/^GATE-/i.test(unit.code)) return unit.id;
  return raw;
}

/** @deprecated Use unitShortLabel for headers */
export function unitDisplayName(code: string, name: string): string {
  void name;
  return unitShortLabel(code);
}

export function slotFromIndex(index: number): UnitSlot | null {
  return UNIT_SLOTS[index] ?? null;
}

export function getAllocationCountForUnit(slot: UnitSlot): number {
  return getAllocationsForUnit(slot).length;
}

export function getAllocationCountsBySlot(): Record<UnitSlot, number> {
  return UNIT_SLOTS.reduce(
    (acc, slot) => {
      acc[slot] = getAllocationCountForUnit(slot);
      return acc;
    },
    {} as Record<UnitSlot, number>,
  );
}

function notifyAllocationChange(): void {
  window.dispatchEvent(new Event(PRIORITY_ALLOCATION_EVENT));
}

function parseFrequencyBand(sat: GeoSatellite): string {
  const tl = sat.transponders.toLowerCase();
  const bands: string[] = [];
  if (tl.includes("c")) bands.push("C-band");
  if (tl.includes("ku")) bands.push("Ku-band");
  if (tl.includes("ka")) bands.push("Ka-band");
  return bands.length ? bands.join(" / ") : sat.transponders;
}

/** Stable per-unit identity — one satellite once per unit (id + canonical name). */
export function allocationIdentityKey(row: {
  satelliteId?: string;
  satelliteName?: string;
  /** FlatSatelliteRow / catalog shape */
  id?: string;
  name?: string;
}): string {
  const id = (row.satelliteId ?? row.id)?.trim();
  if (id) return id;
  return canonicalSatelliteKey(row.satelliteName ?? row.name ?? "");
}

/** Repair degree sign corruption common in legacy offline / EXE persisted data. */
export function normalizeOrbitalPosition(position: string): string {
  if (!position) return position;
  return position
    .replace(/(\d(?:\.\d+)?)\?(?=[EWew])/g, "$1°")
    .replace(/(\d(?:\.\d+)?)\uFFFD(?=[EWew])/g, "$1°")
    .replace(/(\d(?:\.\d+)?)Â°/g, "$1°");
}

function dedupeAllocationRows(rows: PriorityAllocationRow[]): PriorityAllocationRow[] {
  const seen = new Set<string>();
  const out: PriorityAllocationRow[] = [];
  for (const row of rows) {
    const key = allocationIdentityKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function dedupeUserRows(rows: PriorityAllocationRow[]): PriorityAllocationRow[] {
  return dedupeAllocationRows(rows);
}

function statusForTier(tier: number): AllocationStatus {
  if (tier === 1) return "Primary Monitor";
  if (tier <= 2) return "Active";
  if (tier <= 4) return "Secondary Monitor";
  return "Standby";
}

/** Satellite metadata columns — always resolved live from Visibility Matrix SSOT. */
function catalogFieldsForAllocation(
  catalogRow: FlatSatelliteRow,
  intUnitSlug: string,
): Pick<
  PriorityAllocationRow,
  | "satelliteName"
  | "country"
  | "orbitalPosition"
  | "launchDate"
  | "orbitType"
  | "frequencyBand"
  | "transponders"
  | "beamDetails"
> {
  const sat = catalogRow.satellite;
  return {
    satelliteName: catalogRow.name,
    country: catalogRow.countryOfOrigin,
    orbitalPosition: normalizeOrbitalPosition(sat.position),
    launchDate: sat.launchDate,
    orbitType: sat.orbitType ?? "GEO",
    frequencyBand: parseFrequencyBand(sat),
    transponders: formatSatelliteTransponders(sat),
    beamDetails: formatUnitBeamDetailsForAllocation(intUnitSlug, sat, catalogRow.regionId),
  };
}

function enrichAllocationRowsFromVisibility(
  rows: PriorityAllocationRow[],
  intUnitSlug: string,
): PriorityAllocationRow[] {
  return rows.map((row) => {
    const catalogRow = findSatelliteCatalogRowById(row.satelliteId, intUnitSlug);
    if (!catalogRow) {
      return { ...row, orbitalPosition: normalizeOrbitalPosition(row.orbitalPosition) };
    }
    return { ...row, ...catalogFieldsForAllocation(catalogRow, intUnitSlug) };
  });
}

function lastUpdatedForSat(slot: UnitSlot, satId: string, launchDate: string): string {
  const base = parseLaunchDate(launchDate) ?? Date.UTC(2020, 0, 1);
  let h = 0;
  for (const c of slot + satId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const dayOffset = h % 180;
  const d = new Date(base + dayOffset * 86_400_000);
  d.setUTCFullYear(2025 + (h % 2));
  return d.toISOString().slice(0, 10);
}

/** Region priority tier per unit — lower number = higher priority. */
const REGION_TIERS: Record<UnitSlot, Record<string, number>> = {
  alpha: {
    china: 1,
    turkey: 2,
    pakistan: 3,
    bangladesh: 4,
    sea: 5,
    "middle-east": 5,
    russia: 6,
    europe: 6,
    africa: 7,
    usa: 8,
  },
  bravo: {
    china: 1,
    bangladesh: 2,
    pakistan: 3,
    sea: 4,
    "middle-east": 4,
    europe: 5,
    russia: 5,
    africa: 6,
    turkey: 6,
    usa: 7,
  },
  charlie: {
    pakistan: 1,
    turkey: 2,
    china: 3,
    bangladesh: 3,
    "middle-east": 4,
    sea: 4,
    russia: 5,
    europe: 5,
    africa: 6,
    usa: 7,
  },
  delta: {
    pakistan: 1,
    turkey: 2,
    china: 3,
    bangladesh: 4,
    "middle-east": 4,
    sea: 5,
    russia: 5,
    europe: 6,
    africa: 6,
    usa: 8,
  },
  echo: {
    pakistan: 1,
    turkey: 2,
    china: 3,
    bangladesh: 3,
    "middle-east": 4,
    sea: 4,
    russia: 5,
    europe: 5,
    africa: 6,
    usa: 7,
  },
  foxtrot: {
    china: 1,
    bangladesh: 2,
    pakistan: 3,
    sea: 4,
    "middle-east": 4,
    europe: 5,
    russia: 5,
    africa: 6,
    turkey: 6,
    usa: 7,
  },
  golf: {
    pakistan: 1,
    turkey: 2,
    china: 3,
    bangladesh: 4,
    "middle-east": 4,
    sea: 5,
    russia: 6,
    europe: 6,
    africa: 7,
    usa: 8,
  },
  hotel: {
    pakistan: 1,
    turkey: 2,
    china: 3,
    bangladesh: 4,
    "middle-east": 4,
    sea: 5,
    europe: 6,
    russia: 6,
    africa: 7,
    usa: 8,
  },
};

function buildSeedRowsFixed(slot: UnitSlot): PriorityAllocationRow[] {
  const tiers = REGION_TIERS[slot];
  // Dynamically created units have no seed data — they start empty.
  if (!tiers) return [];
  const catalog = flattenGlobalSatelliteCatalog();
  const visibleIds = getVisibleSatelliteCatalogIdsForUnit(slot);
  const cap = visibleIds.size;

  const ranked = catalog
    .map((row) => ({ row, tier: tiers[row.regionId] ?? 9 }))
    .filter(({ row }) => visibleIds.has(row.id))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.row.name.localeCompare(b.row.name, undefined, { sensitivity: "base" });
    })
    .slice(0, cap);

  const rows: PriorityAllocationRow[] = ranked.map(({ row, tier }, idx) => {
    const fields = catalogFieldsForAllocation(row, slot);
    return {
      id: `${slot}-${row.id}`,
      satelliteId: row.id,
      priority: tier,
      ...fields,
      status: statusForTier(tier),
      assignedBy: ASSIGNED_BY[(idx + slot.length) % ASSIGNED_BY.length],
      lastUpdated: lastUpdatedForSat(slot, row.id, row.satellite.launchDate),
    };
  });

  let seq = 0;
  let lastTier = -1;
  return rows.map((row) => {
    if (row.priority !== lastTier) {
      seq += 1;
      lastTier = row.priority;
    }
    return { ...row, priority: seq };
  });
}

type UserStore = Record<string, PriorityAllocationRow[]>;
type SuppressedStore = Record<string, string[]>; // slot → suppressed satelliteIds

const SUPPRESSED_KEY = "ssacc_priority_suppressed_sats";

function loadUserRows(slot: UnitSlot): PriorityAllocationRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserStore;
    return parsed[slot] ?? [];
  } catch {
    return [];
  }
}

function saveUserRows(slot: UnitSlot, rows: PriorityAllocationRow[]): boolean {
  try {
    const deduped = dedupeUserRows(rows);
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: UserStore = raw ? JSON.parse(raw) : {};
    parsed[slot] = deduped;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    notifyAllocationChange();
    scheduleElectronStorageFlush();
    return true;
  } catch {
    return false;
  }
}

function loadSuppressed(slot: UnitSlot): Set<string> {
  try {
    const raw = localStorage.getItem(SUPPRESSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as SuppressedStore;
    return new Set(parsed[slot] ?? []);
  } catch {
    return new Set();
  }
}

function saveSuppressed(slot: UnitSlot, ids: Set<string>, notify = true): void {
  try {
    const raw = localStorage.getItem(SUPPRESSED_KEY);
    const parsed: SuppressedStore = raw ? JSON.parse(raw) : {};
    parsed[slot] = [...ids];
    localStorage.setItem(SUPPRESSED_KEY, JSON.stringify(parsed));
    if (notify) notifyAllocationChange();
  } catch {
    /* ignore */
  }
}

/** Resolve visibility-matrix slug for a storage slot (seed alpha…hotel or op-unit-*). */
export function intUnitSlugForAllocationSlot(slot: UnitSlot): string {
  const op = slot.match(/^op-unit-(.+)$/i);
  if (op) return resolveIntUnitSlug(`op-unit-${op[1]}`, undefined) ?? op[1].toLowerCase();
  if ((UNIT_SLOTS as readonly string[]).includes(slot)) return slot;
  return resolveIntUnitSlug(slot, undefined) ?? slot;
}

function mergeAllocationsRaw(slot: UnitSlot): PriorityAllocationRow[] {
  const suppressed = loadSuppressed(slot);
  const overrides = loadPOverrides(slot);
  const seed = buildSeedRowsFixed(slot).filter((r) => !suppressed.has(r.satelliteId));
  const seedIds = new Set(seed.map((r) => r.satelliteId));
  const userExtra = loadUserRows(slot)
    .filter((r) => !seedIds.has(r.satelliteId) && !suppressed.has(r.satelliteId))
    .map((r) => ({ ...r, isUserAdded: true as const }));
  const merged = dedupeAllocationRows(
    [...seed, ...userExtra]
      .map((r) =>
        overrides[r.satelliteId] !== undefined
          ? { ...r, priority: overrides[r.satelliteId] }
          : r,
      )
      .sort((a, b) => a.priority - b.priority || a.satelliteName.localeCompare(b.satelliteName)),
  );

  return enrichAllocationRowsFromVisibility(merged, intUnitSlugForAllocationSlot(slot));
}

/**
 * Retrospectively align stored allocations with the Visibility Matrix:
 * drop non-visible satellites and trim to the visible cap (highest priority kept).
 */
export function reconcileUnitAllocationsToVisibility(
  slot: UnitSlot,
  intUnitSlug: string = intUnitSlugForAllocationSlot(slot),
): boolean {
  const visibleIds = getVisibleSatelliteCatalogIdsForUnit(intUnitSlug);
  const cap = visibleIds.size;
  const merged = mergeAllocationsRaw(slot);
  if (merged.length === 0) return false;

  const visibleRows = merged
    .filter((r) => visibleIds.has(r.satelliteId))
    .sort((a, b) => a.priority - b.priority || a.satelliteName.localeCompare(b.satelliteName));
  const keepSatIds = new Set(visibleRows.slice(0, cap).map((r) => r.satelliteId));

  const removeSatIds = new Set<string>();
  for (const row of merged) {
    if (!visibleIds.has(row.satelliteId) || !keepSatIds.has(row.satelliteId)) {
      removeSatIds.add(row.satelliteId);
    }
  }
  if (removeSatIds.size === 0) return false;

  const seedSatIds = new Set(buildSeedRowsFixed(slot).map((r) => r.satelliteId));
  const userRows = loadUserRows(slot);
  const suppressed = loadSuppressed(slot);
  const suppressedBefore = new Set(suppressed);

  const newUserRows = userRows.filter((r) => !removeSatIds.has(r.satelliteId));
  for (const satId of removeSatIds) {
    if (seedSatIds.has(satId)) suppressed.add(satId);
  }

  const userChanged = newUserRows.length !== userRows.length;
  const suppressedChanged =
    suppressed.size !== suppressedBefore.size ||
    [...removeSatIds].some((id) => seedSatIds.has(id) && !suppressedBefore.has(id));

  if (userChanged) saveUserRows(slot, newUserRows);
  if (suppressedChanged) saveSuppressed(slot, suppressed, !userChanged);

  scheduleElectronStorageFlush();
  return true;
}

function collectAllocationSlots(): Set<UnitSlot> {
  const slots = new Set<UnitSlot>(UNIT_SLOTS);
  const ingest = (raw: string | null) => {
    if (!raw) return;
    try {
      for (const slot of Object.keys(JSON.parse(raw) as Record<string, unknown>)) {
        slots.add(slot);
      }
    } catch {
      /* ignore */
    }
  };
  ingest(localStorage.getItem(STORAGE_KEY));
  ingest(localStorage.getItem(SUPPRESSED_KEY));
  return slots;
}

/**
 * Remove duplicate user-added rows persisted in localStorage (offline EXE can accumulate these).
 * Returns true when storage was modified.
 */
export function sanitizePriorityAllocationStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as UserStore;
    let changed = false;
    for (const slot of Object.keys(parsed)) {
      const suppressed = loadSuppressed(slot);
      const activeSeedKeys = new Set(
        buildSeedRowsFixed(slot)
          .filter((r) => !suppressed.has(r.satelliteId))
          .map((r) => allocationIdentityKey(r)),
      );
      const rows = parsed[slot] ?? [];
      const deduped = dedupeUserRows(rows).filter(
        (r) => !activeSeedKeys.has(allocationIdentityKey(r)),
      );
      if (deduped.length !== rows.length) {
        parsed[slot] = deduped;
        changed = true;
      }
    }
    if (!changed) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    notifyAllocationChange();
    scheduleElectronStorageFlush();
    return true;
  } catch {
    return false;
  }
}

/** Reconcile every known unit slot against the current Visibility Matrix. */
export function reconcileAllUnitAllocationsToVisibility(): number {
  if (typeof window === "undefined") return 0;
  let changed = 0;
  for (const slot of collectAllocationSlots()) {
    if (reconcileUnitAllocationsToVisibility(slot, intUnitSlugForAllocationSlot(slot))) {
      changed += 1;
    }
  }
  return changed;
}

let reconciliationInstalled = false;

/** Run on startup and whenever visibility overlay changes (EXE upgrade / matrix edits). */
export function installAllocationVisibilityReconciliation(): () => void {
  if (typeof window === "undefined" || reconciliationInstalled) return () => {};
  reconciliationInstalled = true;

  sanitizePriorityAllocationStorage();
  reconcileAllUnitAllocationsToVisibility();

  const onVisibilityChange = () => {
    sanitizePriorityAllocationStorage();
    reconcileAllUnitAllocationsToVisibility();
  };
  window.addEventListener(VISIBILITY_OVERLAY_EVENT, onVisibilityChange);
  return () => {
    reconciliationInstalled = false;
    window.removeEventListener(VISIBILITY_OVERLAY_EVENT, onVisibilityChange);
  };
}

export function getAllocationsForUnit(slot: UnitSlot): PriorityAllocationRow[] {
  return mergeAllocationsRaw(slot);
}

export function clearUserAllocationsForUnit(slot: UnitSlot): number {
  const userRows = loadUserRows(slot);
  const suppressedCount = loadSuppressed(slot).size;
  // Clear user-added rows AND restore all suppressed seed rows
  saveUserRows(slot, []);
  saveSuppressed(slot, new Set());
  return userRows.length + suppressedCount;
}

/** Remove satellites from the allocation list by row id.
 *  Works for both seed rows (added to suppressed list) and user-added rows (deleted from store). */
export function removeAllocationsByIds(slot: UnitSlot, ids: string[]): void {
  const idSet = new Set(ids);

  // Split: which are user-added rows vs seed rows
  const seed = buildSeedRowsFixed(slot);
  const seedRowMap = new Map(seed.map((r) => [r.id, r.satelliteId]));

  const suppressed = loadSuppressed(slot);
  const userRows = loadUserRows(slot);

  const newUserRows: PriorityAllocationRow[] = [];
  for (const r of userRows) {
    if (!idSet.has(r.id)) newUserRows.push(r);
  }

  for (const id of idSet) {
    const satId = seedRowMap.get(id);
    if (satId) suppressed.add(satId);
  }

  saveUserRows(slot, newUserRows);
  saveSuppressed(slot, suppressed);
}

/** @deprecated use removeAllocationsByIds */
export function removeUserAllocationsByIds(slot: UnitSlot, ids: string[]): void {
  removeAllocationsByIds(slot, ids);
}

export function getUserAllocationCount(slot: UnitSlot): number {
  return loadUserRows(slot).length;
}

/** Max satellites this unit may hold — equals visible satellites in the Visibility Matrix. */
export function getVisibleAllocationCap(intUnitSlug: string): number {
  return listVisibleSatelliteCatalogForUnit(intUnitSlug).length;
}

export function getRemainingAllocationSlots(slot: UnitSlot, intUnitSlug: string): number {
  const cap = getVisibleAllocationCap(intUnitSlug);
  const current = getAllocationsForUnit(slot).length;
  return Math.max(0, cap - current);
}

/** Human-readable block reason when an allocation cannot be added. */
export function getAllocationAddError(
  slot: UnitSlot,
  intUnitSlug: string,
  catalogRow: FlatSatelliteRow,
): string | null {
  const visibleIds = getVisibleSatelliteCatalogIdsForUnit(intUnitSlug);
  if (!visibleIds.has(catalogRow.id)) {
    return `${catalogRow.name} is not visible to this unit in the Satellite Visibility Matrix. Only visible satellites can be allocated.`;
  }

  const cap = visibleIds.size;
  if (getAllocationsForUnit(slot).length >= cap) {
    return `This unit can have at most ${cap} allocated satellite${cap !== 1 ? "s" : ""} (visibility matrix limit). Remove an allocation first.`;
  }

  if (getAllocationsForUnit(slot).some((r) => allocationIdentityKey(r) === allocationIdentityKey(catalogRow))) {
    return `${catalogRow.name} is already allocated to this unit.`;
  }

  return null;
}

export function addAllocationForUnit(
  slot: UnitSlot,
  catalogRow: FlatSatelliteRow,
  intUnitSlug: string,
  priority?: SatPriority,
): PriorityAllocationRow | null {
  const block = getAllocationAddError(slot, intUnitSlug, catalogRow);
  if (block) return null;

  // Re-adding a previously removed seed satellite must clear suppression first.
  const suppressed = loadSuppressed(slot);
  if (suppressed.has(catalogRow.id)) {
    suppressed.delete(catalogRow.id);
    saveSuppressed(slot, suppressed);
    if (priority !== undefined) savePOverride(slot, catalogRow.id, priority);
    const restored = getAllocationsForUnit(slot).find((r) => r.satelliteId === catalogRow.id);
    if (restored) return restored;
  }

  const existing = getAllocationsForUnit(slot);
  const identityKey = allocationIdentityKey(catalogRow);
  if (existing.some((r) => allocationIdentityKey(r) === identityKey)) return null;

  const userRows = loadUserRows(slot);
  const existingUser = userRows.find((r) => allocationIdentityKey(r) === identityKey);
  if (existingUser) {
    const visibleInList = existing.some((r) => allocationIdentityKey(r) === identityKey);
    if (visibleInList) {
      if (priority !== undefined) savePOverride(slot, catalogRow.id, priority);
      return existingUser;
    }
    // Orphan user row hidden from merge (e.g. stale offline data) — drop and re-add below.
    const pruned = userRows.filter((r) => allocationIdentityKey(r) !== identityKey);
    saveUserRows(slot, pruned);
  }

  const mergedAfterPrune = getAllocationsForUnit(slot);
  const maxPriority = mergedAfterPrune.reduce((m, r) => Math.max(m, r.priority), 0);
  const assignedPriority: SatPriority = priority ?? (Math.min(maxPriority + 1, 3) as SatPriority);

  const row: PriorityAllocationRow = {
    id: `${slot}-user-${catalogRow.id}-${Date.now()}`,
    satelliteId: catalogRow.id,
    priority: assignedPriority,
    ...catalogFieldsForAllocation(catalogRow, intUnitSlug),
    status: "Standby",
    assignedBy: ASSIGNED_BY[0],
    lastUpdated: new Date().toISOString().slice(0, 10),
    isUserAdded: true,
  };

  const nextUserRows = loadUserRows(slot);
  nextUserRows.push(row);
  if (!saveUserRows(slot, nextUserRows)) return null;
  if (priority !== undefined) savePOverride(slot, catalogRow.id, priority);
  return row;
}

export function sortAllocationRows(
  rows: PriorityAllocationRow[],
  key: AllocationSortKey,
  dir: SortDir,
): PriorityAllocationRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp = 0;
    if (key === "priority") cmp = a.priority - b.priority;
    else if (key === "launchDate") {
      const da = parseLaunchDate(a.launchDate);
      const db = parseLaunchDate(b.launchDate);
      if (da === null && db === null) cmp = 0;
      else if (da === null) cmp = 1;
      else if (db === null) cmp = -1;
      else cmp = da - db;
    } else {
      cmp = String(a[key]).localeCompare(String(b[key]), undefined, { sensitivity: "base" });
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return copy;
}

export function allocationRowsToCsv(rows: PriorityAllocationRow[]): Record<string, string | number>[] {
  return rows.map((r) => ({
    Priority: `P${r.priority}`,
    "Satellite Name": r.satelliteName,
    Country: r.country,
    "Orbital Position": r.orbitalPosition,
    "Launch Date": r.launchDate,
    Transponders: r.transponders,
    "Beam Details": r.beamDetails,
  }));
}

export function useAllocationCounts(extraSlots?: string[]): Record<UnitSlot, number> {
  const extraKey = (extraSlots ?? []).join(",");
  const [counts, setCounts] = useState<Record<UnitSlot, number>>(() => getAllocationCountsBySlot());

  useEffect(() => {
    const refresh = () => {
      const base = getAllocationCountsBySlot();
      for (const slot of extraKey ? extraKey.split(",") : []) {
        if (!(slot in base)) base[slot] = getAllocationCountForUnit(slot);
      }
      setCounts(base);
    };
    refresh();
    window.addEventListener(PRIORITY_ALLOCATION_EVENT, refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PRIORITY_ALLOCATION_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [extraKey]);

  return counts;
}
