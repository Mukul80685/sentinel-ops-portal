import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: VsatDashboard,
  head: () => ({ meta: [{ title: "Satellite Monitoring Dashboard — SSACC" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    unit: typeof search.unit === "string" ? search.unit : undefined,
    panel: parsePanel(search.panel),
  }),
});

function VsatDashboard() {
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
        {!panel && (
          <Link
            to="/"
            className="absolute top-3 left-3 z-30 inline-flex items-center gap-1.5 mono text-[11px] font-semibold uppercase tracking-wider text-foreground/90 hover:text-primary transition-colors no-underline rounded-sm border border-border/60 bg-card/85 backdrop-blur-sm px-3 py-1.5 shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            Back
          </Link>
        )}
        <div className="relative z-10 flex flex-1 flex-col h-full min-h-0">
          <SatelliteMonitoringDashboard panel={panel} />
        </div>
      </div>
    </AppShell>
  );
}
