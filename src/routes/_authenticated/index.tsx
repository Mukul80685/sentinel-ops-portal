import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Boxes, ChevronRight, LayoutDashboard, Radar, Shield } from "lucide-react";
import { CONTROL_CENTER_MODULES } from "@/lib/controlCenter";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "Satellite Signal Analysis and Coordination Center" }] }),
});

const CC_GROUP_A = CONTROL_CENTER_MODULES.filter((m) => m.id === "engagement" || m.id === "intel");
const CC_GROUP_B = CONTROL_CENTER_MODULES.filter((m) => m.id === "important" || m.id === "priority");

const CONTROL_CENTER_DESC =
  "Operational Command Hub for Live Intelligence, Task Allocation, Engagement Monitoring, Intelligence Repository Management and Analysis";

const SUPPORT_MODULES = [
  {
    to: "/visibility",
    title: "Satellite Visibility Matrices",
    icon: Radar,
    desc: "EIRP visibility matrix — coverage windows, beam footprints, and signal-strength data for all tracked satellites.",
  },
  {
    to: "/inventory",
    title: "Resource Inventory",
    icon: Boxes,
    desc: "Equipment catalogue — antennas, low noise amplifiers (LNA), demodulators, and processing servers across all operational units.",
  },
  {
    to: "/serviceability",
    title: "Serviceability State",
    icon: Shield,
    desc: "Equipment readiness and serviceability state across all operational units — operational, under repair, and non-serviceable.",
  },
] as const;

function Home() {
  return (
    <AppShell isHome>
      <div className="flex flex-col gap-3 h-full min-h-0">

        {/* ── CONTROL CENTER — full-width master panel (4 × 25%) ─────────── */}
        <div className="shrink-0 grid grid-cols-4 rounded-md border-2 border-primary/45 overflow-hidden bg-card min-h-[148px]">

          {/* Q1 — Identity (25%) */}
          <Link
            to="/control-center"
            className="col-span-1 flex flex-col justify-center gap-2 px-3 py-3
                       border-r border-primary/25 bg-primary/[0.06]
                       hover:bg-primary/10 transition-colors group min-w-0"
          >
            <div className="h-10 w-10 grid place-items-center rounded-sm border-2 border-primary/50 bg-primary/12
                            group-hover:border-primary group-hover:bg-primary/18 transition-colors shrink-0">
              <LayoutDashboard className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="mono text-[8px] uppercase tracking-[0.28em] text-primary font-semibold">
                Command Node
              </div>
              <div className="mono text-lg sm:text-xl font-bold uppercase tracking-wide text-foreground leading-tight mt-0.5">
                Control Center
              </div>
            </div>
          </Link>

          {/* Q2 — Operations Group A (25%) */}
          <div className="col-span-1 flex flex-col justify-center gap-2 px-3 py-3 border-r border-border/80">
            {CC_GROUP_A.map(({ id, title, icon: Icon }) => (
              <Link
                key={id}
                to="/control-center"
                search={{ module: id }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-sm border border-border bg-card
                           hover:border-primary/45 hover:bg-primary/8 transition-all group/btn"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-foreground leading-tight flex-1">
                  {title}
                </span>
                <ChevronRight className="h-3 w-3 text-foreground opacity-0 group-hover/btn:opacity-100 transition-opacity shrink-0" />
              </Link>
            ))}
          </div>

          {/* Q3 — Operations Group B (25%) */}
          <div className="col-span-1 flex flex-col justify-center gap-2 px-3 py-3 border-r border-border/80">
            {CC_GROUP_B.map(({ id, title, icon: Icon }) => (
              <Link
                key={id}
                to="/control-center"
                search={{ module: id }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-sm border border-border bg-card
                           hover:border-primary/45 hover:bg-primary/8 transition-all group/btn"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-foreground leading-tight flex-1">
                  {title}
                </span>
                <ChevronRight className="h-3 w-3 text-foreground opacity-0 group-hover/btn:opacity-100 transition-opacity shrink-0" />
              </Link>
            ))}
          </div>

          {/* Q4 — Control Center description (25%) */}
          <div className="col-span-1 flex items-center px-3 py-3 bg-secondary/15">
            <p className="mono text-[9px] sm:text-[10px] text-foreground/90 leading-relaxed text-center font-normal normal-case tracking-normal w-full">
              {CONTROL_CENTER_DESC}
            </p>
          </div>
        </div>

        {/* ── Secondary modules — 3 equal columns ─────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
          {SUPPORT_MODULES.map((mod) => (
            <Link
              key={mod.to}
              to={mod.to}
              className="tile flex flex-col gap-2 min-h-0 py-3 px-3.5
                         hover:border-primary/35 hover:bg-secondary/15 transition-all group"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 shrink-0 grid place-items-center rounded-sm border border-border bg-secondary
                                group-hover:border-primary/30 transition-colors">
                  <mod.icon className="h-4 w-4 text-foreground" />
                </div>
                <div className="mono text-[10px] sm:text-[11px] font-bold uppercase tracking-tight text-foreground leading-snug min-w-0">
                  {mod.title}
                </div>
              </div>
              <p className="text-[10px] sm:text-[11px] text-foreground/90 leading-relaxed flex-1 font-medium">
                {mod.desc}
              </p>
              <span className="mono text-[8px] uppercase tracking-wider text-foreground flex items-center gap-1
                               group-hover:text-primary transition-colors shrink-0">
                Open Module <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
