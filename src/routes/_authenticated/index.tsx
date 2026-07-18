import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { SatelliteMonitoringDashboard } from "@/components/satellite-monitoring/SatelliteMonitoringDashboard";
import type { DashboardPanel } from "@/lib/dashboardLabels";
import { notifyOperationalDerivedRefresh } from "@/lib/operationalRefresh";

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

  useEffect(() => {
    if (panel === "optimization") {
      notifyOperationalDerivedRefresh();
    }
  }, [panel]);

  return (
    <AppShell isHome>
      <div
        className={`flex-1 min-h-0 h-full flex flex-col overflow-y-auto relative${showBg ? " bg-[#0a1628]" : ""}`}
      >
        <div className="relative z-10 flex flex-1 flex-col h-full min-h-0">
          <SatelliteMonitoringDashboard panel={panel} />
        </div>
      </div>
    </AppShell>
  );
}
