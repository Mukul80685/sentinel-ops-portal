/** VSAT satellite monitoring dashboard route (map + drill-down panels). */
export const VSAT_DASHBOARD_PATH = "/dashboard" as const;

/** Thuraya mobile satellite family — unit hub. */
export const THURAYA_HOME_PATH = "/thuraya" as const;

/** BeiDou monitoring system — standalone module. */
export const BEIDOU_HOME_PATH = "/beidou" as const;

/** Satellite Monitoring Dashboard drill-down panel ids (URL search param `panel`). */
export type DashboardPanel = "engagement" | "activity" | "optimization";

/** Display names for Satellite Monitoring Dashboard panels — single source of truth. */
export const DASHBOARD_PANEL_LABELS: Record<DashboardPanel, string> = {
  engagement: "Tasking of Resources",
  activity: "Satellite Monitoring",
  optimization: "Op Efficacy",
};

/** Short operational questions each panel answers (tooltips / subtitles). */
export const DASHBOARD_PANEL_PURPOSE: Record<DashboardPanel, string> = {
  engagement: "What resources are currently committed?",
  activity: "Which satellites are being monitored and what is their progress?",
  optimization:
    "How efficiently are resources utilized based on utilization, prioritization, and serviceability?",
};

export function dashboardPanelBackLink(panel: DashboardPanel) {
  return { to: VSAT_DASHBOARD_PATH, search: { panel } };
}

export function vsatDashboardLink(search?: {
  unit?: string;
  panel?: DashboardPanel;
}) {
  return {
    to: VSAT_DASHBOARD_PATH,
    search: {
      ...(search?.unit ? { unit: search.unit } : {}),
      ...(search?.panel ? { panel: search.panel } : {}),
    },
  };
}
