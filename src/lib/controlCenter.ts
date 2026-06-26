import type { LucideIcon } from "lucide-react";
import { Activity, Archive, ListOrdered, Star } from "lucide-react";

export const CC_MODULE_IDS = [
  "engagement",
  "intel",
  "important",
  "priority",
] as const;

export type ControlCenterModuleId = (typeof CC_MODULE_IDS)[number];

export function isControlCenterModule(v: string): v is ControlCenterModuleId {
  return (CC_MODULE_IDS as readonly string[]).includes(v);
}

export type ControlCenterModuleMeta = {
  id: ControlCenterModuleId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  description: string;
};

export const CONTROL_CENTER_MODULES: ControlCenterModuleMeta[] = [
  {
    id: "engagement",
    title: "Live Engagement Status",
    subtitle: "",
    icon: Activity,
    description: "Real-time resource utilization and satellite tasking.",
  },
  {
    id: "intel",
    title: "Intelligence Repository",
    subtitle: "Centralized Intelligence Collection Archive",
    icon: Archive,
    description: "Mission intelligence archives and analysis records.",
  },
  {
    id: "important",
    title: "Important Frequencies",
    subtitle: "Compiled List of Important Links",
    icon: Star,
    description: "Frequency database, correlation and reporting.",
  },
  {
    id: "priority",
    title: "Satellite Priority & Allocation",
    subtitle: "",
    icon: ListOrdered,
    description: "Tasking priorities and satellite assignment engine.",
  },
];

export const CONTROL_CENTER_MODULE_MAP = Object.fromEntries(
  CONTROL_CENTER_MODULES.map((m) => [m.id, m]),
) as Record<ControlCenterModuleId, ControlCenterModuleMeta>;

/** Back link from a CC submodule drill-down to its hub view */
export function ccModuleBackLink(module: ControlCenterModuleId) {
  return { to: "/control-center" as const, search: { module } };
}
