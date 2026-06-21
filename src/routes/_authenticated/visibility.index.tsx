import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listSatellites, listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Satellite as SatIcon, Radio, Clock, MapPin, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// Deterministic pseudo-random helper from a string seed.
function seedRand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function buildMockVisibility(satId: string, satName: string) {
  const rand = seedRand(satId + satName);
  const currentPct = 55 + Math.floor(rand() * 40); // 55-95
  const timeline = Array.from({ length: 24 }).map((_, h) => ({
    h: `${String(h).padStart(2, "0")}:00`,
    pct: Math.max(0, Math.min(100, Math.round(currentPct + (rand() - 0.5) * 35))),
  }));
  const history = Array.from({ length: 14 }).map((_, d) => ({
    d: `D-${13 - d}`,
    pct: Math.max(20, Math.min(100, Math.round(currentPct + (rand() - 0.5) * 25))),
  }));
  const stations = ["Site Alpha", "Site Bravo", "Site Charlie", "Site Delta"];
  const passes = Array.from({ length: 5 }).map((_, i) => {
    const minsFromNow = Math.round(20 + rand() * 600);
    const dur = 4 + Math.round(rand() * 8);
    return {
      idx: i + 1,
      start: new Date(Date.now() + minsFromNow * 60000).toISOString().slice(11, 16) + "Z",
      duration: `${dur} min`,
      max_el: `${30 + Math.round(rand() * 60)}°`,
      station: stations[Math.floor(rand() * stations.length)],
    };
  });
  const access = stations.map((s) => ({
    station: s,
    aos: new Date(Date.now() + rand() * 4 * 3600 * 1000).toISOString().slice(11, 16) + "Z",
    los: new Date(Date.now() + (4 + rand() * 4) * 3600 * 1000).toISOString().slice(11, 16) + "Z",
    coverage: `${50 + Math.round(rand() * 40)}%`,
  }));
  return { currentPct, timeline, history, passes, access };
}

export const Route = createFileRoute("/_authenticated/visibility/")({
  component: VisibilityList,
});

function VisibilityList() {
  const [q, setQ] = useState("");
  const [activeSatId, setActiveSatId] = useState<string | null>(null);

  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const { data: beams = [] } = useQuery({
    queryKey: ["beams"],
    queryFn: async () => (await supabase.from("beams").select("*")).data ?? [],
  });
  const { data: ubv = [] } = useQuery({
    queryKey: ["ubv"],
    queryFn: async () => (await supabase.from("unit_beam_visibility").select("*").eq("visible", true)).data ?? [],
  });

  const filtered = useMemo(
    () =>
      sats.filter((s) =>
        !q ||
        s.name.toLowerCase().includes(q.toLowerCase()) ||
        String(s.orbital_position).includes(q),
      ),
    [sats, q],
  );

  const beamsBySat = useMemo(() => {
    const m: Record<string, any[]> = {};
    beams.forEach((b: any) => {
      (m[b.satellite_id] ??= []).push(b);
    });
    return m;
  }, [beams]);

  const visByBeam = useMemo(() => {
    const m: Record<string, string[]> = {};
    ubv.forEach((v: any) => {
      (m[v.beam_id] ??= []).push(v.unit_id);
    });
    return m;
  }, [ubv]);

  const activeSat = sats.find((s) => s.id === activeSatId) ?? null;
  const activeBeams = activeSat ? beamsBySat[activeSat.id] ?? [] : [];
  const mock = useMemo(
    () => (activeSat ? buildMockVisibility(activeSat.id, activeSat.name) : null),
    [activeSat],
  );

  // Build unit -> [{ band, beam }] for the active satellite
  const unitBreakdown = useMemo(() => {
    if (!activeSat) return [] as { unit: any; entries: any[] }[];
    return units
      .map((u) => {
        const entries = activeBeams
          .filter((b: any) => (visByBeam[b.id] ?? []).includes(u.id))
          .sort((a: any, b: any) => `${a.band}${a.name}`.localeCompare(`${b.band}${b.name}`));
        return { unit: u, entries };
      })
      .filter((x) => x.entries.length > 0);
  }, [activeSat, activeBeams, visByBeam, units]);

  return (
    <AppShell title="Satellite Visibility Metrics" subtitle="Module 02 // Constellation Catalogue">
      <div className="panel p-3 mb-3">
        <div className="relative max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search satellite or orbital position"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-7 mono"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty title="No satellites registered" hint="Add satellites from Administration → Satellites." />
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s: any) => {
            const bands: string[] =
              (Array.isArray(s.frequency_bands) && s.frequency_bands.length > 0
                ? s.frequency_bands
                : Array.from(new Set((beamsBySat[s.id] ?? []).map((b: any) => b.band)))) ?? [];
            const beamCount = (beamsBySat[s.id] ?? []).length;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSatId(s.id)}
                className="tile text-left h-full focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <div className="label-eyebrow flex items-center gap-1">
                  <SatIcon className="h-3 w-3" /> Satellite
                </div>
                <div className="mono text-base font-bold uppercase tracking-tight mt-1">{s.name}</div>
                <dl className="grid grid-cols-2 gap-y-1 gap-x-3 mt-3 text-[11px] mono">
                  <dt className="text-muted-foreground">Orbit</dt>
                  <dd className="text-right">{Number(s.orbital_position).toFixed(1)}°E</dd>
                  <dt className="text-muted-foreground">Launched</dt>
                  <dd className="text-right">{s.launch_date ?? "—"}</dd>
                  <dt className="text-muted-foreground">Transponders</dt>
                  <dd className="text-right">{s.transponder_count ?? "—"}</dd>
                  <dt className="text-muted-foreground">Beams</dt>
                  <dd className="text-right">{beamCount}</dd>
                </dl>
                <div className="flex flex-wrap gap-1 mt-3">
                  {bands.length === 0 ? (
                    <span className="text-[10px] mono text-muted-foreground">No bands defined</span>
                  ) : (
                    bands.map((b) => (
                      <span
                        key={b}
                        className="text-[10px] mono uppercase border border-border bg-secondary/60 px-1.5 py-0.5 rounded-sm"
                      >
                        {b}
                      </span>
                    ))
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!activeSat} onOpenChange={(o) => !o && setActiveSatId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2">
              <SatIcon className="h-4 w-4 text-primary" /> {activeSat?.name} — Visibility
            </DialogTitle>
          </DialogHeader>
          {activeSat && mock && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] mono">
                <Info label="Orbit" value={`${Number(activeSat.orbital_position).toFixed(2)}°E`} />
                <Info label="Launched" value={activeSat.launch_date ?? "—"} />
                <Info label="Transponders" value={String(activeSat.transponder_count ?? "—")} />
                <Info label="Current Visibility" value={`${mock.currentPct}%`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="panel p-3">
                  <div className="label-eyebrow flex items-center gap-1 mb-1"><Clock className="h-3 w-3" /> 24h Visibility Timeline</div>
                  <div style={{ width: "100%", height: 160 }}>
                    <ResponsiveContainer>
                      <AreaChart data={mock.timeline}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="h" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" interval={3} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                        <Area type="monotone" dataKey="pct" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.25)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="panel p-3">
                  <div className="label-eyebrow flex items-center gap-1 mb-1"><TrendingUp className="h-3 w-3" /> 14-Day Historical Trend</div>
                  <div style={{ width: "100%", height: 160 }}>
                    <ResponsiveContainer>
                      <LineChart data={mock.history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="d" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                        <Line type="monotone" dataKey="pct" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="panel p-3">
                  <div className="label-eyebrow flex items-center gap-1 mb-2"><Clock className="h-3 w-3" /> Upcoming Passes</div>
                  <table className="w-full text-[11px] mono">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-left">#</th><th className="text-left">Start</th><th className="text-left">Dur</th><th className="text-left">Max El</th><th className="text-left">Station</th></tr>
                    </thead>
                    <tbody>
                      {mock.passes.map((p) => (
                        <tr key={p.idx} className="border-t border-border">
                          <td className="py-1">{p.idx}</td><td>{p.start}</td><td>{p.duration}</td><td>{p.max_el}</td><td>{p.station}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel p-3">
                  <div className="label-eyebrow flex items-center gap-1 mb-2"><MapPin className="h-3 w-3" /> Ground-Station Access Window</div>
                  <table className="w-full text-[11px] mono">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-left">Station</th><th className="text-left">AOS</th><th className="text-left">LOS</th><th className="text-left">Cov</th></tr>
                    </thead>
                    <tbody>
                      {mock.access.map((a) => (
                        <tr key={a.station} className="border-t border-border">
                          <td className="py-1">{a.station}</td><td>{a.aos}</td><td>{a.los}</td><td className="text-primary">{a.coverage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {unitBreakdown.length === 0 ? (
                <Empty title="No unit visibility data" hint="Add beams and unit-beam visibility entries." />
              ) : (
                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {unitBreakdown.map(({ unit, entries }) => (
                    <div key={unit.id} className="panel p-3">
                      <div className="flex items-center justify-between">
                        <div className="mono text-sm font-bold uppercase">{unit.code}</div>
                        <div className="text-[11px] mono text-muted-foreground">{entries.length} beam(s)</div>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {entries.map((b: any) => (
                          <li key={b.id} className="flex items-center gap-2 text-[12px] mono">
                            <Radio className="h-3 w-3 text-primary" />
                            <span className="uppercase text-muted-foreground w-12">{b.band}</span>
                            <span className="text-foreground">{b.name}</span>
                            {b.beam_type && <span className="text-muted-foreground">· {b.beam_type}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-2 py-1.5">
      <div className="label-eyebrow">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}