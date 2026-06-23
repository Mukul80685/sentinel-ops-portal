/**
 * Engagement Status – bottleneck utilization engine + satellite analysis helpers.
 */

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
