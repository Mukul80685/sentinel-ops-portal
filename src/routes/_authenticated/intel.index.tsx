import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Database } from "lucide-react";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { INT_UNITS } from "@/lib/intelRepository";
import {
  buildIntelLinkageContext,
  buildIntelSatelliteTable,
  formatIntelCompactDate,
  hasIntelData,
  summarizeIntelSatelliteRows,
} from "@/lib/intelAnalysisData";
import { ENGAGEMENTS_ALL_KEY, fetchAllEngagements } from "@/lib/engagementEngine";

export const Route = createFileRoute("/_authenticated/intel/")({
  beforeLoad: () => {
    throw redirect({ to: "/control-center", search: { module: "intel" } });
  },
  component: () => null,
});

export function IntelRepositoryView() {
  const { data: engagements = [] } = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    staleTime: 30_000,
  });

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const intelDbUnitIds = useMemo(() => {
    return INT_UNITS.filter((u) => hasIntelData(u.id))
      .map((u) => dbUnits.find((d) => d.code === u.code)?.id ?? u.id);
  }, [dbUnits]);

  const { data: allEquipment = [] } = useQuery({
    queryKey: ["intel-all-equipment", intelDbUnitIds],
    queryFn: async () => {
      if (intelDbUnitIds.length === 0) return [];
      const { data } = await supabase
        .from("equipment")
        .select("id, unit_id, serviceability, category:category_id(name)")
        .in("unit_id", intelDbUnitIds);
      return data ?? [];
    },
    enabled: intelDbUnitIds.length > 0,
    staleTime: 30_000,
  });

  const { data: allVisibility = [] } = useQuery({
    queryKey: ["intel-all-visibility", intelDbUnitIds],
    queryFn: async () => {
      if (intelDbUnitIds.length === 0) return [];
      const { data } = await supabase
        .from("unit_beam_visibility")
        .select("unit_id, beam_id, visible, beams:beam_id(band, satellite_id, satellites:satellite_id(name))")
        .in("unit_id", intelDbUnitIds)
        .eq("visible", true);
      return data ?? [];
    },
    enabled: intelDbUnitIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: allIntelRows = [] } = useQuery({
    queryKey: ["intel-records-all", intelDbUnitIds],
    queryFn: async () => {
      if (intelDbUnitIds.length === 0) return [];
      const { data } = await supabase
        .from("intel_records")
        .select("id, unit_id, satellite_id, band, analysis_report, summary, updated_at, observation_date");
      return (data ?? []).filter((r) => intelDbUnitIds.includes(r.unit_id));
    },
    enabled: intelDbUnitIds.length > 0,
    staleTime: 30_000,
  });

  const unitStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summarizeIntelSatelliteRows>>();

    for (const unit of INT_UNITS) {
      if (!hasIntelData(unit.id)) {
        map.set(unit.id, summarizeIntelSatelliteRows([]));
        continue;
      }

      const db = dbUnits.find((u) => u.code === unit.code);
      const dbId = db?.id ?? unit.id;
      const unitEng = engagements.filter((e: any) => e.unit_id === dbId);
      const unitEq = allEquipment.filter((e: any) => e.unit_id === dbId);
      const unitVis = allVisibility.filter((v: any) => v.unit_id === dbId);
      const unitIntel = allIntelRows.filter((r: any) => r.unit_id === dbId);
      const ctx = buildIntelLinkageContext(unit.id, unitEng, unitVis, unitEq, unitIntel);
      const rows = buildIntelSatelliteTable(unit.id, ctx, unitEng);
      map.set(unit.id, summarizeIntelSatelliteRows(rows));
    }

    return map;
  }, [engagements, dbUnits, allEquipment, allVisibility, allIntelRows]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {INT_UNITS.map((unit) => {
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
                  Unit {unit.code}
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
                  No data uploaded
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
