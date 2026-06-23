import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAllocatedIds,
  buildUnitScanSnapshot,
  computeBottleneckEngagement,
  countFleetActiveScans,
  ENGAGEMENTS_ALL_KEY,
  engColor,
  fetchAllEngagements,
} from "@/lib/engagementEngine";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/engagement/")({
  beforeLoad: () => {
    throw redirect({ to: "/control-center", search: { module: "engagement" } });
  },
  component: () => null,
});

export function EngagementDashboardView() {
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
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    staleTime: 30 * 1000,
  });

  const rows = useMemo(() => {
    return units.map((u) => {
      const unitEq = equipment.filter((e: any) => e.unit_id === u.id);
      const activeEngs = engagements.filter(
        (e: any) => e.unit_id === u.id && (e.status === "In Progress" || e.status === "Paused"),
      );
      const allocatedIds = buildAllocatedIds(activeEngs);
      const { pct } = computeBottleneckEngagement(unitEq, allocatedIds);
      const scan = buildUnitScanSnapshot(engagements, u.id);

      return { unit: u, pct, scan };
    });
  }, [units, equipment, engagements]);

  if (units.length === 0) {
    return <Empty title="No units registered" />;
  }

  const totalActive = countFleetActiveScans(engagements);

  return (
    <>
      <div className="panel mb-3 px-3 py-2 flex items-center gap-4 flex-wrap">
        <FleetStat label="Units" value={units.length} />
        <div className="h-4 w-px bg-border hidden sm:block" />
        <FleetStat label="Active Scans" value={totalActive} accent />
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {rows.map(({ unit, pct, scan }) => (
          <div key={unit.id} className="panel flex flex-col overflow-hidden">
            <div className="flex flex-col items-center gap-2 px-3 pt-3 pb-2">
              <div className="text-center w-full">
                <div className="mono text-[12px] font-bold uppercase tracking-tight text-foreground leading-tight">
                  Unit {unitDisplayCode(unit.code)}
                </div>
              </div>

              <EngagementRing pct={pct} />

              <div className="text-center">
                <div className="mono text-[11px] font-bold text-foreground leading-none">{scan.activeCount}</div>
                <div className="mono text-[7px] uppercase tracking-wider text-foreground leading-none mt-0.5">
                  scanning
                </div>
              </div>

              <div className="w-full min-h-[52px]">
                {scan.satellites.length === 0 ? (
                  <div className="mono text-[8px] uppercase tracking-wider text-foreground/80 text-center py-1">
                    No active scans
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {scan.satellites.slice(0, 4).map((sat) => (
                      <li key={sat.engagementId} className="mono text-[8px] text-foreground truncate text-center">
                        {sat.name}
                      </li>
                    ))}
                    {scan.satellites.length > 4 && (
                      <li className="mono text-[7px] text-foreground/80 text-center">
                        +{scan.satellites.length - 4} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            <div className="border-t border-border/50 px-3 pb-3 pt-2 mt-auto">
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/engagement/$unitId",
                    params: { unitId: unit.id },
                  })
                }
                className="w-full flex items-center justify-center gap-1.5 rounded-sm
                           border border-border bg-card px-3 py-1.5
                           hover:bg-primary/10 hover:border-primary/50 transition-all cursor-pointer"
              >
                <span className="mono text-[8px] uppercase tracking-wider text-foreground hover:text-primary transition-colors">
                  View Details
                </span>
                <ChevronRight className="h-2.5 w-2.5 text-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function unitDisplayCode(code: string): string {
  return code.replace(/^GATE[-\s]?/i, "").trim() || code;
}

function FleetStat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`mono text-[13px] font-bold leading-none ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
      <span className="mono text-[8px] uppercase tracking-[0.12em] text-foreground leading-none">{label}</span>
    </div>
  );
}

function EngagementRing({ pct }: { pct: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = engColor(pct);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-[12px] font-bold leading-none" style={{ color }}>
          {pct}%
        </span>
        <span className="mono text-[6px] uppercase tracking-wider text-foreground leading-none mt-0.5">load</span>
      </div>
    </div>
  );
}
