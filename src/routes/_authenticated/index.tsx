import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Boxes, Radar, Shield } from "lucide-react";
import { ccHubSearch, CONTROL_CENTER_MODULES } from "@/lib/controlCenter";
import { HomeNavIconBadge, type HomeIconTheme } from "@/components/home/HomeNavIcons";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "Satellite Signal Analysis and Coordination Center" }] }),
});

/** Thin accent bar gradient below each card/tab title, colour-matched to icon theme. */
const ACCENT_GRADIENT: Record<string, string> = {
  engagement:     "bg-gradient-to-r from-transparent via-emerald-500 to-transparent",
  intel:          "bg-gradient-to-r from-transparent via-indigo-500 to-transparent",
  priority:       "bg-gradient-to-r from-transparent via-red-500 to-transparent",
  visibility:     "bg-gradient-to-r from-transparent via-sky-500 to-transparent",
  inventory:      "bg-gradient-to-r from-transparent via-amber-500 to-transparent",
  serviceability: "bg-gradient-to-r from-transparent via-slate-500 to-transparent",
};

const CC_HOME_TABS = CONTROL_CENTER_MODULES.filter(
  (m) => m.id === "engagement" || m.id === "intel" || m.id === "priority",
);

const CC_TAB_THEMES: Record<string, HomeIconTheme> = {
  engagement: "engagement",
  intel: "intel",
  priority: "priority",
};

const SUPPORT_MODULES = [
  { to: "/visibility",    title: "Satellite Visibility Matrix", icon: Radar,  theme: "visibility"     as const },
  { to: "/inventory",     title: "Resource Inventory",          icon: Boxes,  theme: "inventory"      as const },
  { to: "/serviceability",title: "Serviceability State",        icon: Shield, theme: "serviceability" as const },
] as const;

function Home() {
  return (
    <AppShell isHome>
      <div className="home-dashboard h-full min-h-0 max-w-[1600px] mx-auto w-full">
        {/* ── CONTROL CENTER — top half of viewport ───────────────────────── */}
        <div className="home-cc-panel min-h-0 h-full flex flex-col rounded-[1.25rem] border-2 border-primary/30 overflow-hidden bg-card">
          <div className="home-cc-heading shrink-0 flex items-center justify-center gap-3 px-4 py-2.5 sm:py-3 border-b-2 border-primary/35">
            {/* Left decorative line */}
            <span className="home-cc-title-line hidden sm:block" aria-hidden="true" />
            <span className="text-primary/40 text-[0.5rem] hidden sm:block" aria-hidden="true">◆</span>
            <span className="mono text-base sm:text-lg lg:text-xl xl:text-2xl font-bold uppercase tracking-[0.14em] text-foreground whitespace-nowrap">
              Control Center<span className="text-primary mx-1">:</span>SSACC
            </span>
            <span className="text-primary/40 text-[0.5rem] hidden sm:block" aria-hidden="true">◆</span>
            {/* Right decorative line */}
            <span className="home-cc-title-line right hidden sm:block" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 flex-1 min-h-0 divide-y sm:divide-y-0 sm:divide-x divide-primary/10">
            {CC_HOME_TABS.map(({ id, title, icon: Icon }) => (
              <Link
                key={id}
                to="/control-center"
                search={ccHubSearch(id)}
                className="home-cc-tab group/tab flex flex-col items-center justify-center gap-2 sm:gap-3 lg:gap-4
                           h-full min-h-0 px-4 py-4 sm:py-5 text-center no-underline"
              >
                <HomeNavIconBadge icon={Icon} theme={CC_TAB_THEMES[id] ?? "engagement"} size="lg" />
                <span className="mono text-[10px] sm:text-xs md:text-sm lg:text-base xl:text-lg font-bold uppercase tracking-[0.09em] text-foreground leading-snug group-hover/tab:text-primary transition-colors max-w-[14rem] min-h-[2.2em] flex items-center justify-center text-center">
                  {title}
                </span>
                <span
                  className={`home-card-accent ${ACCENT_GRADIENT[CC_TAB_THEMES[id] ?? "engagement"] ?? ""}`}
                  aria-hidden="true"
                />
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
                         h-full min-h-0 py-4 sm:py-5 lg:py-6 px-3 sm:px-4 text-center no-underline group"
            >
              <HomeNavIconBadge icon={mod.icon} theme={mod.theme} size="lg" />
              <span className="mono text-[10px] sm:text-xs md:text-sm lg:text-base xl:text-xl font-bold uppercase tracking-[0.09em] text-foreground leading-snug group-hover:text-primary transition-colors">
                {mod.title}
              </span>
              <span
                className={`home-card-accent ${ACCENT_GRADIENT[mod.theme] ?? ""}`}
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
