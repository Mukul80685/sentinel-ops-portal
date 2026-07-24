import type { UnitSlot } from "@/lib/priorityAllocation";

/** Active scan targets — capped at generation by operational chain capacity (min 8 per stage). */
export const TARGET_ACTIVE_SCANS: Record<UnitSlot, number> = {
  alpha: 7,
  bravo: 7,
  charlie: 6,
  delta: 7,
  echo: 6,
  foxtrot: 7,
  golf: 6,
  hotel: 7,
};

/**
 * Per-unit inventory — Antenna, Demodulators, and Other Resources only.
 * Profiles differ per unit.
 */
export const PER_UNIT_INVENTORY: Record<UnitSlot, Record<string, number>> = {
  alpha: { Antenna: 12, Demodulators: 18, "Other Resources": 12 },
  bravo: { Antenna: 11, Demodulators: 17, "Other Resources": 11 },
  charlie: { Antenna: 10, Demodulators: 16, "Other Resources": 10 },
  delta: { Antenna: 12, Demodulators: 18, "Other Resources": 12 },
  echo: { Antenna: 11, Demodulators: 16, "Other Resources": 10 },
  foxtrot: { Antenna: 12, Demodulators: 17, "Other Resources": 11 },
  golf: { Antenna: 10, Demodulators: 15, "Other Resources": 9 },
  hotel: { Antenna: 11, Demodulators: 16, "Other Resources": 10 },
};

/** Minimum guaranteed operational items per chain category (supports simultaneous scans). */
export const CHAIN_OPERATIONAL_RESERVE = 7;

/** Target share of engagements that receive intel seed rows. */
export const INTEL_ROW_ENGAGEMENT_RATIO = 0.65;

export const OPERATIONAL_STORE_KEY = "ssacc_operational_store_v2";
export const OPERATIONAL_STORE_EVENT = "ssacc-operational-store-change";
/** Dedicated persistence for unit renames — survives store regeneration and SSR hydration. */
export const UNIT_IDENTITY_OVERRIDES_KEY = "ssacc_unit_identity_v1";
export const OPERATIONAL_DATASET_VERSION = 10 as const;

/** Supabase must exceed these counts to override the local operational SSOT. */
export const MIN_DB_EQUIPMENT_FOR_OVERRIDE = 300;
export const MIN_DB_ENGAGEMENTS_FOR_OVERRIDE = 40;
