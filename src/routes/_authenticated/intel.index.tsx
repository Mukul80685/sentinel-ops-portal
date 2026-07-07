import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Database } from "lucide-react";
import { listUnits, listAllIntelRecords, listAllEquipment, INTEL_RECORDS_ALL_KEY } from "@/lib/queries";
import { INT_UNITS } from "@/lib/intelRepository";
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

export const Route = createFileRoute("/_authenticated/intel/")({
  beforeLoad: () => {
    throw redirect({ to: "/control-center", search: { module: "intel" } });
  },
  component: () => null,
});

/** Summary for units whose only data comes from imported scan reports (new units). */
function summarizeScanOverrides(
  unitSlug: string,
): ReturnType<typeof summarizeIntelSatelliteRows> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`intel-scan-overrides-${unitSlug}`);
    if (!raw) return null;
    const overrides = JSON.parse(raw) as {
      totalScanned: number;
      analyzed: number;
      productivityScore: number | null;
      updatedOn: string;
    }[];
    if (!Array.isArray(overrides) || overrides.length === 0) return null;
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
  } catch {
    return null;
  }
}

export function IntelRepositoryView() {
  const { data: engagements = [] } = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    staleTime: 30_000,
  });

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

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

  // Dynamic unit roster from the operational store — seed units keep their
  // INT display (Unit A…H); newly created units use their own name/location.
  const intelUnits = useMemo(
    () =>
      dbUnits.map((u: any) => {
        const slug = resolveIntUnitSlug(u.id, u.code) ?? u.id;
        const seed = INT_UNITS.find((s) => s.id === slug);
        return {
          id: slug,
          code: seed?.code ?? u.code,
          name: seed ? `Unit ${seed.code}` : u.name,
          location: seed?.location ?? u.description ?? "—",
        };
      }),
    [dbUnits],
  );

  const unitStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summarizeIntelSatelliteRows>>();

    for (const unit of intelUnits) {
      if (!hasIntelData(unit.id)) {
        // Units without mock rosters may still have imported scan reports.
        map.set(unit.id, summarizeScanOverrides(unit.id) ?? summarizeIntelSatelliteRows([]));
        continue;
      }

      const dbId = resolveOperationalUnitId(unit.id, dbUnits);
      const unitEng = engagements.filter((e: any) => e.unit_id === dbId);
      const unitEq = allEquipment.filter((e: any) => e.unit_id === dbId);
      const unitVis = buildIntelLinkageVisibilityRows(unit.id, dbId, unitEng);
      const unitIntel = allIntelRows.filter((r: any) => r.unit_id === dbId);
      const ctx = buildIntelLinkageContext(unit.id, unitEng, unitVis, unitEq, unitIntel);
      const rows = buildIntelSatelliteTable(unit.id, ctx, unitEng);
      map.set(unit.id, summarizeIntelSatelliteRows(rows));
    }

    return map;
  }, [intelUnits, engagements, dbUnits, allEquipment, allIntelRows]);

  return (
    <>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
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
            className={`rounded-md border bg-card shadow-sm p-2 flex flex-col
                        hover:border-primary/45 hover:shadow-md transition-all cursor-pointer
                        no-underline text-inherit group/tile ${
                          hasData ? "border-border" : "border-border/70 border-dashed opacity-90"
                        }`}
          >
            <div className="flex items-start justify-between mb-1">
              <div className="min-w-0">
                <div className="mono text-[11px] font-bold uppercase tracking-tight text-foreground leading-tight">
                  {unit.name}
                </div>
                <div className="mono text-[8px] text-foreground mt-0.5 truncate">{unit.location}</div>
              </div>
              {hasData ? (
                <div
                  className={`h-2 w-2 rounded-full mt-0.5 shrink-0 ${
                    pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-destructive/70"
                  }`}
                />
              ) : (
                <Database className="h-3 w-3 text-foreground/40 mt-0.5 shrink-0" />
              )}
            </div>

            {!stats ? (
              <div className="mono text-[8px] text-foreground pt-1">Loading…</div>
            ) : hasData ? (
              <div className="space-y-0.5 border-t border-border/60 pt-1 flex-1">
                <StatRow label="Satellites" value={String(stats.satellites)} />
                <StatRow label="Freq. Scanned" value={stats.totalScanned.toLocaleString()} />
                <StatRow label="Productive Est." value={stats.productive.toLocaleString()} color="emerald" />
                <StatRow
                  label="Last Report"
                  value={stats.lastReportIso ? formatIntelCompactDate(stats.lastReportIso) : "—"}
                />
              </div>
            ) : (
              <div className="border-t border-border/60 pt-1 flex-1 flex flex-col justify-center">
                <p className="mono text-[8px] uppercase tracking-wider text-foreground/70 text-center py-2">
                  No scan report — open to upload
                </p>
              </div>
            )}

            <div
              className="mt-1 pt-1 border-t border-border/40 w-full flex items-center
                         justify-between rounded-sm px-0.5 py-0.5 group-hover/tile:bg-primary/8 transition-all"
            >
              <span className="mono text-[8px] uppercase tracking-wider text-foreground group-hover/tile:text-primary">
                {hasData ? "Review Records" : "Open Unit"}
              </span>
              <ChevronRight className="h-3 w-3 text-foreground group-hover/tile:text-primary" />
            </div>
          </Link>
        );
      })}
    </div>

    {/* ── Advanced Features — shared across all modules ── */}
    <UnitAdvancedFeatures />
    </>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: "emerald" }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="mono text-[8px] text-foreground shrink-0">{label}</span>
      <span
        className={`mono text-[9px] font-semibold tabular-nums ${
          color === "emerald" ? "text-emerald-600" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
