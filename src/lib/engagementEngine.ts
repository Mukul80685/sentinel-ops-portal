/**
 * Engagement Status – bottleneck utilization engine + satellite analysis helpers.
 */

import { supabase } from "@/integrations/supabase/client";

/** Shared query key — fleet dashboard and unit pages stay in sync after mutations. */
export const ENGAGEMENTS_ALL_KEY = ["engagements", "all"] as const;

export async function fetchAllEngagements() {
  const { data, error } = await supabase
    .from("engagements")
    .select(
      "id,unit_id,status,satellite_id,antenna_id,demodulator_id,processing_server_id,satellites:satellite_id(name)",
    )
    .order("observation_start", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const NON_OPERATIONAL = new Set([
  "Non-Serviceable",
  "Under Repair",
  "Partially Serviceable",
]);

export const CHAIN_CATEGORIES = [
  { label: "Antennas",      match: "antenna",    short: "Antenna"      },
  { label: "LNA / LNB",    match: "lna",         short: "LNA/LNB"     },
  { label: "Demodulators",  match: "demodulat",  short: "Demodulator"  },
  { label: "Proc. Servers", match: "processing", short: "Processor"    },
] as const;

export interface CategoryUtil {
  label: string;
  short: string;
  total: number;
  faulty: number;
  allocated: number;
  engaged: number;
  pct: number;
}

export interface BottleneckResult {
  pct: number;
  bottleneck: CategoryUtil | null;
  categories: CategoryUtil[];
}

function categoryUtil(
  equipment: any[],
  match: string,
  label: string,
  short: string,
  allocatedIds: Set<string>,
  claimed: Set<string>,
): CategoryUtil {
  const catEq = equipment.filter((e: any) => {
    const name = (e.category?.name ?? "").toLowerCase();
    return name.includes(match) && !claimed.has(e.id);
  });
  catEq.forEach((e: any) => claimed.add(e.id));

  const total   = catEq.length;
  const faulty  = catEq.filter((e: any) => NON_OPERATIONAL.has(e.serviceability)).length;
  const active  = catEq.filter(
    (e: any) => e.serviceability === "Operational" && allocatedIds.has(e.id),
  ).length;
  const engaged = faulty + active;
  const pct     = total === 0 ? 0 : Math.min(100, Math.round((engaged / total) * 100));

  return { label, short, total, faulty, allocated: active, engaged, pct };
}

/** Unit engagement % = max utilization across mandatory acquisition chain resources. */
export function computeBottleneckEngagement(
  equipment: any[],
  allocatedIds: Set<string>,
): BottleneckResult {
  const claimed = new Set<string>();
  const categories = CHAIN_CATEGORIES.map(({ label, match, short }) =>
    categoryUtil(equipment, match, label, short, allocatedIds, claimed),
  );

  const withInventory = categories.filter((c) => c.total > 0);
  if (withInventory.length === 0) {
    const total  = equipment.length;
    const faulty = equipment.filter((e: any) => NON_OPERATIONAL.has(e.serviceability)).length;
    const active = equipment.filter(
      (e: any) => e.serviceability === "Operational" && allocatedIds.has(e.id),
    ).length;
    const pct = total === 0 ? 0 : Math.min(100, Math.round(((faulty + active) / total) * 100));
    return { pct, bottleneck: null, categories };
  }

  const bottleneck = withInventory.reduce(
    (max, c) => (c.pct >= max.pct ? c : max),
    withInventory[0],
  );

  return { pct: bottleneck.pct, bottleneck, categories };
}

/** Statuses that hold an active scanning session (matches unit detail page). */
export const ACTIVE_SCAN_STATUSES = new Set(["In Progress", "Paused"]);
export const QUEUED_SCAN_STATUS = "Planned";

export function isActiveScanStatus(status: string): boolean {
  return ACTIVE_SCAN_STATUSES.has(status);
}

export function scanStatusLabel(status: string): string {
  if (status === "In Progress") return "Active";
  if (status === "Paused") return "Idle";
  if (status === QUEUED_SCAN_STATUS) return "Pending";
  return status;
}

export function filterActiveScans(engagements: any[], unitId?: string) {
  return engagements.filter(
    (e) => isActiveScanStatus(e.status) && (!unitId || e.unit_id === unitId),
  );
}

export function countActiveScans(engagements: any[], unitId?: string): number {
  return filterActiveScans(engagements, unitId).length;
}

export type ScanningSatellite = {
  engagementId: string;
  name: string;
  status: string;
  displayStatus: string;
};

export type UnitScanSnapshot = {
  activeCount: number;
  satellites: ScanningSatellite[];
};

/** Authoritative per-unit scanning state derived from engagements. */
export function buildUnitScanSnapshot(engagements: any[], unitId: string): UnitScanSnapshot {
  const active = filterActiveScans(engagements, unitId);
  return {
    activeCount: active.length,
    satellites: active.map((e) => ({
      engagementId: e.id,
      name: e.satellites?.name ?? "Unassigned",
      status: e.status,
      displayStatus: scanStatusLabel(e.status),
    })),
  };
}

/** Fleet-wide active scan total — sum of all unit snapshots (no independent counter). */
export function countFleetActiveScans(engagements: any[]): number {
  return countActiveScans(engagements);
}

/** Build allocated resource IDs from active engagements (In Progress + Paused hold capacity). */
export function buildAllocatedIds(activeEngagements: any[]): Set<string> {
  return new Set<string>(
    [
      ...activeEngagements.map((e: any) => e.antenna_id),
      ...activeEngagements.map((e: any) => e.demodulator_id),
      ...activeEngagements.map((e: any) => e.processing_server_id),
    ].filter(Boolean) as string[],
  );
}

export interface SatelliteAnalysis {
  polarization: string;
  lastUpdate: string | null;
  scanned: number;
  analyzed: number;
  pending: number;
  analysisPct: number;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic scan metrics when intel records are not yet uploaded. */
function mockAnalysis(engagementId: string): Pick<SatelliteAnalysis, "scanned" | "analyzed" | "pending" | "analysisPct"> {
  const h = hashStr(engagementId);
  const scanned  = 49 + (h % 240);
  const ratio    = 0.4 + (h % 45) / 100;
  const analyzed = Math.min(scanned, Math.round(scanned * ratio));
  const pending  = scanned - analyzed;
  const analysisPct = scanned > 0 ? Math.round((analyzed / scanned) * 100) : 0;
  return { scanned, analyzed, pending, analysisPct };
}

export function computeSatelliteAnalysis(
  engagement: any,
  intelRows: any[],
): SatelliteAnalysis {
  const satId = engagement.satellite_id as string | undefined;
  const unitId = engagement.unit_id as string | undefined;

  const related = intelRows.filter(
    (r) => r.satellite_id === satId && r.unit_id === unitId,
  );

  const polarization =
    related.find((r) => r.band)?.band ??
    parsePolarizationFromRemarks(engagement.remarks) ??
    "—";

  const lastUpdate =
    related.reduce<string | null>((latest, r) => {
      const d = r.updated_at ?? r.observation_date;
      if (!d) return latest;
      if (!latest || d > latest) return d;
      return latest;
    }, null) ??
    engagement.updated_at ??
    engagement.observation_start ??
    null;

  if (related.length === 0) {
    const mock = mockAnalysis(engagement.id);
    return { polarization, lastUpdate, ...mock };
  }

  const scanned  = related.length;
  const analyzed = related.filter(
    (r) => (r.analysis_report && r.analysis_report.trim()) || (r.summary && r.summary.trim()),
  ).length;
  const pending  = scanned - analyzed;
  const analysisPct = scanned > 0 ? Math.round((analyzed / scanned) * 100) : 0;

  return { polarization, lastUpdate, scanned, analyzed, pending, analysisPct };
}

function parsePolarizationFromRemarks(remarks: string | null): string | null {
  const m = remarks?.match(/POL:([\w-]+)/);
  return m ? m[1] : null;
}

export function formatEngagementDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function productivityStatusLabel(pct: number, isPending: boolean): string {
  if (isPending) return "Pending Allocation";
  if (pct >= 90) return "Near Complete";
  if (pct >= 70) return "High Progress";
  if (pct >= 40) return "In Analysis";
  return "Early Stage";
}

export function engColor(pct: number) {
  return pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#10b981";
}
