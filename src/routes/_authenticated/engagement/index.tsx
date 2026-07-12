import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { Empty } from "@/components/Empty";
import { loadRingPalette, useEngagementRingVisuals } from "@/lib/engagementRingVisuals";
import { useDashboardData } from "@/hooks/useDashboardData";
import { DASHBOARD_PANEL_LABELS } from "@/lib/dashboardLabels";

export const Route = createFileRoute("/_authenticated/engagement/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});

/** Resource Engagement Status — unit tiles driven by INT Repository uploads only. */
export function EngagementDashboardView() {
  const { engagement, isLoading } = useDashboardData();

  const monitoringUnits = engagement.units.filter((u) => u.monitoringSatelliteCount > 0);
  const totalSatellites = monitoringUnits.reduce((s, u) => s + u.monitoringSatelliteCount, 0);

  if (isLoading) {
    return (
      <div className="py-12 text-center mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Loading {DASHBOARD_PANEL_LABELS.engagement.toLowerCase()}…
      </div>
    );
  }

  if (engagement.units.length === 0) {
    return <Empty title="No units registered" />;
  }

  return (
    <>
      <div className="panel mb-3 px-3 py-2 flex items-center gap-4 flex-wrap">
        <FleetStat label="Units" value={engagement.units.length} />
        <div className="h-4 w-px bg-border hidden sm:block" />
        <FleetStat label="Units Monitoring" value={monitoringUnits.length} accent />
        <div className="h-4 w-px bg-border hidden sm:block" />
        <FleetStat label="Satellites Monitored" value={totalSatellites} />
        <div className="h-4 w-px bg-border hidden sm:block" />
        <FleetStat label="Avg Engagement" value={`${engagement.avgOccupancy}%`} />
      </div>

      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
        {engagement.units.map((row) => {
          const monitoring = row.monitoringSatelliteCount;
          return (
            <Link
              key={row.unitId}
              to="/engagement/$unitId"
              params={{ unitId: row.unitId }}
              className="panel flex flex-col items-center gap-2.5 px-3 py-3 overflow-hidden
                         hover:border-primary/45 hover:bg-primary/5 transition-all no-underline cursor-pointer"
            >
              <div className="text-center w-full min-w-0">
                <div className="mono text-[13px] font-bold uppercase tracking-tight text-foreground leading-tight truncate">
                  {row.unitLabel}
                </div>
              </div>

              <EngagementRing pct={row.occupancyPct} compact />

              {monitoring > 0 && (
                <p className="mono text-[10px] font-semibold text-foreground text-center">
                  {monitoring} satellite{monitoring === 1 ? "" : "s"}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}

function FleetStat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`mono text-[15px] font-bold leading-none ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
      <span className="mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground leading-none">
        {label}
      </span>
    </div>
  );
}

function EngagementRing({ pct, compact }: { pct: number; compact?: boolean }) {
  const size = compact ? 48 : 64;
  const stroke = compact ? 5 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const palette = loadRingPalette(pct);
  const { trackStroke, arcStroke, defs } = useEngagementRingVisuals(palette);
  const pctSize = compact ? "text-[10px]" : "text-[12px]";
  return (
    <div className="le-progress-ring relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {defs}
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackStroke} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={arcStroke}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`mono font-bold leading-none ${pctSize}`} style={{ color: palette.base }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}
