import type { UnitSlot } from "@/lib/priorityAllocation";

/** Active scan targets per unit — capped at generation time by operational chain capacity. */
export const TARGET_ACTIVE_SCANS: Record<UnitSlot, number> = {
  alpha: 6,
  bravo: 5,
  charlie: 4,
  delta: 6,
  echo: 5,
  foxtrot: 7,
  golf: 4,
  hotel: 5,
};

/**
 * Per-unit inventory — 8–12 total resources, unique distribution per unit.
 * Categories: Antenna, LNA, LNB, Demodulators, Processing Servers, Other Resources only.
 */
export const PER_UNIT_INVENTORY: Record<UnitSlot, Record<string, number>> = {
  // 12 — antenna-heavy, forward collection
  alpha: {
    Antenna: 3,
    LNA: 2,
    LNB: 1,
    Demodulators: 2,
    "Processing Servers": 3,
    "Other Resources": 1,
  },
  // 11 — compute-heavy processing stack
  bravo: {
    Antenna: 1,
    LNA: 1,
    LNB: 2,
    Demodulators: 2,
    "Processing Servers": 4,
    "Other Resources": 1,
  },
  // 10 — RF-chain balanced
  charlie: {
    Antenna: 2,
    LNA: 2,
    LNB: 2,
    Demodulators: 2,
    "Processing Servers": 1,
    "Other Resources": 1,
  },
  // 12 — evenly distributed ops hub
  delta: {
    Antenna: 2,
    LNA: 2,
    LNB: 2,
    Demodulators: 3,
    "Processing Servers": 2,
    "Other Resources": 1,
  },
  // 9 — lean field unit, no spare other gear
  echo: {
    Antenna: 2,
    LNA: 2,
    LNB: 1,
    Demodulators: 2,
    "Processing Servers": 2,
    "Other Resources": 0,
  },
  // 11 — tracking-array focused
  foxtrot: {
    Antenna: 4,
    LNA: 2,
    LNB: 1,
    Demodulators: 2,
    "Processing Servers": 1,
    "Other Resources": 1,
  },
  // 8 — minimal deployable footprint
  golf: {
    Antenna: 2,
    LNA: 1,
    LNB: 1,
    Demodulators: 2,
    "Processing Servers": 1,
    "Other Resources": 1,
  },
  // 10 — demodulator-rich analysis post
  hotel: {
    Antenna: 2,
    LNA: 1,
    LNB: 2,
    Demodulators: 3,
    "Processing Servers": 1,
    "Other Resources": 1,
  },
};

export const OPERATIONAL_STORE_KEY = "ssacc_operational_store_v2";
export const OPERATIONAL_STORE_EVENT = "ssacc-operational-store-change";
export const OPERATIONAL_DATASET_VERSION = 5 as const;
