import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Semantic icon themes for the home dashboard and app sidebar. */
export type HomeIconTheme =
  | "satellite"
  | "discussions"
  | "reports"
  | "important"
  | "discarded"
  | "engagement"
  | "intel"
  | "priority"
  | "visibility"
  | "inventory"
  | "serviceability";

const THEME_BOX: Record<HomeIconTheme, string> = {
  satellite:
    "border-violet-500 bg-gradient-to-br from-violet-500 to-indigo-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_3px_8px_rgba(99,102,241,0.45)]",
  discussions:
    "border-orange-500 bg-gradient-to-br from-orange-400 to-amber-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_3px_8px_rgba(249,115,22,0.40)]",
  reports:
    "border-slate-500 bg-gradient-to-br from-slate-400 to-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_8px_rgba(100,116,139,0.35)]",
  important:
    "border-amber-500 bg-gradient-to-br from-amber-400 to-amber-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_3px_8px_rgba(234,179,8,0.45)]",
  discarded:
    "border-red-600 bg-gradient-to-br from-red-500 to-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_3px_8px_rgba(239,68,68,0.45)]",
  engagement:
    "border-emerald-600 bg-gradient-to-br from-emerald-500 to-teal-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_8px_rgba(16,185,129,0.40)]",
  intel:
    "border-indigo-600 bg-gradient-to-br from-indigo-500 to-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_8px_rgba(99,102,241,0.45)]",
  priority:
    "border-red-600 bg-gradient-to-br from-red-500 to-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_3px_8px_rgba(239,68,68,0.40)]",
  visibility:
    "border-sky-500 bg-gradient-to-br from-sky-400 to-cyan-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_3px_8px_rgba(14,165,233,0.45)]",
  inventory:
    "border-amber-600 bg-gradient-to-br from-amber-500 to-orange-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_8px_rgba(217,119,6,0.40)]",
  serviceability:
    "border-slate-500 bg-gradient-to-br from-slate-400 to-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_8px_rgba(100,116,139,0.35)]",
};

const THEME_ICON: Record<HomeIconTheme, string> = {
  satellite: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
  discussions: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
  reports: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
  important: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
  discarded: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
  engagement: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
  intel: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
  priority: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
  visibility: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
  inventory: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
  serviceability: "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.30)]",
};

const SIZE_CLASSES = {
  sm: { box: "h-7 w-7 rounded-md", icon: "h-3.5 w-3.5" },
  md: { box: "h-12 w-12 sm:h-14 sm:w-14 rounded-xl", icon: "h-6 w-6 sm:h-7 sm:w-7" },
  lg: { box: "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] lg:h-20 lg:w-20 rounded-2xl", icon: "h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10" },
  xl: { box: "h-[4.5rem] w-[4.5rem] lg:h-24 lg:w-24 xl:h-28 xl:w-28 rounded-2xl", icon: "h-9 w-9 lg:h-11 lg:w-11 xl:h-12 xl:w-12" },
} as const;

export function HomeNavIconBadge({
  icon: Icon,
  theme,
  size = "md",
  /** Force inline gradient badge (sidebar-style) at any size — no parent wrapper required. */
  solid = false,
}: {
  icon: LucideIcon;
  theme: HomeIconTheme;
  size?: keyof typeof SIZE_CLASSES;
  solid?: boolean;
}) {
  const { box, icon: iconSz } = SIZE_CLASSES[size];
  const isHomeSurface = !solid && (size === "lg" || size === "xl");

  if (!isHomeSurface) {
    return (
      <span
        className={`grid place-items-center shrink-0 border transition-transform duration-200 group-hover:scale-105 group-hover/tab:scale-105 ${box} ${THEME_BOX[theme]}`}
      >
        <Icon className={`${iconSz} ${THEME_ICON[theme]}`} strokeWidth={2.25} />
      </span>
    );
  }

  return (
    <span
      className={`home-icon-badge home-icon-badge--${theme} grid place-items-center shrink-0 transition-transform duration-200 group-hover:scale-105 group-hover/tab:scale-105 ${box}`}
    >
      <Icon
        className={`home-icon-badge__glyph ${iconSz} ${THEME_ICON[theme]}`}
        strokeWidth={2.25}
      />
    </span>
  );
}

/** Solid opaque colours for sidebar context (dark green background). */
const SIDEBAR_SOLID_BG: Record<HomeIconTheme, string> = {
  satellite:      "bg-violet-600",
  discussions:    "bg-orange-500",
  reports:        "bg-slate-500",
  important:      "bg-amber-500",
  discarded:      "bg-red-600",
  engagement:     "bg-emerald-600",
  intel:          "bg-indigo-600",
  priority:       "bg-rose-600",
  visibility:     "bg-sky-500",
  inventory:      "bg-amber-600",
  serviceability: "bg-slate-400",
};

export function HomeSidebarIcon({
  icon: Icon,
  theme,
}: {
  icon: LucideIcon;
  theme: HomeIconTheme;
}) {
  return (
    <span
      className={`h-6 w-6 rounded-md grid place-items-center shrink-0 ${SIDEBAR_SOLID_BG[theme]}`}
    >
      <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.25} />
    </span>
  );
}

/** Larger colourful badge for home launcher tiles — same palette as sidebar icons. */
export function HomeLauncherIcon({
  icon: Icon,
  theme,
}: {
  icon: LucideIcon;
  theme: HomeIconTheme;
}) {
  return (
    <span
      className={`h-[4.75rem] w-[4.75rem] sm:h-[5.25rem] sm:w-[5.25rem] lg:h-24 lg:w-24 rounded-2xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_4px_14px_rgba(0,0,0,0.14)] ${SIDEBAR_SOLID_BG[theme]}`}
    >
      <Icon className="h-10 w-10 sm:h-11 sm:w-11 lg:h-12 lg:w-12 text-white" strokeWidth={2.25} />
    </span>
  );
}

export function renderSidebarIcon(
  Icon: LucideIcon,
  theme: HomeIconTheme,
): ReactNode {
  return <HomeSidebarIcon icon={Icon} theme={theme} />;
}

export const HOME_SIDEBAR_BTN =
  "home-sidebar-btn flex w-full items-center gap-2.5 px-2.5 py-2 text-left";
