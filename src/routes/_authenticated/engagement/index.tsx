import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/engagement/")({
  component: EngagementMatrix,
});

const ACTIVE_STATUSES = new Set(["Planned", "In Progress", "Paused"]);

function EngagementMatrix() {
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-all"],
    queryFn: async () => (await supabase.from("equipment").select("id,unit_id,serviceability")).data ?? [],
  });
  const { data: engagements = [] } = useQuery({
    queryKey: ["eng-all"],
    queryFn: async () => (await supabase.from("engagements").select("id,unit_id,status")).data ?? [],
  });

  const rows = useMemo(() => {
    return units.map((u) => {
      const unitEq = equipment.filter((e: any) => e.unit_id === u.id);
      const serviceable = unitEq.filter((e: any) => e.serviceability === "Operational").length;
      const total = unitEq.length;
      const active = engagements.filter((e: any) => e.unit_id === u.id && ACTIVE_STATUSES.has(e.status)).length;
      const available = Math.max(0, serviceable - active);
      const pct = serviceable === 0 ? 0 : Math.min(100, Math.round((active / serviceable) * 100));
      return { unit: u, total, serviceable, active, available, pct };
    });
  }, [units, equipment, engagements]);

  if (units.length === 0) {
    return (
      <AppShell title="Engagement Matrix" subtitle="Module 04 // Live Utilisation">
        <Empty title="No units registered" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Engagement Matrix" subtitle="Module 04 // Live Utilisation">
      <p className="text-[11px] mono text-muted-foreground mb-3">
        Utilisation = active engagements / serviceable equipment per unit. Click a unit to manage its engagements.
      </p>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(({ unit, total, serviceable, active, available, pct }) => (
          <Link
            key={unit.id}
            to="/engagement/$unitId"
            params={{ unitId: unit.id }}
            className="tile h-full flex flex-col focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="label-eyebrow">{unit.name}</div>
                <div className="mono text-base font-bold uppercase">{unit.code}</div>
              </div>
              <UtilRing pct={pct} />
            </div>
            <dl className="grid grid-cols-2 gap-y-0.5 gap-x-3 mt-3 text-[11px] mono">
              <dt className="text-muted-foreground">Total resources</dt>
              <dd className="text-right">{total}</dd>
              <dt className="text-muted-foreground">Serviceable</dt>
              <dd className="text-right">{serviceable}</dd>
              <dt className="text-muted-foreground">Allocated</dt>
              <dd className="text-right">{active}</dd>
              <dt className="text-muted-foreground">Available</dt>
              <dd className="text-right text-primary font-bold">{available}</dd>
            </dl>
            <div className="mt-2 flex items-center gap-1 text-[10px] mono uppercase tracking-wider text-muted-foreground">
              <Activity className="h-3 w-3" /> Engagement {pct}%
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

function UtilRing({ pct }: { pct: number }) {
  const size = 56;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color = pct >= 80 ? "var(--status-bad)" : pct >= 50 ? "var(--status-warn)" : "var(--status-ok)";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center mono text-[11px] font-bold">{pct}%</div>
    </div>
  );
}