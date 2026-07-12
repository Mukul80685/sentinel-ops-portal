import type { OpEngagement, OpEquipment, OpIntelRow } from "@/lib/operationalDataset";
import {
  ensureOperationalDataset,
  getOperationalDataset,
  getOperationalIntelRows,
} from "@/lib/operationalStore";

/**
 * -----------------------------
 * CORE TYPES
 * -----------------------------
 */

export type Unit = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

export type Satellite = {
  id: string;
  name: string;
  orbital_position: number;
  notes: string | null;
  launch_date?: string | null;
  transponder_count?: number | null;
  frequency_bands?: string[] | null;
};

export type Category = {
  id: string;
  name: string;
  sort_order: number;
};

export type Serviceability =
  | "Operational"
  | "Partially Serviceable"
  | "Under Repair"
  | "Non-Serviceable";

export type Priority = "Critical" | "High" | "Medium" | "Low";

export type EngStatus =
  | "Planned"
  | "In Progress"
  | "Completed"
  | "Paused"
  | "Failed";

export type EquipmentRow = OpEquipment;

/**
 * -----------------------------
 * UNIT API
 * -----------------------------
 */

export async function listUnits(): Promise<Unit[]> {
  return ensureOperationalDataset().units.map(({ slot: _s, ...u }) => u);
}

export async function getUnitById(unitId: string): Promise<Unit | null> {
  const op = getOperationalDataset().units.find((u) => u.id === unitId);
  if (!op) return null;
  const { slot: _s, ...rest } = op;
  return rest;
}

/**
 * -----------------------------
 * SATELLITES
 * -----------------------------
 */

export async function listSatellites(): Promise<Satellite[]> {
  const ds = ensureOperationalDataset();
  return ds.satellites.map((s) => ({
    id: s.id,
    name: s.name,
    orbital_position: s.orbital_position,
    notes: "Operational dataset",
  }));
}

/**
 * -----------------------------
 * CATEGORIES
 * -----------------------------
 */

export async function listCategories(): Promise<Category[]> {
  return ensureOperationalDataset().categories;
}

/**
 * -----------------------------
 * EQUIPMENT
 * -----------------------------
 */

export async function listAllEquipment(): Promise<EquipmentRow[]> {
  return ensureOperationalDataset().equipment;
}

export async function listAllEquipmentDetailed(): Promise<EquipmentRow[]> {
  return ensureOperationalDataset().equipment;
}

export async function listEquipmentForUnit(
  unitId: string
): Promise<EquipmentRow[]> {
  const all = await listAllEquipment();
  return all.filter((e) => e.unit_id === unitId);
}

export async function getEquipmentById(
  equipmentId: string,
): Promise<EquipmentRow | null> {
  return getOperationalDataset().equipment.find((e) => e.id === equipmentId) ?? null;
}

/**
 * -----------------------------
 * ENGAGEMENTS
 * -----------------------------
 */

export async function listEngagementsForUnit(
  unitId: string
): Promise<OpEngagement[]> {
  return ensureOperationalDataset().engagements.filter(
    (e) => e.unit_id === unitId
  );
}

/**
 * -----------------------------
 * UI HELPERS
 * -----------------------------
 */

export function statusClass(s: Serviceability) {
  switch (s) {
    case "Operational":
      return "status-ok";
    case "Partially Serviceable":
      return "status-warn";
    case "Under Repair":
      return "status-repair";
    case "Non-Serviceable":
      return "status-bad";
  }
}

export function priorityClass(p: Priority) {
  switch (p) {
    case "Critical":
      return "bg-destructive text-destructive-foreground";
    case "High":
      return "bg-accent text-accent-foreground";
    case "Medium":
      return "bg-primary/30 text-foreground border border-primary/50";
    case "Low":
      return "bg-secondary text-muted-foreground";
  }
}

export function engStatusClass(s: EngStatus) {
  switch (s) {
    case "Planned":
      return "bg-secondary text-muted-foreground";
    case "In Progress":
      return "bg-primary text-primary-foreground";
    case "Completed":
      return "bg-emerald-700/70 text-emerald-50";
    case "Paused":
      return "bg-accent text-accent-foreground";
    case "Failed":
      return "bg-destructive text-destructive-foreground";
  }
}

/**
 * -----------------------------
 * INTEL RECORDS
 * -----------------------------
 */

export const INTEL_RECORDS_ALL_KEY = ["intel-records", "all"] as const;

type IntelEnrichmentIndex = {
  satellites: Map<string, { id: string; name: string }>;
  units: Map<string, { code: string }>;
  engagementBySatellite: Map<string, OpEngagement>;
};

function buildIntelEnrichmentIndex(ds: ReturnType<typeof ensureOperationalDataset>): IntelEnrichmentIndex {
  const satellites = new Map(ds.satellites.map((s) => [s.id, s] as const));
  const units = new Map(ds.units.map((u) => [u.id, u] as const));
  const engagementBySatellite = new Map<string, OpEngagement>();
  for (const eng of ds.engagements) {
    if (!engagementBySatellite.has(eng.satellite_id)) {
      engagementBySatellite.set(eng.satellite_id, eng);
    }
  }
  return { satellites, units, engagementBySatellite };
}

function enrichOperationalIntelRow(row: OpIntelRow, index: IntelEnrichmentIndex): any {
  const satRecord = index.satellites.get(row.satellite_id);
  const unit = index.units.get(row.unit_id);
  const eng = index.engagementBySatellite.get(row.satellite_id);
  const satName = satRecord?.name ?? eng?.satellites?.name ?? "—";
  const freqMatch = row.summary?.match(/Frequency\s+([\d.]+\s*MHz)/i);
  const frequency = freqMatch?.[1] ?? row.band;

  return {
    ...row,
    frequency,
    satellites: { id: row.satellite_id, name: satName },
    units: { code: unit?.code ?? "—" },
  };
}

export async function listAllIntelRecords(): Promise<any[]> {
  const ds = ensureOperationalDataset();
  const index = buildIntelEnrichmentIndex(ds);
  return getOperationalIntelRows().map((row) => enrichOperationalIntelRow(row, index));
}

export async function listIntelRecordsForUnit(unitId: string): Promise<any[]> {
  const ds = ensureOperationalDataset();
  const index = buildIntelEnrichmentIndex(ds);
  return getOperationalIntelRows()
    .filter((r) => r.unit_id === unitId)
    .map((row) => enrichOperationalIntelRow(row, index));
}

export async function getIntelRecordById(intelId: string): Promise<any | null> {
  const ds = ensureOperationalDataset();
  const row = getOperationalIntelRows().find((r) => r.id === intelId);
  if (!row) return null;
  return enrichOperationalIntelRow(row, buildIntelEnrichmentIndex(ds));
}

/**
 * -----------------------------
 * CSV EXPORT
 * -----------------------------
 */

export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;

  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };

  const csv = [
    keys.join(","),
    ...rows.map((r) => keys.map((k) => esc(r[k])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
