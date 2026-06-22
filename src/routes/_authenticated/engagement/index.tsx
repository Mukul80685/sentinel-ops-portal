import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/engagement/")({
  component: EngagementMatrix,
});

// ─── Naming normalization ─────────────────────────────────────────────────────
// DB stores codes like "GATE-A". Display as plain "A" → rendered as "Unit A".
function unitDisplayCode(code: string): string {
  return code.replace(/^GATE[-\s]?/i, "").trim() || code;
}

function EngagementMatrix() {
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  // Need full equipment serviceability to compute capacity pressure
  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-all"],
    queryFn: async () =>
      (await supabase.from("equipment").select("id,unit_id,serviceability")).data ?? [],
  });

  // Need resource IDs per engagement to compute active allocation
  const { data: engagements = [] } = useQuery({
    queryKey: ["eng-all"],
    queryFn: async () =>
      (await supabase
        .from("engagements")
        .select("id,unit_id,status,antenna_id,demodulator_id,processing_server_id")
      ).data ?? [],
  });

  const rows = useMemo(() => {
    return units.map((u) => {
      const unitEq = equipment.filter((e: any) => e.unit_id === u.id);
      const total  = unitEq.length;

      // FAULTY = any non-Operational equipment → reduces available capacity
      const faulty = unitEq.filter((e: any) => e.serviceability !== "Operational").length;

      // ACTIVE ALLOCATIONS = serviceable equipment currently used in In Progress engagements
      const inProgressEngs = engagements.filter(
        (e: any) => e.unit_id === u.id && e.status === "In Progress",
      );
      const allocatedIds = new Set(
        [
          ...inProgressEngs.map((e: any) => e.antenna_id),
          ...inProgressEngs.map((e: any) => e.demodulator_id),
          ...inProgressEngs.map((e: any) => e.processing_server_id),
        ].filter(Boolean),
      );
      const activeOperational = unitEq.filter(
        (e: any) => e.serviceability === "Operational" && allocatedIds.has(e.id),
      ).length;

      // ENGAGEMENT % = (faulty + actively used) / total pool
      // Faulty ≠ free — they constrain operational capacity
      const engaged = faulty + activeOperational;
      const pct     = total === 0 ? 0 : Math.min(100, Math.round((engaged / total) * 100));

      const activeEngCount = inProgressEngs.length;
      return { unit: u, active: activeEngCount, pct };
    });
  }, [units, equipment, engagements]);

  if (units.length === 0) {
    return (
      <AppShell title="Live Engagement Status" subtitle="Constraint-Driven Resource Allocation">
        <Empty title="No units registered" />
      </AppShell>
    );
  }

  const totalActive = rows.reduce((sum, r) => sum + r.active, 0);
  const avgPct      = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + r.pct, 0) / rows.length)
    : 0;

  return (
    <AppShell title="Live Engagement Status" subtitle="Constraint-Driven Resource Allocation">

      {/* Fleet summary strip */}
      <div className="panel mb-4 px-4 py-3 flex items-center gap-6 border-border">
        <div className="flex items-center gap-2.5">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="mono text-[11px] font-bold uppercase tracking-wider text-foreground">
            Live Engagement Status
          </span>
        </div>
        <div className="h-6 w-px bg-border" />
        <FleetStat label="Units"          value={units.length} />
        <FleetStat label="Active Scans"   value={totalActive} color="primary" />
        <FleetStat
          label="Fleet Pressure"
          value={`${avgPct}%`}
          color={avgPct >= 70 ? "red" : avgPct >= 40 ? "amber" : "emerald"}
        />
      </div>

      {/* Unit tile grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {rows.map(({ unit, pct }) => (
          <Link
            key={unit.id}
            to="/engagement/$unitId"
            params={{ unitId: unit.id }}
            className="group panel flex flex-col items-center gap-3 px-4 py-5
                       hover:border-primary/50 hover:shadow-md hover:bg-secondary/15
                       transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {/* Unit identity — always "Unit A" format */}
            <div className="text-center">
              <div className="mono text-[12px] font-bold uppercase tracking-tight text-foreground leading-tight">
                Unit {unitDisplayCode(unit.code)}
              </div>
              {(unit as any).location && (
                <div className="mono text-[8px] text-muted-foreground/50 mt-0.5 truncate max-w-[120px]">
                  {(unit as any).location}
                </div>
              )}
            </div>

            {/* Engagement ring */}
            <EngagementRing pct={pct} />

            {/* Click affordance */}
            <div className="flex items-center gap-1 mono text-[7.5px] uppercase tracking-wider
                            text-muted-foreground/35 group-hover:text-primary/50 transition-colors">
              View Detail <ChevronRight className="h-2.5 w-2.5" />
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

// ─── Fleet stat pill ──────────────────────────────────────────────────────────

function FleetStat({
  label, value, color,
}: { label: string; value: string | number; color?: "primary" | "emerald" | "amber" | "red" }) {
  const cls =
    color === "primary" ? "text-primary"
    : color === "emerald" ? "text-emerald-600"
    : color === "amber"   ? "text-amber-500"
    : color === "red"     ? "text-destructive/80"
    : "text-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`mono text-[14px] font-bold leading-none ${cls}`}>{value}</span>
      <span className="mono text-[7.5px] uppercase tracking-[0.15em] text-muted-foreground/45 leading-none">
        {label}
      </span>
    </div>
  );
}

// ─── Engagement ring (donut SVG) ──────────────────────────────────────────────

function EngagementRing({ pct }: { pct: number }) {
  const size   = 72;
  const stroke = 7;
  const r      = (size - stroke) / 2;
  const c      = 2 * Math.PI * r;
  const color  = pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#10b981";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-secondary" />
        <circle
          cx={size/2} cy={size/2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-[13px] font-bold leading-none" style={{ color }}>{pct}%</span>
        <span className="mono text-[6.5px] uppercase tracking-wider text-muted-foreground/40 leading-none mt-0.5">
          pressure
        </span>
      </div>
    </div>
  );
}
