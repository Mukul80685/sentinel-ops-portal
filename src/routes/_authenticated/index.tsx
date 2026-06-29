import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Boxes, Radar, Shield } from "lucide-react";
import { ccHubSearch, CONTROL_CENTER_MODULES } from "@/lib/controlCenter";
import { HomeNavIconBadge, type HomeIconTheme } from "@/components/home/HomeNavIcons";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "Satellite Signal Analysis and Coordination Center" }] }),
});

const CC_HOME_TABS = CONTROL_CENTER_MODULES.filter(
  (m) => m.id === "engagement" || m.id === "intel" || m.id === "priority",
);

const CC_TAB_THEMES: Record<string, HomeIconTheme> = {
  engagement: "engagement",
  intel: "intel",
  priority: "priority",
};

const SUPPORT_MODULES = [
  {
    to: "/visibility",
    title: "Satellite Visibility Matrices",
    icon: Radar,
    theme: "visibility" as const,
  },
  {
    to: "/inventory",
    title: "Resource Inventory",
    icon: Boxes,
    theme: "inventory" as const,
  },
  {
    to: "/serviceability",
    title: "Serviceability State",
    icon: Shield,
    theme: "serviceability" as const,
  },
] as const;

function Home() {
  return (
    <AppShell isHome>
      <div className="home-dashboard h-full min-h-0 max-w-[1600px] mx-auto w-full">
        {/* ── CONTROL CENTER — top half of viewport ───────────────────────── */}
        <div className="home-cc-panel min-h-0 h-full flex flex-col rounded-2xl border-2 border-primary/50 overflow-hidden bg-card">
          <div className="home-cc-heading shrink-0 flex items-center justify-center px-4 py-3 sm:py-4 lg:py-5 border-b border-primary/30 bg-gradient-to-b from-primary/[0.14] to-primary/[0.04]">
            <span className="mono text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold uppercase tracking-wide text-foreground">
              Control Center<span className="text-primary">:</span> SSACC
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 flex-1 min-h-0 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
            {CC_HOME_TABS.map(({ id, title, icon: Icon }) => (
              <Link
                key={id}
                to="/control-center"
                search={ccHubSearch(id)}
                className="home-cc-tab group/tab flex flex-col items-center justify-center gap-2 sm:gap-3 lg:gap-4
                           h-full min-h-0 px-3 py-3 sm:py-4 text-center no-underline"
              >
                <HomeNavIconBadge icon={Icon} theme={CC_TAB_THEMES[id] ?? "engagement"} size="lg" />
                <span className="mono text-[10px] sm:text-xs md:text-sm lg:text-base xl:text-lg font-bold uppercase tracking-wide text-foreground leading-snug group-hover/tab:text-primary transition-colors max-w-[14rem]">
                  {title}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Secondary modules — bottom half of viewport ─────────────────── */}
        <div className="home-modules-row min-h-0 h-full grid grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {SUPPORT_MODULES.map((mod) => (
            <Link
              key={mod.to}
              to={mod.to}
              className="home-module-tile flex flex-col items-center justify-center gap-2 sm:gap-3 lg:gap-4
                         h-full min-h-0 py-3 sm:py-4 lg:py-5 px-2 sm:px-3 text-center no-underline group"
            >
              <HomeNavIconBadge icon={mod.icon} theme={mod.theme} size="lg" />
              <span className="mono text-[10px] sm:text-xs md:text-sm lg:text-base xl:text-xl font-bold uppercase tracking-wide text-foreground leading-snug group-hover:text-primary transition-colors">
                {mod.title}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
