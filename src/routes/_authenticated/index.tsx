import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import {
  Boxes,
  Radar,
  ListOrdered,
  Activity,
  Archive,
  Shield,
  Star,
  LayoutDashboard,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "SSACC — Satellite Signal Analysis and Coordination Center" }] }),
});

// ─── Supporting module tiles (orbit around Control Center) ────────────────────

const ORBIT_TILES = [
  {
    area: "int",
    to: "/intel",
    title: "INT Repository",
    icon: Archive,
    desc: "Intelligence records archive — historical intercepts and cross-unit analytical reports.",
    layer: "Intelligence",
  },
  {
    area: "vis",
    to: "/visibility",
    title: "Satellite Visibility Metrics",
    icon: Radar,
    desc: "EIRP visibility matrix — satellite coverage windows and signal-strength data.",
    layer: "Intelligence",
  },
  {
    area: "pri",
    to: "/priority",
    title: "Satellite Priority & Allocation",
    icon: ListOrdered,
    desc: "Priority tier assignments and satellite allocation across all operational units.",
    layer: "Intelligence",
  },
  {
    area: "res",
    to: "/inventory",
    title: "Resource Inventory",
    icon: Boxes,
    desc: "Ground station equipment catalogue — antennas, LNAs, demodulators and servers.",
    layer: "Operations",
  },
  {
    area: "eng",
    to: "/engagement",
    title: "Engagement Status",
    icon: Activity,
    desc: "Live and scheduled observation tasks with real-time status and tracking data.",
    layer: "Operations",
  },
  {
    area: "svc",
    to: "/serviceability",
    title: "Serviceability State",
    icon: Shield,
    desc: "Equipment readiness overview — operational status across all agencies and units.",
    layer: "Support",
  },
  {
    area: "frq",
    to: "/important",
    title: "Important Frequencies",
    icon: Star,
    desc: "Priority frequency bookmarks for satellite and ground station operations.",
    layer: "Support",
  },
] as const;

// ─── Desktop orbital grid styles ──────────────────────────────────────────────

const ORBITAL_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 1fr)",
  gridTemplateAreas: `
    "int int vis vis pri pri"
    "res res cc  cc  eng eng"
    "svc svc cc  cc  frq frq"
  `,
  gap: "0.625rem",
};

// ─── Component ────────────────────────────────────────────────────────────────

function Home() {
  return (
    <AppShell isHome>
      {/* ── DESKTOP: Orbital hub layout (lg+) ──────────────────────────── */}
      <div className="hidden lg:block">
        <div style={ORBITAL_GRID_STYLE}>
          {/* Supporting tiles */}
          {ORBIT_TILES.map((t) => (
            <OrbitTile key={t.to} tile={t} />
          ))}

          {/* Control Center — command node, spans 2×2 center cells */}
          <CommandNodeTile />
        </div>
      </div>

      {/* ── MOBILE / TABLET: Standard grid with CC tile first ──────────── */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {/* CC tile spans full width on mobile */}
        <Link
          to="/control-center"
          className="col-span-2 group relative overflow-hidden rounded-sm border-2 border-primary/50
                     bg-primary/5 flex items-center gap-4 px-4 py-4
                     transition-all duration-200 hover:scale-[1.01] hover:shadow-lg hover:bg-primary/8"
        >
          <div className="h-12 w-12 shrink-0 grid place-items-center rounded-full border-2 border-primary/40 bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <LayoutDashboard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.25em] text-primary/70">Command Node</div>
            <div className="mono text-sm font-bold uppercase tracking-widest text-foreground">Control Center</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Mission operations command</div>
          </div>
        </Link>

        {/* Supporting tiles */}
        {ORBIT_TILES.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group tile flex items-start gap-2 !py-2.5 !px-3
                       transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:z-10"
          >
            <div className="h-7 w-7 shrink-0 grid place-items-center rounded-sm border border-border bg-secondary group-hover:bg-secondary/80 transition-colors mt-0.5">
              <t.icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mono text-[11px] font-bold uppercase tracking-tight leading-tight">{t.title}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{t.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

// ─── Orbit tile (supporting modules) ─────────────────────────────────────────

function OrbitTile({ tile }: { tile: typeof ORBIT_TILES[number] }) {
  return (
    <Link
      to={tile.to}
      style={{ gridArea: tile.area }}
      className="group relative tile overflow-hidden flex flex-col gap-2
                 transition-all duration-200 hover:scale-[1.025] hover:shadow-lg hover:z-10
                 focus:outline-none focus:ring-1 focus:ring-primary"
    >
      {/* Top: icon + title */}
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 shrink-0 grid place-items-center rounded-sm border border-border
                        bg-secondary group-hover:bg-secondary/70 transition-colors mt-0.5">
          <tile.icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="mono text-[11px] font-bold uppercase tracking-tight leading-snug">
            {tile.title}
          </div>
          <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground/60 mt-0.5">
            {tile.layer}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-[10px] text-muted-foreground leading-snug text-justify hyphens-auto flex-1">
        {tile.desc}
      </p>

      {/* Bottom accent bar — subtle flow indicator toward CC */}
      <div className="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/25 to-transparent
                      group-hover:via-primary/50 transition-all duration-300" />
    </Link>
  );
}

// ─── Control Center command node tile ────────────────────────────────────────

function CommandNodeTile() {
  return (
    <Link
      to="/control-center"
      style={{ gridArea: "cc" }}
      className="group relative overflow-hidden rounded-sm
                 border-2 border-primary/40 bg-primary/5
                 flex flex-col items-center justify-center gap-4 text-center
                 transition-all duration-200 hover:scale-[1.015] hover:shadow-2xl hover:bg-primary/8 hover:border-primary/60
                 focus:outline-none focus:ring-2 focus:ring-primary
                 z-0 hover:z-20"
    >
      {/* Decorative concentric rings */}
      <div className="absolute inset-3 rounded-sm border border-primary/12 group-hover:border-primary/22 transition-colors pointer-events-none" />
      <div className="absolute inset-7 rounded-sm border border-primary/8 group-hover:border-primary/15 transition-colors pointer-events-none" />

      {/* Command icon ring */}
      <div className="relative">
        {/* Outer pulse ring */}
        <div className="absolute -inset-3 rounded-full border border-primary/20 group-hover:border-primary/35 transition-colors" />
        <div className="h-16 w-16 grid place-items-center rounded-full
                        border-2 border-primary/50 bg-primary/10
                        group-hover:bg-primary/18 group-hover:border-primary/70
                        transition-all duration-200">
          <LayoutDashboard className="h-8 w-8 text-primary" />
        </div>
      </div>

      {/* Title block */}
      <div className="space-y-1 px-4">
        <div className="mono text-[9px] uppercase tracking-[0.3em] text-primary/60 group-hover:text-primary/80 transition-colors">
          Command Node
        </div>
        <div className="mono text-xl font-bold uppercase tracking-widest text-foreground leading-tight">
          Control Center
        </div>
        <div className="text-[10px] text-muted-foreground leading-snug max-w-[180px] mx-auto mt-1">
          Mission operations command. All module intelligence converges here.
        </div>
      </div>

      {/* Decorative corner marks */}
      <CornerMarks />
    </Link>
  );
}

function CornerMarks() {
  const cls = "absolute w-3 h-3 border-primary/30 group-hover:border-primary/55 transition-colors";
  return (
    <>
      <span className={`${cls} top-2 left-2 border-t-2 border-l-2`} />
      <span className={`${cls} top-2 right-2 border-t-2 border-r-2`} />
      <span className={`${cls} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${cls} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );
}
