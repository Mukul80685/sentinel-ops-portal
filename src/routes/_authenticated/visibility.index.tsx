import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Clock,
  Compass,
  Globe,
  ImageIcon,
  Map,
  MapPin,
  Plus,
  Radio,
  Satellite as SatIcon,
  TrendingUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AreaChart,
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { listUnits } from "@/lib/queries";

// ─── Static GEO satellite data by region ──────────────────────────────────────

interface GeoSatellite {
  id: string;
  name: string;
  orbitType?: string;              // GEO | LEO | MEO (existing sats default to "GEO")
  position: string;
  launchDate: string;
  transponders: string;            // display string e.g. "38 C/Ku-band"
  cBandTransponders?: string;      // independent C-band entry
  kuBandTransponders?: string;     // independent Ku-band entry
  beamCoverage: string;
  beamCoverageImageUrl?: string;   // data URL for user-uploaded coverage map
}

interface Region {
  id: string;
  label: string;
  flagCode?: string;    // ISO 3166-1 alpha-2 ("cn", "us") or "eu" → rendered via flagcdn.com
  emoji?: string;       // fallback globe/symbol emoji for multi-country regions
  satellites: GeoSatellite[];
}

const GEO_REGIONS: Region[] = [
  {
    id: "china",
    label: "China",
    flagCode: "cn",
    satellites: [
      { id: "cn-1", name: "ChinaSat 6B",   position: "105.5°E", launchDate: "2007-07-05", transponders: "38 C/Ku-band",    beamCoverage: "Asia / Pacific" },
      { id: "cn-2", name: "ChinaSat 9",    position: "92.2°E",  launchDate: "2008-06-09", transponders: "22 Ku-band",      beamCoverage: "China (DTH)" },
      { id: "cn-3", name: "ChinaSat 10",   position: "110.5°E", launchDate: "2011-06-21", transponders: "30 Ku/C-band",    beamCoverage: "Asia / Pacific" },
      { id: "cn-4", name: "ChinaSat 12",   position: "87.5°E",  launchDate: "2012-05-26", transponders: "32 C/Ku-band",    beamCoverage: "Asia / Indian Ocean" },
      { id: "cn-5", name: "ChinaSat 15",   position: "101.4°E", launchDate: "2011-03-05", transponders: "22 Ku-band",      beamCoverage: "China / SE Asia" },
      { id: "cn-6", name: "AsiaSat 5",     position: "100.5°E", launchDate: "2009-08-11", transponders: "26 C/Ku-band",    beamCoverage: "Asia / Pacific / Middle East" },
      { id: "cn-7", name: "AsiaSat 7",     position: "105.5°E", launchDate: "2011-11-21", transponders: "28 C/Ku-band",    beamCoverage: "Asia / Middle East" },
      { id: "cn-8", name: "Apstar 6",      position: "134.0°E", launchDate: "2005-04-12", transponders: "24 C/Ku-band",    beamCoverage: "Asia / Pacific" },
      { id: "cn-9", name: "Apstar 9",      position: "142.0°E", launchDate: "2015-10-17", transponders: "28 C/Ku-band",    beamCoverage: "Asia / Pacific" },
    ],
  },
  {
    id: "pakistan",
    label: "Pakistan",
    flagCode: "pk",
    satellites: [
      { id: "pk-1", name: "PAKSAT-1R",   position: "38.0°E",  launchDate: "2011-08-12", transponders: "30 C/Ku-band",    beamCoverage: "South Asia / Middle East / Africa" },
      { id: "pk-2", name: "PAKSAT MM1",  position: "42.0°E",  launchDate: "2023-01-10", transponders: "14 Ku/Ka-band",   beamCoverage: "South Asia / Middle East" },
    ],
  },
  {
    id: "turkey",
    label: "Turkey",
    flagCode: "tr",
    satellites: [
      { id: "tr-1", name: "Turksat 3A",  position: "42.0°E",  launchDate: "2008-06-12", transponders: "32 Ku/Ka-band",   beamCoverage: "Turkey / Europe / Middle East" },
      { id: "tr-2", name: "Turksat 4A",  position: "42.0°E",  launchDate: "2014-02-14", transponders: "34 Ku/Ka-band",   beamCoverage: "Turkey / Europe / Asia" },
      { id: "tr-3", name: "Turksat 4B",  position: "50.0°E",  launchDate: "2015-10-16", transponders: "32 Ku/Ka-band",   beamCoverage: "Asia / Middle East / Africa" },
      { id: "tr-4", name: "Turksat 5A",  position: "31.3°E",  launchDate: "2021-01-08", transponders: "36 Ku/Ka-band",   beamCoverage: "Europe / Middle East / Africa" },
    ],
  },
  {
    id: "bangladesh",
    label: "Bangladesh",
    flagCode: "bd",
    satellites: [
      { id: "bd-1", name: "Bangabandhu-1", position: "119.1°E", launchDate: "2018-05-12", transponders: "40 C/Ku-band",   beamCoverage: "South Asia / SE Asia" },
    ],
  },
  {
    id: "sea",
    label: "Southeast Asia",
    emoji: "🌏",
    satellites: [
      { id: "sea-1", name: "Measat-3a",  position: "91.5°E",  launchDate: "2009-06-21", transponders: "24 C/Ku-band",    beamCoverage: "Asia / Indian Ocean" },
      { id: "sea-2", name: "Thaicom 6",  position: "78.5°E",  launchDate: "2014-01-07", transponders: "28 C/Ku-band",    beamCoverage: "Asia / Pacific" },
      { id: "sea-3", name: "Thaicom 8",  position: "78.5°E",  launchDate: "2016-05-27", transponders: "24 Ku/Ka-band",   beamCoverage: "SE Asia / Indian Ocean" },
      { id: "sea-4", name: "Telkom-3S",  position: "118.0°E", launchDate: "2017-02-14", transponders: "42 C/Ku/Ka-band", beamCoverage: "SE Asia / Pacific" },
      { id: "sea-5", name: "PSN VI",     position: "146.0°E", launchDate: "2020-11-22", transponders: "32 C/Ku-band",    beamCoverage: "Indonesia / Pacific" },
    ],
  },
  {
    id: "middle-east",
    label: "Middle East",
    emoji: "🌐",
    satellites: [
      { id: "me-1", name: "Arabsat 5C",   position: "20.0°E",  launchDate: "2010-08-04", transponders: "36 C/Ku-band",    beamCoverage: "Middle East / Africa / Europe" },
      { id: "me-2", name: "Arabsat 6A",   position: "26.0°E",  launchDate: "2019-04-11", transponders: "60 C/Ku/Ka-band", beamCoverage: "Middle East / Africa" },
      { id: "me-3", name: "Nilesat 201",  position: "7.0°W",   launchDate: "2010-08-04", transponders: "44 Ku-band",      beamCoverage: "Middle East / North Africa" },
      { id: "me-4", name: "Es'hailSat 1", position: "25.5°E",  launchDate: "2013-08-27", transponders: "24 Ku-band",      beamCoverage: "Qatar / Middle East" },
      { id: "me-5", name: "Es'hailSat 2", position: "25.5°E",  launchDate: "2018-11-15", transponders: "26 Ku/Ka-band",   beamCoverage: "Middle East / Africa" },
    ],
  },
  {
    id: "europe",
    label: "Europe",
    flagCode: "eu",
    satellites: [
      { id: "eu-1", name: "Astra 1M",      position: "19.2°E",  launchDate: "2008-11-05", transponders: "32 Ku-band",      beamCoverage: "Europe / Middle East" },
      { id: "eu-2", name: "Astra 2E",      position: "28.2°E",  launchDate: "2012-09-29", transponders: "60 Ku/Ka-band",   beamCoverage: "Europe" },
      { id: "eu-3", name: "Eutelsat 33E",  position: "33.0°E",  launchDate: "2012-09-28", transponders: "40 Ku-band",      beamCoverage: "Europe / Middle East / Africa" },
      { id: "eu-4", name: "Hotbird 13C",   position: "13.0°E",  launchDate: "2012-06-23", transponders: "64 Ku-band",      beamCoverage: "Europe / N. Africa / Middle East" },
      { id: "eu-5", name: "Eutelsat 7A",   position: "7.0°E",   launchDate: "2011-09-22", transponders: "38 Ku-band",      beamCoverage: "Europe / Middle East / Africa" },
      { id: "eu-6", name: "SES-12",        position: "95.0°E",  launchDate: "2018-06-04", transponders: "54 Ku/Ka-band",   beamCoverage: "Asia / Middle East / Pacific" },
    ],
  },
  {
    id: "africa",
    label: "Africa",
    emoji: "🌍",
    satellites: [
      { id: "af-1", name: "Intelsat 20",   position: "68.5°E",  launchDate: "2012-08-02", transponders: "60 C/Ku-band",    beamCoverage: "Africa / Middle East / Indian Ocean" },
      { id: "af-2", name: "AMOS-17",       position: "17.0°E",  launchDate: "2019-08-06", transponders: "55 Ka-band",      beamCoverage: "Africa" },
      { id: "af-3", name: "Eutelsat 16A",  position: "16.0°E",  launchDate: "2011-04-20", transponders: "40 Ku-band",      beamCoverage: "Africa / Europe" },
      { id: "af-4", name: "Intelsat 33e",  position: "60.0°E",  launchDate: "2016-08-26", transponders: "56 C/Ku/Ka-band", beamCoverage: "Africa / Asia / Middle East" },
    ],
  },
  {
    id: "russia",
    label: "Russia",
    flagCode: "ru",
    satellites: [
      { id: "ru-1", name: "Express-AM5",  position: "140.0°E", launchDate: "2014-12-26", transponders: "42 Ku/Ka-band", beamCoverage: "Russia / Asia" },
      { id: "ru-2", name: "Express-AM6",  position: "53.0°E",  launchDate: "2014-10-21", transponders: "64 C/Ku-band",  beamCoverage: "Russia / Middle East / Africa" },
      { id: "ru-3", name: "Express-AT1",  position: "56.0°E",  launchDate: "2014-03-17", transponders: "32 Ku-band",    beamCoverage: "Russia / CIS" },
      { id: "ru-4", name: "Yamal-402",    position: "55.0°E",  launchDate: "2012-12-08", transponders: "46 Ku-band",    beamCoverage: "Russia / Central Asia" },
    ],
  },
  {
    id: "usa",
    label: "USA",
    flagCode: "us",
    satellites: [
      { id: "us-1", name: "AMC-21",        position: "125.0°W", launchDate: "2008-08-14", transponders: "24 Ku/Ka-band",   beamCoverage: "North America" },
      { id: "us-2", name: "AMC-18",        position: "105.0°W", launchDate: "2006-12-16", transponders: "24 C-band",       beamCoverage: "North America" },
      { id: "us-3", name: "Intelsat 34",   position: "55.5°W",  launchDate: "2015-08-27", transponders: "64 C/Ku-band",    beamCoverage: "Americas / Atlantic" },
      { id: "us-4", name: "Intelsat 35e",  position: "34.5°W",  launchDate: "2017-07-02", transponders: "60 C/Ku/Ka-band", beamCoverage: "Americas / Africa / Europe" },
      { id: "us-5", name: "SES-14",        position: "47.5°W",  launchDate: "2018-01-25", transponders: "40 C/Ku/Ka-band", beamCoverage: "Americas / Atlantic" },
      { id: "us-6", name: "Galaxy 30",     position: "125.0°W", launchDate: "2020-08-15", transponders: "24 C-band",       beamCoverage: "North America / Pacific" },
    ],
  },
];

// ─── Mock visibility data generator ───────────────────────────────────────────

function seedRand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function buildMockVisibility(satId: string, satName: string) {
  const rand = seedRand(satId + satName);
  const currentPct = 55 + Math.floor(rand() * 40);
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

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/visibility/")({
  component: VisibilityPage,
});

// ─── Main page component ───────────────────────────────────────────────────────

function VisibilityPage() {
  // activeRegionId stores just the ID so merges stay live when satellites are added
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [activeSat, setActiveSat]  = useState<GeoSatellite | null>(null);

  // User-added satellites keyed by region.id — merged with static data at render time
  const [addedSats, setAddedSats] = useState<Record<string, GeoSatellite[]>>({});

  function handleAddSat(regionId: string, sat: GeoSatellite) {
    setAddedSats((prev) => ({
      ...prev,
      [regionId]: [...(prev[regionId] ?? []), sat],
    }));
  }

  // Merge static + user-added satellites for every region
  const mergedRegions = useMemo(
    () =>
      GEO_REGIONS.map((r) => ({
        ...r,
        satellites: [...r.satellites, ...(addedSats[r.id] ?? [])],
      })),
    [addedSats],
  );

  const activeRegion = useMemo(
    () => mergedRegions.find((r) => r.id === activeRegionId) ?? null,
    [mergedRegions, activeRegionId],
  );

  // Unit-beam visibility data (used inside satellite detail modal)
  const { data: beams = [] } = useQuery({
    queryKey: ["beams"],
    queryFn: async () => (await supabase.from("beams").select("*")).data ?? [],
  });
  const { data: ubv = [] } = useQuery({
    queryKey: ["ubv"],
    queryFn: async () =>
      (await supabase.from("unit_beam_visibility").select("*").eq("visible", true)).data ?? [],
  });
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const beamsBySatName = useMemo(() => {
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

  const mock = useMemo(
    () => (activeSat ? buildMockVisibility(activeSat.id, activeSat.name) : null),
    [activeSat],
  );

  return (
    <AppShell
      title="Satellite Visibility Metrics"
      subtitle="Target Country Satellites"
      headerIcon={<SatIcon className="h-4 w-4 shrink-0" />}
    >
      {!activeRegion ? (
        <RegionGrid regions={mergedRegions} onSelect={(r) => setActiveRegionId(r.id)} />
      ) : (
        <RegionDetail
          region={activeRegion}
          onBack={() => setActiveRegionId(null)}
          onSelectSat={setActiveSat}
          onAddSat={(sat) => handleAddSat(activeRegion.id, sat)}
        />
      )}

      {/* Satellite detail modal */}
      <Dialog open={!!activeSat} onOpenChange={(o) => !o && setActiveSat(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2">
              <SatIcon className="h-4 w-4 text-primary" />
              {activeSat?.name} — Visibility
            </DialogTitle>
          </DialogHeader>

          {activeSat && mock && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] mono">
                <InfoTile label="Orbit Type"    value="GEO" />
                <InfoTile label="Position"      value={activeSat.position} />
                <InfoTile label="Launched"      value={activeSat.launchDate} />
                <InfoTile label="Visibility"    value={`${mock.currentPct}%`} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-2 gap-2 text-[11px] mono">
                <InfoTile label="Transponders"  value={activeSat.transponders} />
                <InfoTile label="Beam Coverage" value={activeSat.beamCoverage} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="panel p-3">
                  <div className="label-eyebrow flex items-center gap-1 mb-1">
                    <Clock className="h-3 w-3" /> 24h Visibility Timeline
                  </div>
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
                  <div className="label-eyebrow flex items-center gap-1 mb-1">
                    <TrendingUp className="h-3 w-3" /> 14-Day Historical Trend
                  </div>
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
                  <div className="label-eyebrow flex items-center gap-1 mb-2">
                    <Clock className="h-3 w-3" /> Upcoming Passes
                  </div>
                  <table className="w-full text-[11px] mono">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left">#</th>
                        <th className="text-left">Start</th>
                        <th className="text-left">Dur</th>
                        <th className="text-left">Max El</th>
                        <th className="text-left">Station</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mock.passes.map((p) => (
                        <tr key={p.idx} className="border-t border-border">
                          <td className="py-1">{p.idx}</td>
                          <td>{p.start}</td>
                          <td>{p.duration}</td>
                          <td>{p.max_el}</td>
                          <td>{p.station}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel p-3">
                  <div className="label-eyebrow flex items-center gap-1 mb-2">
                    <MapPin className="h-3 w-3" /> Ground-Station Access Window
                  </div>
                  <table className="w-full text-[11px] mono">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left">Station</th>
                        <th className="text-left">AOS</th>
                        <th className="text-left">LOS</th>
                        <th className="text-left">Cov</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mock.access.map((a) => (
                        <tr key={a.station} className="border-t border-border">
                          <td className="py-1">{a.station}</td>
                          <td>{a.aos}</td>
                          <td>{a.los}</td>
                          <td className="text-primary">{a.coverage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Unit-beam visibility (live from DB if available) */}
              {units.length > 0 && (
                <div className="space-y-2">
                  <div className="label-eyebrow flex items-center gap-1">
                    <Radio className="h-3 w-3" /> Unit Beam Visibility
                  </div>
                  {units
                    .map((u) => {
                      const unitBeams = Object.values(beamsBySatName)
                        .flat()
                        .filter((b: any) => (visByBeam[b.id] ?? []).includes(u.id));
                      return { unit: u, beams: unitBeams };
                    })
                    .filter((x) => x.beams.length > 0)
                    .map(({ unit, beams: ub }) => (
                      <div key={unit.id} className="panel p-3">
                        <div className="flex items-center justify-between">
                          <div className="mono text-sm font-bold uppercase">{unit.code}</div>
                          <div className="text-[11px] mono text-muted-foreground">{ub.length} beam(s)</div>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {ub.map((b: any) => (
                            <li key={b.id} className="flex items-center gap-2 text-[12px] mono">
                              <Radio className="h-3 w-3 text-primary" />
                              <span className="uppercase text-muted-foreground w-12">{b.band}</span>
                              <span className="text-foreground">{b.name}</span>
                              {b.beam_type && (
                                <span className="text-muted-foreground">· {b.beam_type}</span>
                              )}
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

// ─── Region icon fallbacks for multi-country regions ─────────────────────────
const REGION_ICON: Record<string, React.ReactNode> = {
  "sea":         <Map     className="h-9 w-9 text-muted-foreground" />,
  "middle-east": <Compass className="h-9 w-9 text-muted-foreground" />,
  "africa":      <Globe   className="h-9 w-9 text-muted-foreground" />,
};

// ─── Region grid — icon-driven country/region selection ───────────────────────

function RegionGrid({ regions, onSelect }: { regions: Region[]; onSelect: (r: Region) => void }) {
  const totalSats = regions.reduce((sum, r) => sum + r.satellites.length, 0);

  return (
    <div className="space-y-6">
      {/* Country / region tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {regions.map((region) => (
          <button
            key={region.id}
            type="button"
            onClick={() => onSelect(region)}
            className="panel flex flex-col items-center justify-center gap-3 py-7 px-3 min-h-[130px] hover:bg-secondary/60 focus:outline-none focus:ring-1 focus:ring-primary transition-colors group"
          >
            {region.flagCode ? (
              <img
                src={`https://flagcdn.com/w40/${region.flagCode}.png`}
                srcSet={`https://flagcdn.com/w80/${region.flagCode}.png 2x`}
                alt={region.label}
                className="w-14 h-9 object-cover rounded-sm border border-border"
                loading="lazy"
              />
            ) : region.emoji ? (
              <span className="text-4xl leading-none select-none" role="img" aria-label={region.label}>
                {region.emoji}
              </span>
            ) : (
              REGION_ICON[region.id] ?? <Globe className="h-9 w-9 text-muted-foreground" />
            )}
            <span className="mono text-[11px] font-bold uppercase tracking-widest text-center leading-tight">
              {region.label}
            </span>
          </button>
        ))}
      </div>

      {/* Total KPI — centered summary block */}
      <div className="border-t border-border pt-5 flex flex-col items-center gap-1.5">
        <div className="label-eyebrow tracking-[0.2em]">Total Target Country Satellites</div>
        <div className="mono text-4xl font-bold text-foreground tabular-nums">{totalSats}</div>
      </div>
    </div>
  );
}

// ─── Region detail (satellite list) ───────────────────────────────────────────

function RegionDetail({
  region,
  onBack,
  onSelectSat,
  onAddSat,
}: {
  region: Region;
  onBack: () => void;
  onSelectSat: (s: GeoSatellite) => void;
  onAddSat: (sat: GeoSatellite) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Header row: Back + breadcrumb (left) | Add New Satellite (right) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="mono text-[11px] h-8 uppercase tracking-wider"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> All Regions
          </Button>
          <div className="flex items-center gap-1.5 text-[12px] mono text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            <span>Target Satellites</span>
            <span>/</span>
            <span className="text-foreground font-bold uppercase">{region.label}</span>
          </div>
        </div>

        {/* Green primary action — always visible for every region */}
        <AddSatelliteDialog regionId={region.id} onAdd={onAddSat} />
      </div>

      <div className="label-eyebrow flex items-center gap-1.5">
        <SatIcon className="h-3 w-3" />
        {region.label} — Satellite Assets ({region.satellites.length})
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {region.satellites.map((sat) => (
          <SatelliteTile key={sat.id} sat={sat} onSelect={onSelectSat} />
        ))}
      </div>
    </div>
  );
}

// ─── Individual satellite tile ─────────────────────────────────────────────────

function SatelliteTile({
  sat,
  onSelect,
}: {
  sat: GeoSatellite;
  onSelect: (s: GeoSatellite) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(sat)}
      className="tile text-left focus:outline-none focus:ring-1 focus:ring-primary hover:bg-secondary/60 transition-colors"
    >
      <div className="label-eyebrow flex items-center gap-1">
        <SatIcon className="h-3 w-3" /> {sat.orbitType ?? "GEO"} Satellite
      </div>
      <div className="mono text-sm font-bold uppercase tracking-tight mt-1">{sat.name}</div>

      {sat.beamCoverageImageUrl && (
        <img
          src={sat.beamCoverageImageUrl}
          alt="Beam coverage"
          className="w-full h-20 object-cover rounded-sm border border-border mt-2"
        />
      )}

      <dl className="grid grid-cols-2 gap-y-1 gap-x-3 mt-3 text-[11px] mono">
        <dt className="text-muted-foreground">Position</dt>
        <dd className="text-right">{sat.position}</dd>

        <dt className="text-muted-foreground">Launched</dt>
        <dd className="text-right">{sat.launchDate}</dd>

        <dt className="text-muted-foreground">Transponders</dt>
        <dd className="text-right">{sat.transponders}</dd>

        <dt className="text-muted-foreground">Beam Coverage</dt>
        <dd className="text-right text-[10px] leading-tight">{sat.beamCoverage}</dd>
      </dl>

      <div className="mt-3 flex gap-1">
        <span className="text-[10px] mono uppercase border border-border bg-secondary/60 px-1.5 py-0.5 rounded-sm">
          {sat.orbitType ?? "GEO"}
        </span>
        <span className="text-[10px] mono text-muted-foreground px-1.5 py-0.5">
          View visibility →
        </span>
      </div>
    </button>
  );
}

// ─── Add Satellite dialog ──────────────────────────────────────────────────────

const ORBIT_TYPES = ["GEO", "LEO", "MEO"] as const;

const EMPTY_SAT_FORM = {
  orbitType: "GEO",
  name: "",
  position: "",
  launchDate: "",
  cBand: "",
  kuBand: "",
  beamCoverage: "",
};

function AddSatelliteDialog({
  regionId,
  onAdd,
}: {
  regionId: string;
  onAdd: (sat: GeoSatellite) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_SAT_FORM);
  const [coverageFile, setCoverageFile] = useState<File | null>(null);
  const [coveragePreview, setCoveragePreview] = useState<string>("");

  function handleImageFile(file: File) {
    setCoverageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setCoveragePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function reset() {
    setForm(EMPTY_SAT_FORM);
    setCoverageFile(null);
    setCoveragePreview("");
  }

  function buildTranspondersLabel() {
    const parts: string[] = [];
    if (form.cBand.trim()) parts.push(`${form.cBand.trim()} C-band`);
    if (form.kuBand.trim()) parts.push(`${form.kuBand.trim()} Ku-band`);
    return parts.length > 0 ? parts.join(" / ") : "—";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    const sat: GeoSatellite = {
      id: `${regionId}-custom-${Date.now()}`,
      name: form.name.trim(),
      orbitType: form.orbitType,
      position: form.position.trim() || "—",
      launchDate: form.launchDate || "—",
      transponders: buildTranspondersLabel(),
      cBandTransponders: form.cBand.trim() || undefined,
      kuBandTransponders: form.kuBand.trim() || undefined,
      beamCoverage: form.beamCoverage.trim() || "—",
      beamCoverageImageUrl: coveragePreview || undefined,
    };
    onAdd(sat);
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="h-8 mono text-[11px] uppercase tracking-wider bg-emerald-700 hover:bg-emerald-600 text-white border-0"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add New Satellite
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider">Add New Satellite</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Orbit Type */}
          <SatField label="Orbit Type *">
            <Select
              value={form.orbitType}
              onValueChange={(v) => setForm({ ...form, orbitType: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORBIT_TYPES.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SatField>

          {/* Satellite Name */}
          <SatField label="Satellite Name *">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. ChinaSat 6C"
            />
          </SatField>

          {/* Position + Launch Date side by side */}
          <div className="grid grid-cols-2 gap-3">
            <SatField label="Position / Orbital Slot">
              <Input
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="e.g. 105.5°E"
              />
            </SatField>
            <SatField label="Launch Date">
              <Input
                type="date"
                value={form.launchDate}
                onChange={(e) => setForm({ ...form, launchDate: e.target.value })}
              />
            </SatField>
          </div>

          {/* Transponders — independent C and Ku fields */}
          <div className="space-y-2">
            <div className="label-eyebrow">Transponders</div>
            <div className="grid grid-cols-2 gap-3">
              <SatField label="C-band">
                <Input
                  value={form.cBand}
                  onChange={(e) => setForm({ ...form, cBand: e.target.value })}
                  placeholder="e.g. 24"
                />
              </SatField>
              <SatField label="Ku-band">
                <Input
                  value={form.kuBand}
                  onChange={(e) => setForm({ ...form, kuBand: e.target.value })}
                  placeholder="e.g. 16"
                />
              </SatField>
            </div>
          </div>

          {/* Beam Coverage text */}
          <SatField label="Beam Coverage">
            <Input
              value={form.beamCoverage}
              onChange={(e) => setForm({ ...form, beamCoverage: e.target.value })}
              placeholder="e.g. Asia / Pacific"
            />
          </SatField>

          {/* Beam Coverage Image upload */}
          <SatField label="Beam Coverage Map (optional)">
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-sm cursor-pointer hover:border-primary transition-colors bg-secondary/30">
              {coveragePreview ? (
                <img
                  src={coveragePreview}
                  alt="Coverage preview"
                  className="h-full w-full object-contain rounded-sm"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                  <span className="mono text-[11px]">JPG / JPEG / PNG</span>
                </div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
              />
            </label>
            {coverageFile && (
              <p className="mono text-[11px] text-muted-foreground mt-1">{coverageFile.name}</p>
            )}
          </SatField>

          <Button
            type="submit"
            disabled={!form.name.trim()}
            className="w-full mono uppercase tracking-wider bg-emerald-700 hover:bg-emerald-600 text-white border-0"
          >
            Add Satellite
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SatField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="label-eyebrow">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ─── Info tile helper ──────────────────────────────────────────────────────────

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-2 py-1.5">
      <div className="label-eyebrow">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
