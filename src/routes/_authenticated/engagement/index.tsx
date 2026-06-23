import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAllocatedIds,
  computeBottleneckEngagement,
  engColor,
} from "@/lib/engagementEngine";
import { Activity, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/engagement/")({
  component: EngagementMatrix,
});

function unitDisplayCode(code: string): string {
  return code.replace(/^GATE[-\s]?/i, "").trim() || code;
}

function EngagementMatrix() {
  const navigate = useNavigate();
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-all-cat"],
    queryFn: async () =>
      (await supabase
        .from("equipment")
        .select("id,unit_id,serviceability,category:category_id(name)")
      ).data ?? [],
    staleTime: 30 * 1000,
  });

  const { data: engagements = [] } = useQuery({
    queryKey: ["eng-all"],
    queryFn: async () =>
      (await supabase
        .from("engagements")
        .select("id,unit_id,status,antenna_id,demodulator_id,processing_server_id")
      ).data ?? [],
    staleTime: 30 * 1000,
  });

  const rows = useMemo(() => {
    return units.map((u) => {
      const unitEq = equipment.filter((e: any) => e.unit_id === u.id);
      const activeEngs = engagements.filter(
        (e: any) => e.unit_id === u.id && (e.status === "In Progress" || e.status === "Paused"),
      );
      const allocatedIds = buildAllocatedIds(activeEngs);
      const { pct, bottleneck } = computeBottleneckEngagement(unitEq, allocatedIds);
      const activeScans = engagements.filter(
        (e: any) => e.unit_id === u.id && e.status === "In Progress",
      ).length;

      return {
        unit: u,
        active: activeScans,
        pct,
        bottleneck: bottleneck?.short ?? "",
      };
    });
  }, [units, equipment, engagements]);

  if (units.length === 0) {
    return (
      <AppShell title="Live Engagement Status" subtitle="Bottleneck-Constrained Resource Engine">
        <Empty title="No units registered" />
      </AppShell>
    );
  }

  const totalActive = rows.reduce((sum, r) => sum + r.active, 0);
  const avgPct = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + r.pct, 0) / rows.length)
    : 0;

  return (
    <AppShell title="Live Engagement Status" subtitle="Bottleneck-Constrained Resource Engine">

      <div className="panel mb-4 px-4 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="mono text-[11px] font-bold uppercase tracking-wider text-foreground">
            Live Engagement Status
          </span>
        </div>
        <div className="h-6 w-px bg-border" />
        <FleetStat label="Units"        value={units.length} />
        <FleetStat label="Active Scans" value={totalActive} color="primary" />
        <FleetStat
          label="Fleet Pressure"
          value={`${avgPct}%`}
          color={avgPct >= 70 ? "red" : avgPct >= 40 ? "amber" : "emerald"}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {rows.map(({ unit, pct, bottleneck, active }) => (
          <div key={unit.id} className="panel flex flex-col overflow-hidden cursor-default">

            {/* Informational — not clickable */}
            <div className="flex flex-col items-center gap-2.5 px-4 pt-4 pb-3 pointer-events-none">
              <div className="text-center">
                <div className="mono text-[12px] font-bold uppercase tracking-tight text-foreground leading-tight">
                  Unit {unitDisplayCode(unit.code)}
                </div>
                {(unit as any).location && (
                  <div className="mono text-[8px] text-foreground/75 mt-0.5 truncate max-w-[130px]">
                    {(unit as any).location}
                  </div>
                )}
              </div>

              <EngagementRing pct={pct} />

              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="mono text-[11px] font-bold text-foreground leading-none">{active}</div>
                  <div className="mono text-[7px] uppercase tracking-wider text-foreground/70 leading-none mt-0.5">
                    active
                  </div>
                </div>
                {bottleneck && (
                  <>
                    <div className="h-4 w-px bg-border/60" />
                    <div className="text-center">
                      <div className={`mono text-[8px] font-bold uppercase leading-none ${
                        pct >= 80 ? "text-destructive" : pct >= 50 ? "text-amber-600" : "text-foreground"
                      }`}>
                        {bottleneck}
                      </div>
                      <div className="mono text-[6.5px] uppercase tracking-wider text-foreground/70 leading-none mt-0.5">
                        {pct >= 80 ? "exhausted" : pct >= 50 ? "constrained" : "bottleneck"}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* View Details — sole navigation control */}
            <div className="border-t border-border/50 px-3 pb-3 pt-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/engagement/$unitId", params: { unitId: unit.id } })}
                className="group/btn w-full flex items-center justify-center gap-1.5 rounded-sm
                           border border-border bg-card px-3 py-2
                           hover:bg-primary/10 hover:border-primary/50 hover:shadow-md hover:-translate-y-px
                           active:translate-y-0 active:shadow-sm
                           focus:outline-none focus:ring-1 focus:ring-primary/50
                           transition-all cursor-pointer"
              >
                <span className="mono text-[8px] uppercase tracking-wider text-foreground/80
                                 group-hover/btn:text-primary transition-colors">
                  View Details
                </span>
                <ChevronRight className="h-2.5 w-2.5 text-foreground/60 group-hover/btn:text-primary transition-colors" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function FleetStat({
  label, value, color,
}: { label: string; value: string | number; color?: "primary" | "emerald" | "amber" | "red" }) {
  const cls =
    color === "primary" ? "text-primary"
    : color === "emerald" ? "text-emerald-600"
    : color === "amber"   ? "text-amber-500"
    : color === "red"     ? "text-destructive"
    : "text-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`mono text-[14px] font-bold leading-none ${cls}`}>{value}</span>
      <span className="mono text-[7.5px] uppercase tracking-[0.15em] text-foreground/70 leading-none">
        {label}
      </span>
    </div>
  );
}

function EngagementRing({ pct }: { pct: number }) {
  const size   = 72;
  const stroke = 7;
  const r      = (size - stroke) / 2;
  const c      = 2 * Math.PI * r;
  const color  = engColor(pct);
  return (
    <div className="relative pointer-events-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="currentColor" strokeWidth={stroke}
          fill="none" className="text-secondary" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-[13px] font-bold leading-none" style={{ color }}>{pct}%</span>
        <span className="mono text-[6.5px] uppercase tracking-wider text-foreground/70 leading-none mt-0.5">
          pressure
        </span>
      </div>
    </div>
  );
}
