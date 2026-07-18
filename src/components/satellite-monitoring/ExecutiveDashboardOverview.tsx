import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import {
  ExecutiveProgressRing,
  OptimizationScoreLegend,
} from "@/components/satellite-monitoring/ExecutiveProgressRing";
import { useExecutiveDashboardMetrics } from "@/components/satellite-monitoring/useExecutiveDashboardMetrics";
import { DASHBOARD_PANEL_LABELS, DASHBOARD_PANEL_PURPOSE, type DashboardPanel } from "@/lib/dashboardLabels";

export type { DashboardPanel };

const TILE_CLASS =
  "home-module-tile relative flex flex-col items-center justify-center gap-4 sm:gap-5 lg:gap-6 " +
  "h-full min-h-[16rem] sm:min-h-[18rem] py-6 sm:py-8 px-4 sm:px-6 text-center no-underline group";

type TileConfig = {
  panel: DashboardPanel;
  accent: string;
};

const TILES: TileConfig[] = [
  { panel: "engagement", accent: "bg-gradient-to-r from-transparent via-emerald-500 to-transparent" },
  { panel: "activity", accent: "bg-gradient-to-r from-transparent via-sky-500 to-transparent" },
  { panel: "optimization", accent: "bg-gradient-to-r from-transparent via-amber-500 to-transparent" },
];

export function ExecutiveDashboardOverview() {
  // const metrics = useExecutiveDashboardMetrics();

  return (
    <div className="satellite-monitoring-dashboard flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden">
      <div className="flex-1 min-h-0 h-full w-full flex items-center justify-center overflow-hidden">
        <img
          src="/map.jpeg"
          alt=""
          className="w-full h-full object-fill object-center"
        />
      </div>
      {/* <div className="h-full min-h-0 max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 auto-rows-fr">
        {TILES.map((tile) => (
          <ExecutiveTile
            key={tile.panel}
            tile={tile}
            metrics={metrics}
          />
        ))}
      </div> */}
    </div>
  );
}

function ExecutiveTile({
  tile,
  metrics,
}: {
  tile: TileConfig;
  metrics: ReturnType<typeof useExecutiveDashboardMetrics>;
}) {
  return (
    <Link
      to="/"
      search={{ unit: undefined, panel: tile.panel }}
      className={TILE_CLASS}
      title={DASHBOARD_PANEL_PURPOSE[tile.panel]}
    >
      <span className="mono text-xs sm:text-sm md:text-base font-bold uppercase tracking-[0.12em] text-foreground leading-snug group-hover:text-primary transition-colors">
        {DASHBOARD_PANEL_LABELS[tile.panel]}
      </span>

      <TileBody panel={tile.panel} metrics={metrics} />

      <span className={`home-card-accent ${tile.accent}`} aria-hidden="true" />
    </Link>
  );
}

function TileBody({
  panel,
  metrics,
}: {
  panel: DashboardPanel;
  metrics: ReturnType<typeof useExecutiveDashboardMetrics>;
}) {
  if (metrics.isLoading) {
    return (
      <p className="mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (panel === "engagement") {
    return (
      <div className="flex flex-col items-center gap-3">
        <ExecutiveProgressRing value={metrics.avgEngagement} mode="engagement" />
        <p className="mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-center max-w-[14rem] leading-snug">
          Average Resource Engagement Across All Units
        </p>
      </div>
    );
  }

  if (panel === "activity") {
    return (
      <div className="flex flex-col items-center gap-4">
        <HomeNavIconBadge icon={Activity} theme="engagement" size="xl" solid />
        <div className="text-center">
          <div className="mono text-4xl sm:text-5xl lg:text-6xl font-bold tabular-nums text-foreground leading-none">
            {metrics.totalActiveSatellites}
          </div>
          <p className="mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mt-2">
            Active Satellites
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <ExecutiveProgressRing
        value={metrics.avgOptimizationScore}
        mode="optimization"
        suffix=""
      />
      <p className="mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-center max-w-[14rem] leading-snug">
        Overall Optimization Score
      </p>
      <OptimizationScoreLegend />
    </div>
  );
}
