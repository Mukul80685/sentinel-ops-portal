import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LayoutDashboard, Signal, Activity, Archive, Radar, ListOrdered, Boxes, Shield, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/control-center")({
  component: ControlCenterPage,
  head: () => ({ meta: [{ title: "Control Center — SSACC" }] }),
});

const FEED_MODULES = [
  { icon: Activity,    label: "Engagement Status",              desc: "Live utilisation and task status" },
  { icon: Archive,     label: "INT Repository",                 desc: "Intelligence records and intercepts" },
  { icon: Radar,       label: "Satellite Visibility Metrics",   desc: "Coverage windows and signal strength" },
  { icon: ListOrdered, label: "Satellite Priority & Allocation",desc: "Tier assignments and unit allocation" },
  { icon: Boxes,       label: "Resource Inventory",             desc: "Equipment catalogue and readiness" },
  { icon: Shield,      label: "Serviceability State",           desc: "Operational status across all units" },
  { icon: Star,        label: "Important Frequencies",          desc: "Priority frequency bookmarks" },
];

function ControlCenterPage() {
  return (
    <AppShell
      title="Control Center"
      subtitle="Mission Operations Command"
      headerIcon={<LayoutDashboard className="h-4 w-4" />}
      showBack
    >
      <div className="space-y-6">
        {/* Status banner */}
        <div className="panel border border-primary/30 bg-primary/5 flex items-center gap-4 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Signal className="h-5 w-5 text-primary" />
            <span className="mono text-sm font-bold uppercase tracking-widest text-primary">Command Node</span>
          </div>
          <div className="h-4 border-l border-border mx-2" />
          <span className="mono text-[11px] text-muted-foreground uppercase tracking-wider">
            All module telemetry converges here · Full integration coming soon
          </span>
        </div>

        {/* Module feed grid */}
        <div>
          <div className="label-eyebrow mb-3 flex items-center gap-1.5">
            <Signal className="h-3 w-3" />
            Live Module Feeds
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {FEED_MODULES.map((m) => (
              <div key={m.label} className="panel flex items-start gap-3 px-4 py-3 opacity-60">
                <div className="h-8 w-8 shrink-0 grid place-items-center rounded-sm border border-border bg-secondary">
                  <m.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="mono text-[11px] font-bold uppercase tracking-tight leading-tight">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</div>
                  <div className="mt-2 mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    — Awaiting integration
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
