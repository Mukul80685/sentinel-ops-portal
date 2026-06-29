import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { Empty } from "@/components/Empty";
import { engColor } from "@/lib/engagementEngine";
import { INT_UNITS } from "@/lib/intelRepository";
import { useOperationalState } from "@/hooks/useOperationalState";
import { formatLiveEngagementSatelliteLabel } from "@/lib/operationalSync";

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

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {rows.map(({ unit, cap, satDisplay }) => (
          <Link
            key={unit.id}
            to="/engagement/$unitId"
            params={{ unitId: unit.id }}
            className="panel flex flex-col items-center gap-1.5 px-2.5 py-2.5 overflow-hidden
                       hover:border-primary/45 hover:bg-primary/5 transition-all no-underline cursor-pointer"
          >
            <div className="text-center w-full min-w-0">
              <div className="mono text-[11px] font-bold uppercase tracking-tight text-foreground leading-tight">
                Unit {unitDisplayCode(unit.code)}
              </div>
              <div className="mono text-[7px] text-foreground/75 mt-0.5 truncate">
                {unitLocation(unit)}
              </div>
            </div>

            <EngagementRing pct={cap.occupancyPct} compact />

            <div className="w-full min-h-0">
              {cap.snapshot.satellites.length === 0 ? (
                <div className="mono text-[7px] uppercase tracking-wider text-foreground/80 text-center">
                  {cap.feasibilityStatus === "NON_OPERATIONAL"
                    ? "Non-operational"
                    : "No active scans"}
                </div>
              ) : (
                <div className="text-center min-w-0">
                  <p
                    className="mono text-[7px] text-foreground leading-snug truncate"
                    title={cap.snapshot.satellites.map((s) => s.name).join(", ")}
                  >
                    {satDisplay.label}
                  </p>
                  {satDisplay.total > 0 && (
                    <p className="mono text-[6px] text-foreground/70 mt-0.5">
                      {satDisplay.total} active
                    </p>
                  )}
                </div>
              )}
            </div>
          </Link>
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

function EngagementRing({ pct, compact }: { pct: number; compact?: boolean }) {
  const size = compact ? 48 : 64;
  const stroke = compact ? 5 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = engColor(pct);
  const pctSize = compact ? "text-[10px]" : "text-[12px]";
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
        <span className={`mono font-bold leading-none ${pctSize}`} style={{ color }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}
