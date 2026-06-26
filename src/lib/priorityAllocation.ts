/**
 * Satellite Priority & Allocation — seeded from Visibility Matrix SSOT (46 satellites).
 * Excludes visibility metrics; operational allocation data only.
 */

import {
  flattenSatelliteCatalog,
  parseLaunchDate,
  type FlatSatelliteRow,
} from "@/lib/satelliteCatalog";
import type { GeoSatellite } from "@/lib/visibilityMatrix";
import { getBeamBreakdown, formatSatelliteTransponders } from "@/lib/visibilityMatrix";
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

export type UnitSlot = (typeof UNIT_SLOTS)[number];

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
  if (slot) return UNIT_SHORT_LABEL[slot];
  return "Unit";
}

export function unitTileTitle(slot: UnitSlot): string {
  return `Unit ${UNIT_SLOT_DISPLAY[slot]}`;
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

function statusForTier(tier: number): AllocationStatus {
  if (tier === 1) return "Primary Monitor";
  if (tier <= 2) return "Active";
  if (tier <= 4) return "Secondary Monitor";
  return "Standby";
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

const UNIT_SAT_CAP: Partial<Record<UnitSlot, number>> = {
  alpha: 42,
  bravo: 40,
  charlie: 38,
  delta: 36,
  echo: 38,
  foxtrot: 41,
  golf: 30,
  hotel: 28,
};

function buildSeedRowsFixed(slot: UnitSlot): PriorityAllocationRow[] {
  const catalog = flattenSatelliteCatalog();
  const tiers = REGION_TIERS[slot];
  const cap = UNIT_SAT_CAP[slot] ?? 36;

  const ranked = catalog
    .map((row) => ({ row, tier: tiers[row.regionId] ?? 9 }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.row.name.localeCompare(b.row.name, undefined, { sensitivity: "base" });
    })
    .slice(0, cap);

  const rows: PriorityAllocationRow[] = ranked.map(({ row, tier }, idx) => {
    const sat = row.satellite;
    const { beams } = getBeamBreakdown(sat);
    const beamSummary =
      beams.length > 0
        ? `${beams.length} beams — ${beams.slice(0, 2).join(", ")}${beams.length > 2 ? "…" : ""}`
        : sat.beamCoverage;

    return {
      id: `${slot}-${row.id}`,
      satelliteId: row.id,
      priority: tier,
      satelliteName: row.name,
      country: row.countryOfOrigin,
      orbitalPosition: sat.position,
      launchDate: sat.launchDate,
      orbitType: sat.orbitType ?? "GEO",
      frequencyBand: parseFrequencyBand(sat),
      transponders: formatSatelliteTransponders(sat),
      beamDetails: beamSummary,
      status: statusForTier(tier),
      assignedBy: ASSIGNED_BY[(idx + slot.length) % ASSIGNED_BY.length],
      lastUpdated: lastUpdatedForSat(slot, row.id, sat.launchDate),
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

function saveUserRows(slot: UnitSlot, rows: PriorityAllocationRow[]): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: UserStore = raw ? JSON.parse(raw) : {};
    parsed[slot] = rows;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    notifyAllocationChange();
  } catch {
    /* ignore */
  }
}

export function getAllocationsForUnit(slot: UnitSlot): PriorityAllocationRow[] {
  const seed = buildSeedRowsFixed(slot);
  const seedIds = new Set(seed.map((r) => r.satelliteId));
  const userExtra = loadUserRows(slot).filter((r) => !seedIds.has(r.satelliteId));
  const merged = [...seed, ...userExtra].sort((a, b) => a.priority - b.priority || a.satelliteName.localeCompare(b.satelliteName));
  return merged;
}

export function clearUserAllocationsForUnit(slot: UnitSlot): number {
  const removed = loadUserRows(slot).length;
  saveUserRows(slot, []);
  return removed;
}

export function getUserAllocationCount(slot: UnitSlot): number {
  return loadUserRows(slot).length;
}

export function addAllocationForUnit(
  slot: UnitSlot,
  catalogRow: FlatSatelliteRow,
): PriorityAllocationRow | null {
  const existing = getAllocationsForUnit(slot);
  if (existing.some((r) => r.satelliteId === catalogRow.id)) return null;

  const maxPriority = existing.reduce((m, r) => Math.max(m, r.priority), 0);
  const sat = catalogRow.satellite;
  const { beams } = getBeamBreakdown(sat);
  const beamSummary =
    beams.length > 0
      ? `${beams.length} beams — ${beams.slice(0, 2).join(", ")}${beams.length > 2 ? "…" : ""}`
      : sat.beamCoverage;

  const row: PriorityAllocationRow = {
    id: `${slot}-user-${catalogRow.id}-${Date.now()}`,
    satelliteId: catalogRow.id,
    priority: maxPriority + 1,
    satelliteName: catalogRow.name,
    country: catalogRow.countryOfOrigin,
    orbitalPosition: sat.position,
    launchDate: sat.launchDate,
    orbitType: sat.orbitType ?? "GEO",
    frequencyBand: parseFrequencyBand(sat),
    transponders: formatSatelliteTransponders(sat),
    beamDetails: beamSummary,
    status: "Standby",
    assignedBy: ASSIGNED_BY[0],
    lastUpdated: new Date().toISOString().slice(0, 10),
  };

  const userRows = loadUserRows(slot);
  userRows.push(row);
  saveUserRows(slot, userRows);
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
    Priority: r.priority,
    "Satellite Name": r.satelliteName,
    Country: r.country,
    "Orbital Position": r.orbitalPosition,
    "Launch Date": r.launchDate,
    Transponders: r.transponders,
    "Beam Details": r.beamDetails,
  }));
}

export function useAllocationCounts(): Record<UnitSlot, number> {
  const [counts, setCounts] = useState<Record<UnitSlot, number>>(() => getAllocationCountsBySlot());

  useEffect(() => {
    const refresh = () => setCounts(getAllocationCountsBySlot());
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
  }, []);

  return counts;
}
