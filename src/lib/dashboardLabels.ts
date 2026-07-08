/** Satellite Monitoring Dashboard drill-down panel ids (URL search param `panel`). */
export type DashboardPanel = "engagement" | "activity" | "optimization";

/** Display names for Satellite Monitoring Dashboard panels — single source of truth. */
export const DASHBOARD_PANEL_LABELS: Record<DashboardPanel, string> = {
  engagement: "Resource Engagement Status",
  activity: "Active Satellite Monitoring",
  optimization: "Optimization Engine",
};

/** Short operational questions each panel answers (tooltips / subtitles). */
export const DASHBOARD_PANEL_PURPOSE: Record<DashboardPanel, string> = {
  engagement: "What resources are currently committed?",
  activity: "Which satellites are being monitored and what is their progress?",
  optimization:
    "How efficiently are resources utilized based on utilization, prioritization, and serviceability?",
};

export function dashboardPanelBackLink(panel: DashboardPanel) {
  return { to: "/" as const, search: { panel } };
}
