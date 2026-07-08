import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { SatelliteMonitoringDashboard } from "@/components/satellite-monitoring/SatelliteMonitoringDashboard";
import type { DashboardPanel } from "@/lib/dashboardLabels";

const DASHBOARD_PANELS = new Set<DashboardPanel>(["engagement", "activity", "optimization"]);

function parsePanel(value: unknown): DashboardPanel | undefined {
  return typeof value === "string" && DASHBOARD_PANELS.has(value as DashboardPanel)
    ? (value as DashboardPanel)
    : undefined;
}

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "Satellite Monitoring Dashboard — SSACC" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    unit: typeof search.unit === "string" ? search.unit : undefined,
    panel: parsePanel(search.panel),
  }),
});

function Home() {
  const { panel } = Route.useSearch();

  const showBg = !panel;

  return (
    <AppShell isHome>
      <div className="h-full min-h-0 flex flex-col overflow-y-auto relative">
        {/* Background image — only on the executive overview, not drill-downs */}
        {showBg && (
          <div
            className="absolute inset-0 pointer-events-none select-none z-0"
            aria-hidden="true"
          >
            <img
              src="/satellite-monitoring-bg.png"
              alt=""
              className="w-full h-full object-cover object-center"
            />
            {/* Dark overlay so tiles stay readable */}
            <div className="absolute inset-0 bg-background/70" />
          </div>
        )}

        <div className="relative z-10 flex flex-col h-full min-h-0">
          <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-3 sm:py-4 border-b border-primary/20 mb-4">
            <span className="home-cc-title-line hidden sm:block" aria-hidden="true" />
            <span className="text-primary/40 text-[0.5rem] hidden sm:block" aria-hidden="true">◆</span>
            <h2 className="mono text-base sm:text-lg lg:text-xl xl:text-2xl font-bold uppercase tracking-[0.14em] text-foreground whitespace-nowrap">
              Satellite Monitoring Dashboard
            </h2>
            <span className="text-primary/40 text-[0.5rem] hidden sm:block" aria-hidden="true">◆</span>
            <span className="home-cc-title-line right hidden sm:block" aria-hidden="true" />
          </div>
          <SatelliteMonitoringDashboard panel={panel} />
        </div>
      </div>
    </AppShell>
  );
}
