import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { ChevronRight, Database } from "lucide-react";

import { listUnits } from "@/lib/queries";

import { INT_UNITS, formatDisplayDate } from "@/lib/intelRepository";

import {

  buildIntelLinkageContext,

  buildIntelSatelliteTable,

  hasIntelData,

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



  const unitStatsMap = useMemo(() => {

    const map = new Map<

      string,

      { hasData: boolean; satellites: number; totalScanned: number; productive: number; lastReport: string | null }

    >();



    for (const unit of INT_UNITS) {

      if (!hasIntelData(unit.id)) {

        map.set(unit.id, { hasData: false, satellites: 0, totalScanned: 0, productive: 0, lastReport: null });

        continue;

      }



      const db = dbUnits.find((u) => u.code === unit.code);

      const dbId = db?.id ?? unit.id;

      const unitEng = engagements.filter((e: any) => e.unit_id === dbId);

      const ctx = buildIntelLinkageContext(unit.id, unitEng, [], []);

      const rows = buildIntelSatelliteTable(unit.id, ctx, unitEng);

      const totalScanned = rows.reduce((s, r) => s + r.totalScanned, 0);

      const productive = rows.reduce(

        (s, r) => s + Math.floor(r.analyzed * (r.productivityScore / 100)),

        0,

      );

      const dates = rows.map((r) => r.reportTimestamp).sort();



      map.set(unit.id, {

        hasData: rows.length > 0,

        satellites: rows.length,

        totalScanned,

        productive,

        lastReport: dates.length ? dates[dates.length - 1] : null,

      });

    }

    return map;

  }, [engagements, dbUnits]);



  return (

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">

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

            className={`rounded-md border bg-card shadow-sm p-2.5 flex flex-col

                        hover:border-primary/45 hover:shadow-md transition-all cursor-pointer

                        no-underline text-inherit group/tile ${

                          hasData ? "border-border" : "border-border/70 border-dashed opacity-90"

                        }`}

          >

            <div className="flex items-start justify-between mb-1.5">

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

              <div className="space-y-0.5 border-t border-border/60 pt-1.5 flex-1">

                <StatRow label="Satellites" value={String(stats.satellites)} />

                <StatRow label="Freq. Scanned" value={stats.totalScanned.toLocaleString()} />

                <StatRow label="Productive Est." value={stats.productive.toLocaleString()} color="emerald" />

                <StatRow

                  label="Last Report"

                  value={stats.lastReport ? formatDisplayDate(stats.lastReport.slice(0, 10)) : "—"}

                />

              </div>

            ) : (

              <div className="border-t border-border/60 pt-1.5 flex-1 flex flex-col justify-center">

                <p className="mono text-[8px] uppercase tracking-wider text-foreground/70 text-center py-2">

                  No data uploaded

                </p>

              </div>

            )}



            <div

              className="mt-1.5 pt-1.5 border-t border-border/40 w-full flex items-center

                         justify-between rounded-sm px-0.5 py-1 group-hover/tile:bg-primary/8 transition-all"

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

    <div className="flex items-baseline justify-between gap-1.5">

      <span className="mono text-[8px] text-foreground shrink-0">{label}</span>

      <span

        className={`mono text-[9px] font-semibold ${

          color === "emerald" ? "text-emerald-600" : "text-foreground"

        }`}

      >

        {value}

      </span>

    </div>

  );

}

