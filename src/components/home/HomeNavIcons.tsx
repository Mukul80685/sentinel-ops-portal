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
    "border-violet-400/50 bg-gradient-to-br from-violet-500/25 via-indigo-500/20 to-sky-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_0_rgba(99,102,241,0.2),0_6px_14px_rgba(99,102,241,0.35)]",
  discussions:
    "border-orange-400/45 bg-gradient-to-br from-orange-500/20 to-amber-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_3px_0_rgba(249,115,22,0.15),0_6px_12px_rgba(249,115,22,0.3)]",
  reports:
    "border-slate-400/40 bg-gradient-to-br from-slate-200/80 to-slate-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_0_rgba(100,116,139,0.12),0_5px_10px_rgba(100,116,139,0.25)]",
  important:
    "border-amber-400/55 bg-gradient-to-br from-yellow-400/30 to-amber-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_0_rgba(234,179,8,0.15),0_6px_14px_rgba(234,179,8,0.35)]",
  discarded:
    "border-red-400/50 bg-gradient-to-br from-red-500/20 to-rose-600/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_3px_0_rgba(239,68,68,0.15),0_6px_12px_rgba(239,68,68,0.35)]",
  engagement:
    "border-emerald-400/50 bg-gradient-to-br from-emerald-500/25 to-teal-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_3px_0_rgba(16,185,129,0.15),0_6px_14px_rgba(16,185,129,0.3)]",
  intel:
    "border-indigo-400/45 bg-gradient-to-br from-indigo-500/25 to-violet-600/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_3px_0_rgba(99,102,241,0.15),0_6px_14px_rgba(99,102,241,0.3)]",
  priority:
    "border-transparent bg-gradient-to-br from-red-500/15 via-white/5 to-blue-500/20 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.35),inset_0_0_0_2px_rgba(59,130,246,0.2),0_3px_0_rgba(59,130,246,0.12),0_6px_14px_rgba(59,130,246,0.2)]",
  visibility:
    "border-sky-400/50 bg-gradient-to-br from-sky-500/25 to-cyan-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_3px_0_rgba(14,165,233,0.15),0_6px_14px_rgba(14,165,233,0.35)]",
  inventory:
    "border-amber-600/40 bg-gradient-to-br from-amber-500/20 to-orange-600/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_3px_0_rgba(217,119,6,0.12),0_6px_12px_rgba(217,119,6,0.28)]",
  serviceability:
    "border-slate-400/60 bg-gradient-to-br from-slate-200/80 to-slate-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-1px_0_rgba(0,0,0,0.08),0_3px_0_rgba(100,116,139,0.12),0_6px_12px_rgba(100,116,139,0.35)]",
};

const THEME_ICON: Record<HomeIconTheme, string> = {
  satellite: "text-violet-600 drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]",
  discussions: "text-orange-600",
  reports: "text-slate-600",
  important: "text-amber-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.45)]",
  discarded: "text-red-600",
  engagement: "text-emerald-700",
  intel: "text-indigo-700",
  priority: "text-red-600",
  visibility: "text-sky-700",
  inventory: "text-amber-800",
  serviceability: "text-slate-600",
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
}: {
  icon: LucideIcon;
  theme: HomeIconTheme;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const { box, icon: iconSz } = SIZE_CLASSES[size];
  const isHomeSurface = size === "lg" || size === "xl";

  return (
    <span
      className={
        isHomeSurface
          ? `home-icon-badge home-icon-badge--${theme} grid place-items-center shrink-0 transition-transform duration-200 group-hover:scale-105 group-hover/tab:scale-105 ${box}`
          : `grid place-items-center shrink-0 border transition-transform duration-200 group-hover:scale-105 ${box} ${THEME_BOX[theme]}`
      }
    >
      <Icon
        className={
          isHomeSurface
            ? `home-icon-badge__glyph ${iconSz} ${THEME_ICON[theme]}`
            : `${iconSz} ${THEME_ICON[theme]}`
        }
        strokeWidth={2.25}
      />
    </span>
  );
}

export function HomeSidebarIcon({
  icon: Icon,
  theme,
}: {
  icon: LucideIcon;
  theme: HomeIconTheme;
}) {
  return <HomeNavIconBadge icon={Icon} theme={theme} size="sm" />;
}

export function renderSidebarIcon(
  Icon: LucideIcon,
  theme: HomeIconTheme,
): ReactNode {
  return <HomeSidebarIcon icon={Icon} theme={theme} />;
}

export const HOME_SIDEBAR_BTN =
  "home-sidebar-btn flex w-full items-center gap-2.5 px-2.5 py-2 text-left";
