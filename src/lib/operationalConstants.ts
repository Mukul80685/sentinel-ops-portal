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
 * Per-unit chain inventory — minimum 8–10 items in each RF/processing category.
 * LNA category feeds the engine lnbs stage; LNB is tracked separately in inventory.
 * Profiles differ per unit; Other Resources varies.
 */
export const PER_UNIT_INVENTORY: Record<UnitSlot, Record<string, number>> = {
  alpha: {
    Antenna: 10,
    LNA: 10,
    LNB: 10,
    Demodulators: 10,
    "Processing Servers": 10,
    "Other Resources": 4,
  },
  bravo: {
    Antenna: 9,
    LNA: 10,
    LNB: 9,
    Demodulators: 10,
    "Processing Servers": 9,
    "Other Resources": 3,
  },
  charlie: {
    Antenna: 8,
    LNA: 9,
    LNB: 10,
    Demodulators: 9,
    "Processing Servers": 10,
    "Other Resources": 2,
  },
  delta: {
    Antenna: 10,
    LNA: 10,
    LNB: 9,
    Demodulators: 10,
    "Processing Servers": 10,
    "Other Resources": 5,
  },
  echo: {
    Antenna: 9,
    LNA: 8,
    LNB: 9,
    Demodulators: 10,
    "Processing Servers": 9,
    "Other Resources": 3,
  },
  foxtrot: {
    Antenna: 10,
    LNA: 10,
    LNB: 10,
    Demodulators: 9,
    "Processing Servers": 10,
    "Other Resources": 4,
  },
  golf: {
    Antenna: 8,
    LNA: 8,
    LNB: 9,
    Demodulators: 8,
    "Processing Servers": 9,
    "Other Resources": 2,
  },
  hotel: {
    Antenna: 9,
    LNA: 10,
    LNB: 10,
    Demodulators: 10,
    "Processing Servers": 8,
    "Other Resources": 3,
  },
};

/** Minimum guaranteed operational items per chain category (supports 6–7 simultaneous scans). */
export const CHAIN_OPERATIONAL_RESERVE = 7;

/** Target share of engagements that receive intel seed rows. */
export const INTEL_ROW_ENGAGEMENT_RATIO = 0.65;

export const OPERATIONAL_STORE_KEY = "ssacc_operational_store_v2";
export const OPERATIONAL_STORE_EVENT = "ssacc-operational-store-change";
export const OPERATIONAL_DATASET_VERSION = 9 as const;

/** Supabase must exceed these counts to override the local operational SSOT. */
export const MIN_DB_EQUIPMENT_FOR_OVERRIDE = 300;
export const MIN_DB_ENGAGEMENTS_FOR_OVERRIDE = 40;
