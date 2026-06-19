import { supabase } from "@/integrations/supabase/client";

export type Unit = { id: string; code: string; name: string; description: string | null };
export type Satellite = { id: string; name: string; orbital_position: number; notes: string | null };
export type Category = { id: string; name: string; sort_order: number };
export type Serviceability = "Operational" | "Partially Serviceable" | "Under Repair" | "Non-Serviceable";
export type Priority = "Critical" | "High" | "Medium" | "Low";
export type EngStatus = "Planned" | "In Progress" | "Completed" | "Paused" | "Failed";

export async function listUnits() {
  const { data, error } = await supabase.from("units").select("*").order("code");
  if (error) throw error;
  return data as Unit[];
}

export async function listSatellites() {
  const { data, error } = await supabase.from("satellites").select("*").order("orbital_position");
  if (error) throw error;
  return data as Satellite[];
}

export async function listCategories() {
  const { data, error } = await supabase.from("equipment_categories").select("*").order("sort_order");
  if (error) throw error;
  return data as Category[];
}

export function statusClass(s: Serviceability) {
  switch (s) {
    case "Operational": return "status-ok";
    case "Partially Serviceable": return "status-warn";
    case "Under Repair": return "status-repair";
    case "Non-Serviceable": return "status-bad";
  }
}

export function priorityClass(p: Priority) {
  switch (p) {
    case "Critical": return "bg-destructive text-destructive-foreground";
    case "High": return "bg-accent text-accent-foreground";
    case "Medium": return "bg-primary/30 text-foreground border border-primary/50";
    case "Low": return "bg-secondary text-muted-foreground";
  }
}

export function engStatusClass(s: EngStatus) {
  switch (s) {
    case "Planned": return "bg-secondary text-muted-foreground";
    case "In Progress": return "bg-primary text-primary-foreground";
    case "Completed": return "bg-emerald-700/70 text-emerald-50";
    case "Paused": return "bg-accent text-accent-foreground";
    case "Failed": return "bg-destructive text-destructive-foreground";
  }
}

export function exportCsv(rows: Record<string, any>[], filename: string) {
  if (rows.length === 0) return;
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}