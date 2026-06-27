/**
 * Operational SSOT generator — visibility → inventory → serviceability → engagements.
 * Pure data layer; no React, no Supabase, no engagementEngine imports (avoids cycles).
 */

import { canUnitScanSatellite } from "@/lib/intelIntegrity";
import {
  OPERATIONAL_DATASET_VERSION,
  PER_UNIT_INVENTORY,
  TARGET_ACTIVE_SCANS,
} from "@/lib/operationalConstants";
import { UNIT_LOCATIONS, type UnitSlot } from "@/lib/priorityAllocation";
import { flattenSatelliteCatalog } from "@/lib/satelliteCatalog";

export type OpServiceability =
  | "Operational"
  | "Partially Serviceable"
  | "Under Repair"
  | "Non-Serviceable";

export type OpUnit = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  slot: UnitSlot;
};

export type OpCategory = { id: string; name: string; sort_order: number };

export type OpEquipment = {
  id: string;
  unit_id: string;
  category_id: string;
  name: string;
  make: string;
  model: string;
  serial_number: string;
  date_of_procurement: string;
  specifications: string;
  serviceability: OpServiceability;
  remarks: string | null;
  category: { id: string; name: string };
  units?: { code: string; name: string };
};

export type OpSatellite = { id: string; name: string; orbital_position: number };

export type OpEngagement = {
  id: string;
  unit_id: string;
  satellite_id: string;
  status: "In Progress" | "Completed" | "Planned" | "Paused" | "Failed";
  observation_start: string;
  updated_at: string;
  antenna_id: string | null;
  demodulator_id: string | null;
  processing_server_id: string | null;
  remarks: string;
  satellites: { name: string };
};

export type OperationalDataset = {
  version: typeof OPERATIONAL_DATASET_VERSION;
  units: OpUnit[];
  categories: OpCategory[];
  equipment: OpEquipment[];
  satellites: OpSatellite[];
  engagements: OpEngagement[];
};

const CATEGORY_DEFS: OpCategory[] = [
  { id: "op-cat-antenna", name: "Antenna", sort_order: 1 },
  { id: "op-cat-lna", name: "LNA", sort_order: 2 },
  { id: "op-cat-lnb", name: "LNB", sort_order: 3 },
  { id: "op-cat-demod", name: "Demodulators", sort_order: 4 },
  { id: "op-cat-proc", name: "Processing Servers", sort_order: 5 },
  { id: "op-cat-other", name: "Other Resources", sort_order: 6 },
];

const CHAIN_CATEGORY_NAMES = new Set([
  "Antenna",
  "LNA",
  "Demodulators",
  "Processing Servers",
]);

/** Guarantee at least one operational item per mandatory chain stage. */
const CHAIN_RESERVE_PER_CATEGORY = 1;

const UNIT_DEFS: { slot: UnitSlot; code: string; name: string; description: string }[] = [
  { slot: "alpha", code: "GATE-A", name: "GATE Alpha", description: "Primary tracking station — North Sector" },
  { slot: "bravo", code: "GATE-B", name: "GATE Bravo", description: "Forward listening post — East Ridge" },
  { slot: "charlie", code: "GATE-C", name: "GATE Charlie", description: "Mobile collection unit — Convoy 3" },
  { slot: "delta", code: "GATE-D", name: "GATE Delta", description: "Strategic analysis hub — HQ Bunker" },
  { slot: "echo", code: "GATE-E", name: "GATE Echo", description: "Mountain relay — Peak 4" },
  { slot: "foxtrot", code: "GATE-F", name: "GATE Foxtrot", description: "Naval signals platform — SS Vigilant" },
  { slot: "golf", code: "GATE-G", name: "GATE Golf", description: "Desert array — Site G7" },
  { slot: "hotel", code: "GATE-H", name: "GATE Hotel", description: "Backup operations centre — South Wing" },
];

const MAKES = ["Hughes", "ViaSat", "Comtech", "Newtec", "Kratos", "Thales"] as const;

const CATEGORY_SPECS: Record<string, string> = {
  Antenna: "Tracking antenna — dual-axis motorized dish",
  LNA: "Low-noise amplifier — Ku/C-band front-end",
  LNB: "Block downconverter — multi-band RF input",
  Demodulators: "Demodulator rack — DVB-S2 / DVB-S2X capable",
  "Processing Servers": "Signal processor — real-time demod + decode",
};

const OTHER_SPECS = [
  "Network switch — 10 GbE ops LAN",
  "Timing reference — GPS disciplined oscillator",
  "UPS power module — 3 kVA rack mount",
  "Cooling unit — rack-mounted HVAC",
  "Monitor workstation — ops console",
  "Support test harness — loopback RF",
];

/** ~85% Operational · ~10% Under Repair · ~5% Non-Serviceable (non-reserved items). */
function serviceabilityForIndex(idx: number): OpServiceability {
  const mod = idx % 20;
  if (mod === 17 || mod === 18) return "Under Repair";
  if (mod === 19) return "Non-Serviceable";
  return "Operational";
}

function serviceabilityForEquipment(
  catName: string,
  itemIndex: number,
  svcIdx: number,
): OpServiceability {
  if (CHAIN_CATEGORY_NAMES.has(catName) && itemIndex <= CHAIN_RESERVE_PER_CATEGORY) {
    return "Operational";
  }
  return serviceabilityForIndex(svcIdx);
}

function visibleSatNames(slot: UnitSlot): string[] {
  return flattenSatelliteCatalog()
    .filter((row) => canUnitScanSatellite(row.name, slot))
    .map((row) => row.name);
}

function polForSat(slot: UnitSlot, satName: string): string {
  const h = (slot + satName).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const pols = ["KU-HH", "KU-VL", "C-EDGE", "KU-HL", "CH-CV"];
  return pols[h % pols.length];
}

function equipmentSpec(catName: string, i: number): string {
  if (catName === "Other Resources") return OTHER_SPECS[(i - 1) % OTHER_SPECS.length];
  return CATEGORY_SPECS[catName] ?? `Standard ${catName} — scan-chain component`;
}

export function generateOperationalDataset(): OperationalDataset {
  const units: OpUnit[] = UNIT_DEFS.map((u) => ({
    id: `op-unit-${u.slot}`,
    code: u.code,
    name: u.name,
    description: `${u.description} · ${UNIT_LOCATIONS[u.slot]}`,
    slot: u.slot,
  }));

  const equipment: OpEquipment[] = [];
  const satellitesMap = new Map<string, OpSatellite>();
  const engagements: OpEngagement[] = [];

  for (const u of UNIT_DEFS) {
    const unitId = `op-unit-${u.slot}`;
    const inventory = PER_UNIT_INVENTORY[u.slot];

    for (const cat of CATEGORY_DEFS) {
      const target = inventory[cat.name] ?? 0;
      for (let i = 1; i <= target; i++) {
        const svcIdx = i + cat.sort_order * 13 + u.code.charCodeAt(4);
        equipment.push({
          id: `op-eq-${u.slot}-${cat.id}-${i}`,
          unit_id: unitId,
          category_id: cat.id,
          name: `${cat.name} / ${u.code}-${String(i).padStart(2, "0")}`,
          make: MAKES[(i + u.code.length) % MAKES.length],
          model: `M${1000 + ((i * 137 + u.code.charCodeAt(0)) % 9000)}`,
          serial_number: `SN-${u.code}-${cat.id.slice(-3)}-${String(i).padStart(3, "0")}`,
          date_of_procurement: new Date(Date.now() - i * 86_400_000 * 45).toISOString().slice(0, 10),
          specifications: equipmentSpec(cat.name, i),
          serviceability: serviceabilityForEquipment(cat.name, i, svcIdx),
          remarks: null,
          category: { id: cat.id, name: cat.name },
          units: { code: u.code, name: u.name },
        });
      }
    }

    const pickOp = (match: string) =>
      equipment.filter(
        (e) =>
          e.unit_id === unitId &&
          e.category.name.toLowerCase().includes(match) &&
          e.serviceability === "Operational",
      );

    const antennas = pickOp("antenna");
    const demods = pickOp("demodulat");
    const procs = pickOp("processing");

    const visNames = visibleSatNames(u.slot);
    for (const name of visNames) {
      if (!satellitesMap.has(name.toLowerCase())) {
        const row = flattenSatelliteCatalog().find((r) => r.name === name);
        const pos = parseFloat((row?.satellite.position ?? "0").replace(/[^\d.-]/g, "")) || 0;
        satellitesMap.set(name.toLowerCase(), {
          id: `op-sat-${name.toLowerCase().replace(/\s+/g, "-")}`,
          name,
          orbital_position: pos,
        });
      }
    }

    const activeTarget = Math.min(
      TARGET_ACTIVE_SCANS[u.slot] ?? 4,
      antennas.length,
      demods.length,
      procs.length,
      visNames.length,
    );

    for (let i = 0; i < activeTarget; i++) {
      const satName = visNames[i];
      const sat = satellitesMap.get(satName.toLowerCase());
      if (!sat) continue;

      engagements.push({
        id: `op-eng-${u.slot}-active-${i}`,
        unit_id: unitId,
        satellite_id: sat.id,
        status: "In Progress",
        observation_start: new Date(Date.now() - (i + 1) * 2_700_000).toISOString(),
        updated_at: new Date().toISOString(),
        antenna_id: antennas[i]?.id ?? null,
        demodulator_id: demods[i]?.id ?? null,
        processing_server_id: procs[i]?.id ?? null,
        remarks: `POL:${polForSat(u.slot, satName)} · Active collection cycle`,
        satellites: { name: satName },
      });
    }

    for (let i = 0; i < 5; i++) {
      const satName = visNames[(activeTarget + i) % Math.max(visNames.length, 1)];
      if (!satName) continue;
      const sat = satellitesMap.get(satName.toLowerCase());
      if (!sat) continue;
      engagements.push({
        id: `op-eng-${u.slot}-done-${i}`,
        unit_id: unitId,
        satellite_id: sat.id,
        status: "Completed",
        observation_start: new Date(Date.now() - (i + 3) * 7_200_000).toISOString(),
        updated_at: new Date(Date.now() - i * 3_600_000).toISOString(),
        antenna_id: null,
        demodulator_id: null,
        processing_server_id: null,
        remarks: `POL:${polForSat(u.slot, satName)} · Completed scan cycle`,
        satellites: { name: satName },
      });
    }
  }

  return {
    version: OPERATIONAL_DATASET_VERSION,
    units,
    categories: CATEGORY_DEFS,
    equipment,
    satellites: [...satellitesMap.values()],
    engagements,
  };
}

export function unitSlotFromDbUnit(
  unit: { id: string; code: string },
  dataset: OperationalDataset,
): UnitSlot | null {
  const op = dataset.units.find((u) => u.id === unit.id || u.code === unit.code);
  return op?.slot ?? null;
}

export function unitLabelFromCode(code: string): string {
  const letter = code.replace(/^GATE[-\s]?/i, "").trim().charAt(0).toUpperCase();
  return letter ? `Unit ${letter}` : code;
}
