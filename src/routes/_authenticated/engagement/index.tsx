import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { Empty } from "@/components/Empty";
import { engColor } from "@/lib/engagementEngine";
import { INT_UNITS } from "@/lib/intelRepository";
import { useOperationalState } from "@/hooks/useOperationalState";
import { formatLiveEngagementSatelliteLabel } from "@/lib/operationalSync";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/engagement/")({
  beforeLoad: () => {
    throw redirect({ to: "/control-center", search: { module: "engagement" } });
  },
  component: () => null,
});

export function EngagementDashboardView() {
  const { fleetState, units } = useOperationalState();

  const rows = useMemo(() => {
    if (!fleetState) return [];
    return units.map((u) => {
      const state = fleetState.byUnitId.get(u.id)!;
      const cap = state.capability;
      const satDisplay = formatLiveEngagementSatelliteLabel(cap.snapshot.satellites, 2);
      return { unit: u, cap, satDisplay, state };
    });
  }, [units, fleetState]);

  const totalActive = fleetState?.totalActiveScans ?? 0;

  if (units.length === 0) {
    return <Empty title="No units registered" />;
  }

  return (
    <>
      <div className="panel mb-3 px-3 py-2 flex items-center gap-4 flex-wrap">
        <FleetStat label="Units" value={units.length} />
        <div className="h-4 w-px bg-border hidden sm:block" />
        <FleetStat label="Active Scans" value={totalActive} accent />
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {rows.map(({ unit, cap, satDisplay }) => (
          <div key={unit.id} className="panel flex flex-col overflow-hidden">
            <div className="flex flex-col items-center gap-2 px-3 pt-3 pb-2">
              <div className="text-center w-full">
                <div className="mono text-[12px] font-bold uppercase tracking-tight text-foreground leading-tight">
                  Unit {unitDisplayCode(unit.code)}
                </div>
                <div className="mono text-[8px] text-foreground/75 mt-0.5 truncate">
                  {unitLocation(unit)}
                </div>
              </div>

              <EngagementRing pct={cap.occupancyPct} />

              <div className="w-full min-h-[52px]">
                {cap.snapshot.satellites.length === 0 ? (
                  <div className="mono text-[8px] uppercase tracking-wider text-foreground/80 text-center py-1">
                    {cap.feasibilityStatus === "NON_OPERATIONAL"
                      ? "Non-operational"
                      : "No active scans"}
                  </div>
                ) : (
                  <div className="text-center">
                    <p
                      className="mono text-[8px] text-foreground leading-snug truncate px-0.5"
                      title={cap.snapshot.satellites.map((s) => s.name).join(", ")}
                    >
                      {satDisplay.label}
                    </p>
                    {satDisplay.total > 0 && (
                      <p className="mono text-[7px] text-foreground/70 mt-0.5">
                        {satDisplay.total} active satellite{satDisplay.total !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border/50 px-3 pb-3 pt-2 mt-auto">
              <Link
                to="/engagement/$unitId"
                params={{ unitId: unit.id }}
                className="w-full flex items-center justify-center gap-1.5 rounded-sm
                           border border-border bg-card px-3 py-1.5 no-underline
                           hover:bg-primary/10 hover:border-primary/50 transition-all cursor-pointer"
              >
                <span className="mono text-[8px] uppercase tracking-wider text-foreground hover:text-primary transition-colors">
                  View Details
                </span>
                <ChevronRight className="h-2.5 w-2.5 text-foreground" />
              </Link>
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

function unitLocation(unit: { code: string; description?: string | null }): string {
  const code = unitDisplayCode(unit.code);
  const intUnit = INT_UNITS.find((u) => u.code === code);
  return intUnit?.location ?? unit.description ?? "—";
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
      </div>
    </div>
  );
}
