import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Boxes, Radar, ListOrdered, Activity, Archive, Shield, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "SSACC — Satellite Signal Analysis and Coordination Center" }] }),
});

const tiles = [
  {
    to: "/engagement",
    title: "Control Center and Engagement Status",
    icon: Activity,
    desc: "Live and scheduled observation tasks with real-time status and tracking data.",
  },
  {
    to: "/intel",
    title: "INT Repository",
    icon: Archive,
    desc: "Intelligence records archive — historical intercepts and cross-unit analytical reports.",
  },
  {
    to: "/visibility",
    title: "Satellite Visibility Metrics",
    icon: Radar,
    desc: "EIRP visibility matrix — satellite and agency signal coverage and strength windows.",
  },
  {
    to: "/priority",
    title: "Satellite Priority and Allocation",
    icon: ListOrdered,
    desc: "Priority tier assignments and satellite allocation across all operational units.",
  },
  {
    to: "/inventory",
    title: "Resource Inventory",
    icon: Boxes,
    desc: "Ground station equipment catalogue — antennas, LNAs, demodulators and servers across all units.",
  },
  {
    to: "/serviceability",
    title: "Serviceability State",
    icon: Shield,
    desc: "Equipment readiness overview — operational status across all agencies and units.",
  },
  {
    to: "/important",
    title: "Important Frequencies",
    icon: Star,
    desc: "Priority frequency bookmarks for satellite and ground station operations.",
  },
];

function Home() {
  return (
    <AppShell isHome>
      {/* 3-column grid — all 7 tiles visible without scrolling */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {tiles.map((t, i) => (
          <Link
            key={t.to}
            to={t.to}
            className={`tile group flex items-start gap-2 !py-2.5 !px-3${
              i === tiles.length - 1 && tiles.length % 3 === 1
                ? " md:col-start-2"
                : ""
            }`}
          >
            {/* Icon box — compact */}
            <div className="h-8 w-8 grid place-items-center rounded-sm border border-border bg-secondary text-foreground shrink-0 mt-0.5">
              <t.icon className="h-4 w-4" />
            </div>

            {/* Text block */}
            <div className="min-w-0 flex-1">
              <div className="mono text-xs font-bold uppercase tracking-tight leading-tight">
                {t.title}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 text-justify leading-snug hyphens-auto">
                {t.desc}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
