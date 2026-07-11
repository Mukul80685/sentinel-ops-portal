import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Database } from "lucide-react";
import { loadScanOverrides } from "@/lib/intelScanStorage";
import { intelStorageSlug } from "@/lib/intelStorageKeys";
import { listAllIntelRecords, listAllEquipment, INTEL_RECORDS_ALL_KEY } from "@/lib/queries";
import { unitDisplayFromRecord } from "@/lib/unitDisplay";
import {
  buildIntelLinkageContext,
  buildIntelLinkageVisibilityRows,
  buildIntelSatelliteTable,
  formatIntelCompactDate,
  hasIntelData,
  summarizeIntelSatelliteRows,
} from "@/lib/intelAnalysisData";
import { resolveIntUnitSlug, resolveOperationalUnitId } from "@/lib/operationalSync";
import { ENGAGEMENTS_ALL_KEY, fetchAllEngagements } from "@/lib/engagementEngine";
import { UnitAdvancedFeatures } from "@/components/UnitAdvancedFeatures";
import { useModuleUnits } from "@/hooks/useModuleUnits";

/** Satellites explicitly cleared — must match intel.$unitId localStorage key. */
function loadSuppressedSatSet(unitSlug: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`intel-suppressed-sats-${unitSlug}`);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(list.map((n) => n.toLowerCase()));
  } catch {
    return new Set();
  }
}

/** Summary for units whose only data comes from imported scan reports (new units). */
function summarizeScanOverrides(
  unitSlug: string,
): ReturnType<typeof summarizeIntelSatelliteRows> | null {
  const slug = intelStorageSlug(unitSlug);
  const overrides = loadScanOverrides(slug);
  if (overrides.length === 0) return null;
  const totalScanned = overrides.reduce((s, o) => s + (o.totalScanned || 0), 0);
  const productive = overrides.reduce(
    (s, o) => s + Math.floor((o.analyzed || 0) * ((o.productivityScore ?? 0) / 100)),
    0,
  );
  let lastReportIso: string | null = null;
  let maxTs = -Infinity;
  for (const o of overrides) {
    const t = new Date(o.updatedOn).getTime();
    if (!isNaN(t) && t > maxTs) {
      maxTs = t;
      lastReportIso = o.updatedOn;
    }
  }
  return { hasData: true, satellites: overrides.length, totalScanned, productive, lastReportIso };
}

function StatRow({ label, value, color }: { label: string; value: string; color?: "emerald" }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="mono text-[11px] font-medium text-foreground shrink-0">{label}</span>
      <span
        className={`mono text-[12px] font-bold tabular-nums truncate text-right max-w-[58%] ${
          color === "emerald" ? "text-emerald-600" : "text-foreground"
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function IntelRepositoryView() {
  const locationKey = useRouterState({
    select: (s) => s.location.href,
  });

  const { data: engagements = [] } = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    staleTime: 30_000,
  });

  const { units: dbUnits = [] } = useModuleUnits("intel");

  const { data: allEquipment = [] } = useQuery({
    queryKey: ["intel-all-equipment"],
    queryFn: listAllEquipment,
    staleTime: 30_000,
  });

  const { data: allIntelRows = [] } = useQuery({
    queryKey: INTEL_RECORDS_ALL_KEY,
    queryFn: listAllIntelRecords,
    staleTime: 30_000,
  });

  const intelUnits = useMemo(
    () =>
      dbUnits.map((u: { id: string; code: string; name: string; description?: string | null }) => {
        const slug = resolveIntUnitSlug(u.id, u.code) ?? u.id;
        const display = unitDisplayFromRecord(u);
        return {
          id: slug,
          code: u.code,
          name: display.name,
          location: display.location,
        };
      }),
    [dbUnits],
  );

  const unitStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summarizeIntelSatelliteRows>>();

    for (const unit of intelUnits) {
      try {
        if (!hasIntelData(unit.id)) {
          map.set(unit.id, summarizeScanOverrides(unit.id) ?? summarizeIntelSatelliteRows([]));
          continue;
        }

        const dbId = resolveOperationalUnitId(unit.id, dbUnits);
        const unitEng = engagements.filter((e: { unit_id: string }) => e.unit_id === dbId);
        const unitEq = allEquipment.filter((e: { unit_id: string }) => e.unit_id === dbId);
        const unitVis = buildIntelLinkageVisibilityRows(unit.id, dbId, unitEng);
        const unitIntel = allIntelRows.filter((r: { unit_id: string }) => r.unit_id === dbId);
        const ctx = buildIntelLinkageContext(unit.id, unitEng, unitVis, unitEq, unitIntel);
        const rows = buildIntelSatelliteTable(unit.id, ctx, unitEng);
        const suppressed = loadSuppressedSatSet(unit.id);
        const visibleRows = rows.filter(
          (r) => !suppressed.has(r.satelliteName.toLowerCase()),
        );
        const overrideStats = summarizeScanOverrides(unit.id);
        map.set(unit.id, overrideStats ?? summarizeIntelSatelliteRows(visibleRows));
      } catch {
        map.set(unit.id, summarizeScanOverrides(unit.id) ?? summarizeIntelSatelliteRows([]));
      }
    }

    return map;
  }, [intelUnits, engagements, dbUnits, allEquipment, allIntelRows, locationKey]);

  return (
    <div className="flex flex-col w-full min-h-0">
      {intelUnits.length === 0 ? (
        <p className="mono text-[13px] font-semibold text-foreground py-10 text-center">
          No units registered. Use Advanced Features → Add Unit to create one.
        </p>
      ) : (
        <div className="grid w-full grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 items-stretch">
          {intelUnits.map((unit) => {
            const stats = unitStatsMap.get(unit.id);
            const hasData = stats?.hasData ?? false;
            const pct =
              stats && stats.totalScanned > 0
                ? Math.round((stats.productive / stats.totalScanned) * 100)
                : 0;

            return (
              <Link
                key={unit.id}
                to="/intel/$unitId"
                params={{ unitId: unit.id }}
                className={`rounded-md border bg-card shadow-sm p-3.5 md:p-4 flex flex-col h-full min-h-[12.5rem]
                            hover:border-primary/45 hover:shadow-md transition-all cursor-pointer
                            no-underline text-inherit group/tile ${
                              hasData ? "border-border" : "border-border/70 border-dashed opacity-90"
                            }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2 shrink-0">
                  <div className="min-w-0 flex-1">
                    <div className="mono text-[14px] font-bold uppercase tracking-tight text-foreground leading-tight">
                      {unit.name}
                    </div>
                    <div className="mono text-[11px] font-semibold text-foreground mt-0.5 truncate leading-snug">
                      {unit.location}
                    </div>
                  </div>
                  {hasData ? (
                    <div
                      className={`h-2.5 w-2.5 rounded-full mt-0.5 shrink-0 ${
                        pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-destructive/70"
                      }`}
                      title={`${pct}% productive estimate`}
                    />
                  ) : (
                    <Database className="h-4 w-4 text-foreground mt-0.5 shrink-0" />
                  )}
                </div>

                <div className="flex-1 min-h-[6.25rem] border-t border-border/60 pt-2.5 flex flex-col">
                  {!stats ? (
                    <p className="mono text-[11px] font-medium text-foreground">Loading…</p>
                  ) : hasData ? (
                    <div className="space-y-1.5">
                      <StatRow label="Satellites" value={String(stats.satellites)} />
                      <StatRow label="Freq. Scanned" value={stats.totalScanned.toLocaleString()} />
                      <StatRow label="Productive Est." value={stats.productive.toLocaleString()} color="emerald" />
                      <StatRow
                        label="Last Report"
                        value={stats.lastReportIso ? formatIntelCompactDate(stats.lastReportIso) : "—"}
                      />
                    </div>
                  ) : (
                    <p className="mono text-[11px] font-semibold uppercase tracking-wider text-foreground text-center py-3 leading-snug">
                      No scan report — open to upload
                    </p>
                  )}
                </div>

                <div
                  className="shrink-0 mt-2 pt-2 border-t border-border/50 w-full flex items-center
                             justify-between rounded-sm px-0.5 py-1 group-hover/tile:bg-primary/8 transition-all"
                >
                  <span className="mono text-[11px] font-bold uppercase tracking-wider text-foreground group-hover/tile:text-primary">
                    {hasData ? "Review Records" : "Open Unit"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-foreground group-hover/tile:text-primary shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-border flex items-center justify-center shrink-0">
        <UnitAdvancedFeatures scope="intel" align="center" noTopMargin />
      </div>
    </div>
  );
}
