/**
 * Operational SSOT generator — visibility → inventory → serviceability → engagements → intel.
 * Pure data layer; no React, no Supabase, no engagementEngine imports (avoids cycles).
 */

import { canUnitScanSatellite } from "@/lib/intelIntegrity";
import { UNIT_SATELLITE_ROSTER } from "@/lib/intelAnalysisData";
import {
  CHAIN_OPERATIONAL_RESERVE,
  INTEL_ROW_ENGAGEMENT_RATIO,
  OPERATIONAL_DATASET_VERSION,
  PER_UNIT_INVENTORY,
  TARGET_ACTIVE_SCANS,
} from "@/lib/operationalConstants";
import { EQUIPMENT_CATEGORY_DEFS } from "@/lib/equipmentCategories";
import { UNIT_LOCATIONS, type UnitSlot } from "@/lib/priorityAllocation";
import { flattenGlobalSatelliteCatalog } from "@/lib/satelliteCatalog";

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
  photo_url?: string | null;
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

/** Intel seed rows — shape compatible with computeSatelliteAnalysis filters. */
export type OpIntelRow = {
  id: string;
  unit_id: string;
  satellite_id: string;
  band: string;
  summary: string | null;
  analysis_report: string | null;
  observation_date: string;
  updated_at: string;
};

export type OperationalDataset = {
  version: typeof OPERATIONAL_DATASET_VERSION;
  units: OpUnit[];
  categories: OpCategory[];
  equipment: OpEquipment[];
  satellites: OpSatellite[];
  engagements: OpEngagement[];
  intelRows: OpIntelRow[];
  /** Set once the user mutates the dataset — prevents auto-regeneration from resurrecting deleted data. */
  userManaged?: boolean;
};

const CATEGORY_DEFS: OpCategory[] = EQUIPMENT_CATEGORY_DEFS.map((c) => ({
  id: c.id,
  name: c.name,
  sort_order: c.sort_order,
}));

const CHAIN_CATEGORY_NAMES = new Set(["Antenna", "Demodulators"]);

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
  Demodulators: "Demodulator rack — DVB-S2 / DVB-S2X capable",
};

const OTHER_SPECS = [
  "Network switch — 10 GbE ops LAN",
  "Timing reference — GPS disciplined oscillator",
  "UPS power module — 3 kVA rack mount",
  "Cooling unit — rack-mounted HVAC",
  "Monitor workstation — ops console",
  "Support test harness — loopback RF",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** ~88% operational · ~8% under repair · ~4% non-serviceable (background scatter on non-demo rows). */
function serviceabilityScatter(idx: number): OpServiceability {
  const mod = idx % 25;
  if (mod === 23) return "Under Repair";
  if (mod === 24) return "Non-Serviceable";
  return "Operational";
}

/**
 * Seed-only serviceability — applied once when the mock dataset is generated.
 * NOT used at read/display time; real Supabase rows are never altered by this.
 */
function serviceabilityForMockSeed(
  slot: UnitSlot,
  catName: string,
  itemIndex: number,
  categoryCount: number,
  svcIdx: number,
): OpServiceability {
  // One deliberately imperfect item per category for Serviceability UI demos.
  if (categoryCount > 0 && itemIndex === categoryCount) {
    const h = hashStr(`${slot}:${catName}:demo-fault`);
    if (h % 3 === 0) return "Partially Serviceable";
    if (h % 3 === 1) return "Under Repair";
    return "Non-Serviceable";
  }

  // Preserve enough operational chain hardware for engagement simulation.
  if (CHAIN_CATEGORY_NAMES.has(catName) && itemIndex <= CHAIN_OPERATIONAL_RESERVE) {
    return "Operational";
  }

  return serviceabilityScatter(svcIdx);
}

function visibleSatNames(slot: UnitSlot): string[] {
  return flattenGlobalSatelliteCatalog()
    .filter((row) => canUnitScanSatellite(row.name, slot))
    .map((row) => row.name);
}

/** Active scan satellites — INT roster first (alpha/bravo/charlie), else visibility catalog. */
function activeSatNamesForSlot(slot: UnitSlot): string[] {
  const roster = UNIT_SATELLITE_ROSTER[slot];
  if (roster?.length) {
    return roster.filter((name) => canUnitScanSatellite(name, slot));
  }
  const vis = visibleSatNames(slot);
  const target = TARGET_ACTIVE_SCANS[slot] ?? 6;
  return vis.slice(0, target);
}

function polForSat(slot: UnitSlot, satName: string): string {
  const h = (slot + satName).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const pols = ["KU-HH", "KU-VL", "C-EDGE", "KU-HL", "CH-CV"];
  return pols[h % pols.length];
}

function parsePolFromRemarks(remarks: string): string {
  const m = remarks.match(/POL:([\w-]+)/);
  return m ? m[1] : "KU-HH";
}

function equipmentSpec(catName: string, i: number): string {
  if (catName === "Other Resources") return OTHER_SPECS[(i - 1) % OTHER_SPECS.length];
  return CATEGORY_SPECS[catName] ?? `Standard ${catName} — scan-chain component`;
}

function generateIntelRowsForEngagement(eng: OpEngagement, slot: UnitSlot): OpIntelRow[] {
  const h = hashStr(eng.id);
  const scanned = 52 + (h % 120);
  const analyzedRatio = 0.55 + (h % 35) / 100;
  const analyzed = Math.min(scanned, Math.round(scanned * analyzedRatio));
  const pol = parsePolFromRemarks(eng.remarks);
  const rows: OpIntelRow[] = [];
  const baseDate = eng.observation_start ?? new Date().toISOString();

  for (let i = 0; i < scanned; i++) {
    const isAnalyzed = i < analyzed;
    const freqBase = pol.startsWith("C") ? 3700 : 11700;
    const freq = (freqBase + (h % 800) + i * 17) % 1000 + freqBase;
    rows.push({
      id: `op-intel-${eng.id}-${i}`,
      unit_id: eng.unit_id,
      satellite_id: eng.satellite_id,
      band: pol,
      summary: isAnalyzed ? `Frequency ${freq.toFixed(2)} MHz — productive signal` : null,
      analysis_report: isAnalyzed ? `INT report ${eng.id} freq ${i + 1}/${scanned}` : null,
      observation_date: baseDate,
      updated_at: eng.updated_at ?? baseDate,
    });
  }

  void slot;
  return rows;
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
  const intelRows: OpIntelRow[] = [];

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
          serviceability: serviceabilityForMockSeed(u.slot, cat.name, i, target, svcIdx),
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

    const visNames = visibleSatNames(u.slot);
    const activeSatNames = activeSatNamesForSlot(u.slot);
    for (const name of new Set([...visNames, ...activeSatNames])) {
      if (!satellitesMap.has(name.toLowerCase())) {
        const row = flattenGlobalSatelliteCatalog().find((r) => r.name === name);
        const pos = parseFloat((row?.satellite.position ?? "0").replace(/[^\d.-]/g, "")) || 0;
        satellitesMap.set(name.toLowerCase(), {
          id: `op-sat-${name.toLowerCase().replace(/\s+/g, "-")}`,
          name,
          orbital_position: pos,
        });
      }
    }

    const activeTarget = Math.min(
      TARGET_ACTIVE_SCANS[u.slot] ?? 6,
      activeSatNames.length,
      antennas.length,
      demods.length,
    );

    for (let i = 0; i < activeTarget; i++) {
      const satName = activeSatNames[i];
      const sat = satellitesMap.get(satName.toLowerCase());
      if (!sat) continue;

      const eng: OpEngagement = {
        id: `op-eng-${u.slot}-active-${i}`,
        unit_id: unitId,
        satellite_id: sat.id,
        status: "In Progress",
        observation_start: new Date(Date.now() - (i + 1) * 2_700_000).toISOString(),
        updated_at: new Date().toISOString(),
        antenna_id: antennas[i]?.id ?? null,
        demodulator_id: demods[i]?.id ?? null,
        processing_server_id: null,
        remarks: `POL:${polForSat(u.slot, satName)} · Active collection cycle`,
        satellites: { name: satName },
      };
      engagements.push(eng);
      intelRows.push(...generateIntelRowsForEngagement(eng, u.slot));
    }

    for (let i = 0; i < 5; i++) {
      const satName = visNames[(activeTarget + i) % Math.max(visNames.length, 1)];
      if (!satName) continue;
      const sat = satellitesMap.get(satName.toLowerCase());
      if (!sat) continue;
      const eng: OpEngagement = {
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
      };
      engagements.push(eng);
      if (i < Math.ceil(5 * INTEL_ROW_ENGAGEMENT_RATIO)) {
        intelRows.push(...generateIntelRowsForEngagement(eng, u.slot));
      }
    }
  }

  return {
    version: OPERATIONAL_DATASET_VERSION,
    units,
    categories: CATEGORY_DEFS,
    equipment,
    satellites: [...satellitesMap.values()],
    engagements,
    intelRows,
  };
}

let _seedUnitIdentities: Map<string, { name: string; description: string | null }> | null = null;

/** Lightweight seed unit names — avoids full dataset regeneration on every store read. */
export function getSeedUnitIdentities(): Map<string, { name: string; description: string | null }> {
  if (!_seedUnitIdentities) {
    _seedUnitIdentities = new Map(
      UNIT_DEFS.map((u) => [
        `op-unit-${u.slot}`,
        { name: u.name, description: `${u.description} · ${UNIT_LOCATIONS[u.slot]}` },
      ]),
    );
  }
  return _seedUnitIdentities;
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

/** Prefer user-entered unit name; fall back to code-derived label. */
export function unitDisplayLabel(unit: { code: string; name?: string | null }): string {
  const name = unit.name?.trim();
  return name || unitLabelFromCode(unit.code);
}

/** Prefer user-entered location; fall back to seed/default location when provided. */
export function unitDisplayLocation(
  unit: { description?: string | null },
  seedLocation?: string | null,
): string {
  const loc = unit.description?.trim();
  return loc || seedLocation?.trim() || "—";
}
