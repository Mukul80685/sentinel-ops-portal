import { supabase } from "@/integrations/supabase/client";
import type { OpEngagement, OpEquipment } from "@/lib/operationalDataset";
import { shouldUseOperationalStore } from "@/lib/operationalDataSource";
import {
  ensureOperationalDataset,
  getOperationalDataset,
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
  if (await shouldUseOperationalStore()) {
    const ds = ensureOperationalDataset();
    return ds.units as Unit[];
  }

  const { data, error } = await supabase.from("units").select("*").order("code");
  if (error) throw error;
  return (data ?? []) as Unit[];
}

export async function getUnitById(unitId: string): Promise<Unit | null> {
  if (await shouldUseOperationalStore()) {
    const ds = ensureOperationalDataset();
    return ds.units.find((u) => u.id === unitId) ?? null;
  }

  const { data, error } = await supabase
    .from("units")
    .select("*")
    .eq("id", unitId)
    .maybeSingle();

  if (error) throw error;
  return data as Unit | null;
}

/**
 * -----------------------------
 * SATELLITES
 * -----------------------------
 */

export async function listSatellites(): Promise<Satellite[]> {
  if (await shouldUseOperationalStore()) {
    const ds = ensureOperationalDataset();
    return ds.satellites.map((s) => ({
      id: s.id,
      name: s.name,
      orbital_position: s.orbital_position,
      notes: "Operational dataset",
    }));
  }

  const { data, error } = await supabase
    .from("satellites")
    .select("*")
    .order("orbital_position");

  if (error) throw error;
  return (data ?? []) as Satellite[];
}

/**
 * -----------------------------
 * CATEGORIES
 * -----------------------------
 */

export async function listCategories(): Promise<Category[]> {
  if (await shouldUseOperationalStore()) {
    return ensureOperationalDataset().categories;
  }

  const { data, error } = await supabase
    .from("equipment_categories")
    .select("*")
    .order("sort_order");

  if (error) throw error;
  return (data ?? []) as Category[];
}

/**
 * -----------------------------
 * EQUIPMENT
 * -----------------------------
 */

export async function listAllEquipment(): Promise<EquipmentRow[]> {
  if (await shouldUseOperationalStore()) {
    return ensureOperationalDataset().equipment;
  }

  const { data, error } = await supabase
    .from("equipment")
    .select(
      "id,unit_id,serviceability,category_id,name,make,model,serial_number,date_of_procurement,specifications,remarks,category:category_id(id,name)",
    );

  if (error) throw error;
  return (data ?? []) as EquipmentRow[];
}

export async function listAllEquipmentDetailed(): Promise<EquipmentRow[]> {
  if (await shouldUseOperationalStore()) {
    return ensureOperationalDataset().equipment;
  }

  const { data, error } = await supabase
    .from("equipment")
    .select(
      "id,name,unit_id,serviceability,category_id,make,model,serial_number,date_of_procurement,specifications,remarks,units:unit_id(code,name),category:category_id(id,name)",
    )
    .order("name");

  if (error) throw error;
  return (data ?? []) as EquipmentRow[];
}

export async function listEquipmentForUnit(
  unitId: string
): Promise<EquipmentRow[]> {
  const all = await listAllEquipment();
  return all.filter((e) => e.unit_id === unitId);
}

/**
 * -----------------------------
 * ENGAGEMENTS
 * -----------------------------
 */

export async function listEngagementsForUnit(
  unitId: string
): Promise<OpEngagement[]> {
  if (await shouldUseOperationalStore()) {
    return ensureOperationalDataset().engagements.filter(
      (e) => e.unit_id === unitId
    );
  }

  const { data, error } = await supabase
    .from("engagements")
    .select(
      "id,unit_id,status,satellite_id,antenna_id,demodulator_id,processing_server_id,observation_start,updated_at,remarks,satellites:satellite_id(name)",
    )
    .eq("unit_id", unitId)
    .order("observation_start", { ascending: false });

  if (error) throw error;
  return (data ?? []) as OpEngagement[];
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