import type { LucideIcon } from "lucide-react";
import { Archive, Boxes, ListOrdered, Radar, Shield, Star } from "lucide-react";

/** Embedded administrator modules (opened via ?module= on /administrator). */
export const CC_MODULE_IDS = [
  "intel",
  "important",
  "priority",
] as const;

/** Standalone routes launched from the administrator hub grid. */
export const ADMIN_HUB_STANDALONE = [
  { to: "/visibility" as const, title: "Satellite Visibility Matrix", icon: Radar, theme: "visibility" as const },
  { to: "/inventory" as const, title: "Resource Inventory", icon: Boxes, theme: "inventory" as const },
  { to: "/serviceability" as const, title: "Serviceability State", icon: Shield, theme: "serviceability" as const },
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

/** Hub search — omit undefined keys for stable TanStack Router search params. */
export function ccHubSearch(module?: ControlCenterModuleId, unit?: string) {
  return {
    ...(module ? { module } : {}),
    ...(unit ? { unit } : {}),
  };
}

/** Back link from an administrator submodule drill-down to its hub view */
export function ccModuleBackLink(module: ControlCenterModuleId) {
  return { to: "/administrator" as const, search: ccHubSearch(module) };
}

/** Administrator hub modules shown on the launcher grid (excludes engagement/home). */
export const ADMINISTRATOR_HUB_MODULES = CONTROL_CENTER_MODULES.filter(
  (m) => m.id === "intel" || m.id === "priority",
);
