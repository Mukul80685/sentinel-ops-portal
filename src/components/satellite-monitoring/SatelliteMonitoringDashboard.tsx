import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { EngagementDashboardView } from "@/routes/_authenticated/engagement/index";
import { ExecutiveDashboardOverview } from "@/components/satellite-monitoring/ExecutiveDashboardOverview";
import type { DashboardPanel } from "@/components/satellite-monitoring/ExecutiveDashboardOverview";

const UnitActivitySnapshot = lazy(() =>
  import("@/routes/_authenticated/administrator").then((m) => ({
    default: m.UnitActivitySnapshot,
  })),
);

const OptimizationEngine = lazy(() =>
  import("@/routes/_authenticated/administrator").then((m) => ({
    default: m.OptimizationEngine,
  })),
);

const PANEL_TITLES: Record<DashboardPanel, string> = {
  engagement: "Engagement Status",
  activity: "Unit Activity Matrix",
  optimization: "Optimization Engine",
};

function isDashboardPanel(v: string | undefined): v is DashboardPanel {
  return v === "engagement" || v === "activity" || v === "optimization";
}

function PanelLoading() {
  return (
    <div className="py-12 text-center mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      Loading module…
    </div>
  );
}

function DashboardDetailShell({
  panel,
  children,
}: {
  panel: DashboardPanel;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col w-full min-h-0 gap-4 px-2 sm:px-4 pb-4">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 w-fit mono text-[11px] font-semibold uppercase tracking-wider text-foreground hover:text-primary transition-colors no-underline"
      >
        <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
        Back to Dashboard
      </Link>
      <div className="shrink-0 flex items-center gap-2.5 px-1">
        <span className="mono text-sm sm:text-base font-bold uppercase tracking-[0.12em] text-foreground">
          {PANEL_TITLES[panel]}
        </span>
      </div>
      <div className="min-h-0">{children}</div>
    </div>
  );
}

export function SatelliteMonitoringDashboard({
  panel,
}: {
  panel?: string;
}) {
  if (!isDashboardPanel(panel)) {
    return <ExecutiveDashboardOverview />;
  }

  if (panel === "engagement") {
    return (
      <DashboardDetailShell panel={panel}>
        <EngagementDashboardView />
      </DashboardDetailShell>
    );
  }

  if (panel === "activity") {
    return (
      <DashboardDetailShell panel={panel}>
        <Suspense fallback={<PanelLoading />}>
          <UnitActivitySnapshot />
        </Suspense>
      </DashboardDetailShell>
    );
  }

  return (
    <DashboardDetailShell panel={panel}>
      <Suspense fallback={<PanelLoading />}>
        <OptimizationEngine />
      </Suspense>
    </DashboardDetailShell>
  );
}
