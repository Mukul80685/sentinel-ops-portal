import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Boxes, Radar, ListOrdered, Activity, Archive, Shield, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "Command — SSACC" }] }),
});

const tiles = [
  { to: "/inventory", title: "Resource Inventory", icon: Boxes, desc: "Equipment registry across all agencies" },
  { to: "/visibility", title: "Satellite Visibility Metrics", icon: Radar, desc: "EIRP matrix — satellite × agency" },
  { to: "/priority", title: "Satellite Priority & Allocation", icon: ListOrdered, desc: "Allocated satellites and priority tiers" },
  { to: "/engagement", title: "Present Engagement Status", icon: Activity, desc: "Active observation tasks (live)" },
  { to: "/intel", title: "INT Repository", icon: Archive, desc: "Historical intelligence archive" },
  { to: "/serviceability", title: "Serviceability State", icon: Shield, desc: "Operational readiness — all agencies" },
];

function Home() {
  const counts = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [units, sats, eq, eng, intel] = await Promise.all([
        supabase.from("units").select("id", { count: "exact", head: true }),
        supabase.from("satellites").select("id", { count: "exact", head: true }),
        supabase.from("equipment").select("id", { count: "exact", head: true }),
        supabase.from("engagements").select("id", { count: "exact", head: true }).in("status", ["Planned", "In Progress", "Paused"]),
        supabase.from("intel_records").select("id", { count: "exact", head: true }),
      ]);
      return {
        units: units.count ?? 0,
        sats: sats.count ?? 0,
        eq: eq.count ?? 0,
        eng: eng.count ?? 0,
        intel: intel.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Agencies", value: counts.data?.units ?? "—" },
    { label: "Satellites Tracked", value: counts.data?.sats ?? "—" },
    { label: "Equipment Items", value: counts.data?.eq ?? "—" },
    { label: "Active Engagements", value: counts.data?.eng ?? "—" },
    { label: "INT Records", value: counts.data?.intel ?? "—" },
  ];

  return (
    <AppShell
      title="Command Overview"
      subtitle="SSACC // Main"
      actions={
        <Link
          to="/serviceability"
          className="hidden md:inline-flex mono text-[11px] uppercase tracking-wider items-center gap-1.5 h-8 px-3 bg-primary text-primary-foreground rounded-sm hover:opacity-90"
        >
          <Shield className="h-3.5 w-3.5" /> Serviceability State
        </Link>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="panel p-3">
            <div className="label-eyebrow">{s.label}</div>
            <div className="mono text-2xl font-bold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="tile group flex items-start gap-3">
            <div className="h-10 w-10 grid place-items-center rounded-sm border border-border bg-secondary text-primary shrink-0">
              <t.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mono text-sm font-bold uppercase tracking-tight">{t.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.desc}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-1" />
          </Link>
        ))}
      </div>
    </AppShell>
  );
}