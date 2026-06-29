import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Boxes, Radar, Shield } from "lucide-react";
import { ccHubSearch, CONTROL_CENTER_MODULES } from "@/lib/controlCenter";
export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "Satellite Signal Analysis and Coordination Center" }] }),
});

const CC_HOME_TABS = CONTROL_CENTER_MODULES.filter(
  (m) => m.id === "engagement" || m.id === "intel" || m.id === "priority",
);

const SUPPORT_MODULES = [
  {
    to: "/visibility",
    title: "Satellite Visibility Matrices",
    icon: Radar,
  },
  {
    to: "/inventory",
    title: "Resource Inventory",
    icon: Boxes,
  },
  {
    to: "/serviceability",
    title: "Serviceability State",
    icon: Shield,
  },
] as const;
function Home() {
  return (
    <AppShell isHome>
      <div className="flex flex-col gap-3 h-full min-h-0">

        {/* ── CONTROL CENTER — horizontal command tab ─────────────────────── */}
        <div className="shrink-0 rounded-md border-2 border-primary/45 overflow-hidden bg-card">
          {/* Center heading */}
          <div
            className="flex items-center justify-center px-4 py-3 border-b border-primary/25 bg-primary/[0.06]"
          >
            <span className="mono text-base sm:text-lg font-bold uppercase tracking-wide text-foreground">
              Control Center<span className="text-primary">:</span> SSACC
            </span>
          </div>

          {/* Three operational tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/80">
            {CC_HOME_TABS.map(({ id, title, icon: Icon }) => (
              <Link
                key={id}
                to="/control-center"
                search={ccHubSearch(id)}
                className="flex flex-col items-center justify-center gap-2.5 px-3 py-4 text-center
                           hover:bg-primary/8 transition-colors group/tab"
              >
                <div className="h-11 w-11 grid place-items-center rounded-lg border border-primary/30 bg-primary/10
                                shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_6px_rgba(0,0,0,0.12)]
                                group-hover/tab:border-primary/50 group-hover/tab:bg-primary/15 transition-all">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <span className="mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-foreground leading-snug group-hover/tab:text-primary transition-colors">
                  {title}
                </span>
              </Link>
            ))}
          </div>        </div>

        {/* ── Secondary modules — 3 equal columns ─────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
          {SUPPORT_MODULES.map((mod) => (
            <Link
              key={mod.to}
              to={mod.to}
              className="home-module-tile flex flex-col items-center justify-center gap-3 min-h-0 py-6 px-4
                         text-center no-underline group"
            >
              <div className="h-14 w-14 grid place-items-center rounded-xl border border-border/70 bg-secondary/40
                              shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_0_rgba(0,0,0,0.08),0_6px_12px_rgba(0,0,0,0.1)]
                              group-hover:border-primary/35 group-hover:bg-primary/10 transition-all">
                <mod.icon className="h-7 w-7 text-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="mono text-[11px] sm:text-[13px] font-bold uppercase tracking-wide text-foreground leading-snug
                               group-hover:text-primary transition-colors">
                {mod.title}
              </span>
            </Link>
          ))}
        </div>      </div>
    </AppShell>
  );
}
