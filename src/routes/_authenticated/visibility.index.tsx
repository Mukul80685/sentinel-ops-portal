import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Download,
  Filter,
  Globe,
  ImageIcon,
  Map,
  MapPin,
  Pencil,
  Plus,
  Radio,
  Satellite as SatIcon,
  Settings2,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { validateImportFile, buildCsv, downloadCsv, toggleSelection, allSelected } from "@/lib/dataTableUtils";
import { toast } from "sonner";
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

// ─── Static unit roster for visibility layer ─────────────────────────────────

interface VisibilityUnit {
  id: string;
  code: string;
  name: string;
  location: string;
}

const VISIBILITY_UNITS: VisibilityUnit[] = [
  { id: "alpha",   code: "A", name: "Unit Alpha",   location: "Northern Sector" },
  { id: "bravo",   code: "B", name: "Unit Bravo",   location: "Eastern Sector" },
  { id: "charlie", code: "C", name: "Unit Charlie", location: "Western Sector" },
  { id: "delta",   code: "D", name: "Unit Delta",   location: "Southern Sector" },
  { id: "echo",    code: "E", name: "Unit Echo",    location: "Central Sector" },
  { id: "foxtrot", code: "F", name: "Unit Foxtrot", location: "Forward Sector" },
  { id: "golf",    code: "G", name: "Unit Golf",    location: "Rear Sector" },
  { id: "hotel",   code: "H", name: "Unit Hotel",   location: "Coastal Sector" },
];

// ─── Static GEO satellite data by region ──────────────────────────────────────

interface GeoSatellite {
  id: string;
  name: string;
  orbitType?: string;              // GEO | LEO | MEO
  position: string;
  launchDate: string;
  transponders: string;            // display string e.g. "38 C/Ku-band"
  cBandTransponders?: string;
  kuBandTransponders?: string;
  beamCoverage: string;
  beamCoverageImageUrl?: string;   // legacy upload field
  beams?: string[];                // beam breakdown e.g. ["8 Ku Spot Beams","6 Regional Beams"]
  footprintImageUrl?: string;      // primary footprint/coverage image
  visibilityNotes?: string;        // free-text notes about unit visibility
  beamEirp?: Record<string, number>; // beam_name → EIRP value in dBW (user-entered or auto-generated)
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

// ─── Standardized beam pool — format: "Band Type – Beam NN" ──────────────────
// Each entry is a complete, display-ready label in professional format.

const REGION_BEAMS: Record<string, string[]> = {
  "china": [
    "Ku Regional – Beam 08",
    "Ku Spot – Beam 11",
    "C-band Wide Beam",
    "Ka Spot – Beam 04",
    "Ku Regional – Beam 13",
  ],
  "pakistan": [
    "Ku Regional – Beam 05",
    "C-band Wide Beam",
    "Ka Spot – Beam 02",
    "Ku Spot – Beam 09",
  ],
  "turkey": [
    "Ku Regional – Beam 07",
    "Ka Spot – Beam 03",
    "C-band Regional Beam",
    "Ku Spot – Beam 14",
  ],
  "bangladesh": [
    "Ku Regional – Beam 06",
    "C-band Wide Beam",
    "Ka Spot – Beam 01",
    "Ku Spot – Beam 10",
  ],
  "sea": [
    "Ku Regional – Beam 09",
    "C-band Wide Beam",
    "Ka Spot – Beam 06",
    "Ku Spot – Beam 15",
    "C-band Regional Beam",
  ],
  "middle-east": [
    "Ku Regional – Beam 03",
    "Ka Spot – Beam 07",
    "C-band Wide Beam",
    "Ku Spot – Beam 12",
    "C-band Regional Beam",
  ],
  "europe": [
    "Ku Regional – Beam 10",
    "Ka Spot – Beam 05",
    "C-band Wide Beam",
    "Ku Spot – Beam 16",
  ],
  "africa": [
    "Ku Regional – Beam 02",
    "C-band Wide Beam",
    "Ka Spot – Beam 08",
    "Ku Spot – Beam 17",
  ],
  "russia": [
    "Ku Regional – Beam 04",
    "C-band Wide Beam",
    "Ka Spot – Beam 09",
    "Ku Spot – Beam 18",
  ],
  "usa": [
    "Ku Regional – Beam 01",
    "C-band Wide Beam",
    "Ka Spot – Beam 10",
    "Ku Spot – Beam 19",
  ],
};

// Deterministic beam breakdown from transponder data
function getBeamBreakdown(sat: GeoSatellite): { total: number; beams: string[] } {
  if (sat.beams && sat.beams.length > 0) {
    const total = sat.beams.reduce((n, b) => {
      const m = b.match(/^(\d+)/);
      return n + (m ? parseInt(m[1]) : 1);
    }, 0);
    return { total, beams: sat.beams };
  }
  const rand = seedRand(sat.id + "beams");
  const ku  = 4 + Math.floor(rand() * 6);
  const reg = 2 + Math.floor(rand() * 4);
  const c   = 2 + Math.floor(rand() * 3);
  return {
    total: ku + reg + c,
    beams: [`${ku} Ku Spot Beams`, `${reg} Regional Beams`, `${c} C-band Beams`],
  };
}

// Deterministic visible beams for a given unit + satellite + region combination
// Returns 1–3 standardized beam labels from the region pool.
function getVisibleBeams(unitId: string, satId: string, regionId: string): string[] {
  const pool  = REGION_BEAMS[regionId] ?? ["Ku Regional – Beam 01", "C-band Wide Beam", "Ka Spot – Beam 02"];
  const rand  = seedRand(unitId + satId);
  const count = 1 + Math.floor(rand() * Math.min(3, pool.length - 1));
  // Deterministic Fisher-Yates to pick distinct entries
  const idxs = Array.from({ length: pool.length }, (_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  return idxs.slice(0, count).map((i) => pool[i]);
}

// Deterministic EIRP lookup / generation for a single beam.
// Priority: 1) sat.beamEirp[beam]  2) per-band seeded range  3) fallback 42 dBW
function getBeamEirp(beam: string, satId: string, stored?: Record<string, number>): number {
  if (stored && stored[beam] !== undefined) return stored[beam];
  const rand = seedRand(satId + beam + "eirp");
  const bl = beam.toLowerCase();
  // Ka beams: highest EIRP (52–60)
  if (bl.includes("ka"))           return 52 + Math.floor(rand() * 9);
  // Ku Spot: high (48–57)
  if (bl.includes("ku spot") || bl.includes("ku s")) return 48 + Math.floor(rand() * 10);
  // Ku Regional / Wide: moderate (44–52)
  if (bl.includes("ku"))           return 44 + Math.floor(rand() * 9);
  // C-band: lower (38–49)
  if (bl.includes("c-band") || bl.includes("c band")) return 38 + Math.floor(rand() * 12);
  return 42 + Math.floor(rand() * 10); // fallback
}

// Parse transponder counts from a GeoSatellite into structured numbers
function parseTransponders(sat: GeoSatellite): { total: number; cBand?: string; kuBand?: string } {
  const cNum  = sat.cBandTransponders  ? (parseInt(sat.cBandTransponders)  || 0) : 0;
  const kuNum = sat.kuBandTransponders ? (parseInt(sat.kuBandTransponders) || 0) : 0;
  if (cNum || kuNum) {
    return {
      total: cNum + kuNum,
      cBand:  cNum  > 0 ? String(cNum)  : undefined,
      kuBand: kuNum > 0 ? String(kuNum) : undefined,
    };
  }
  const totalMatch = sat.transponders.match(/^(\d+)/);
  const total = totalMatch ? parseInt(totalMatch[1]) : 0;
  const tl = sat.transponders.toLowerCase();
  if (tl.includes("c") && tl.includes("ku")) {
    const half = Math.floor(total / 2);
    return { total, cBand: String(half), kuBand: String(total - half) };
  }
  if (tl.includes("ku")) return { total, kuBand: String(total) };
  if (tl.includes("c"))  return { total, cBand:  String(total) };
  return { total };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/visibility/")({
  validateSearch: (search: Record<string, unknown>) => ({
    unit: typeof search.unit === "string" ? search.unit : undefined,
    satellite: typeof search.satellite === "string" ? search.satellite : undefined,
  }),
  component: VisibilityPage,
});

// ─── Main page component ───────────────────────────────────────────────────────

function VisibilityPage() {
  const { unit: searchUnit, satellite: searchSatellite } = Route.useSearch();
  const deepLinkApplied = useRef(false);

  // Three-level hierarchy: unit → region → satellite
  const [localUnits, setLocalUnits] = useState<VisibilityUnit[]>(VISIBILITY_UNITS);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [activeSat, setActiveSat]  = useState<GeoSatellite | null>(null);

  const selectedUnit = localUnits.find((u) => u.id === selectedUnitId) ?? null;

  function handleAddUnit(u: VisibilityUnit) {
    setLocalUnits((prev) => [...prev, u]);
  }
  function handleDeleteUnit(id: string) {
    setLocalUnits((prev) => prev.filter((u) => u.id !== id));
    if (selectedUnitId === id) setSelectedUnitId(null);
  }

  // User-added satellites keyed by region.id
  const [addedSats, setAddedSats]   = useState<Record<string, GeoSatellite[]>>({});
  // User-edited overrides keyed by satellite id
  const [editedSats, setEditedSats] = useState<Record<string, GeoSatellite>>({});

  function handleAddSat(regionId: string, sat: GeoSatellite) {
    setAddedSats((prev) => ({
      ...prev,
      [regionId]: [...(prev[regionId] ?? []), sat],
    }));
  }

  function handleEditSat(updated: GeoSatellite) {
    setEditedSats((prev) => ({ ...prev, [updated.id]: updated }));
  }

  // Merge static + user-added, then apply any edits
  const mergedRegions = useMemo(
    () =>
      GEO_REGIONS.map((r) => ({
        ...r,
        satellites: [...r.satellites, ...(addedSats[r.id] ?? [])].map(
          (s) => editedSats[s.id] ?? s,
        ),
      })),
    [addedSats, editedSats],
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

  useEffect(() => {
    if (deepLinkApplied.current) return;
    if (!searchUnit && !searchSatellite) return;
    deepLinkApplied.current = true;

    if (searchUnit) {
      setSelectedUnitId(searchUnit);
    }

    if (searchSatellite) {
      const target = searchSatellite.toLowerCase();
      for (const region of mergedRegions) {
        const sat = region.satellites.find((s) => s.name.toLowerCase() === target);
        if (sat) {
          setActiveRegionId(region.id);
          setActiveSat(sat);
          break;
        }
      }
    }
  }, [searchUnit, searchSatellite, mergedRegions]);

  return (
    <AppShell
      title="Satellite Visibility Matrices"
      subtitle="Target Country Satellites"
      headerIcon={<SatIcon className="h-4 w-4 shrink-0" />}
    >
      {/* ── Level 1: Unit selection ──────────────────────────────────────── */}
      {!selectedUnitId && (
        <UnitGrid
          units={localUnits}
          onSelect={(u) => setSelectedUnitId(u.id)}
          onAddUnit={handleAddUnit}
          onDeleteUnit={handleDeleteUnit}
        />
      )}

      {/* ── Level 2: Region selection (inside a unit) ────────────────────── */}
      {selectedUnitId && !activeRegion && (
        <RegionGrid
          regions={mergedRegions}
          onSelect={(r) => setActiveRegionId(r.id)}
          unit={selectedUnit}
          onBackToUnits={() => { setSelectedUnitId(null); setActiveRegionId(null); }}
        />
      )}

      {/* ── Level 3: Region detail / satellite list ──────────────────────── */}
      {selectedUnitId && activeRegion && (
        <RegionDetail
          region={activeRegion}
          onBack={() => setActiveRegionId(null)}
          onSelectSat={setActiveSat}
          onAddSat={(sat) => handleAddSat(activeRegion.id, sat)}
          onEditSat={handleEditSat}
          unitName={selectedUnit?.name}
          unitId={selectedUnitId}
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

// ─── Unit grid — first layer of the visibility hierarchy ─────────────────────

function UnitGrid({
  units,
  onSelect,
  onAddUnit,
  onDeleteUnit,
}: {
  units: VisibilityUnit[];
  onSelect: (u: VisibilityUnit) => void;
  onAddUnit: (u: VisibilityUnit) => void;
  onDeleteUnit: (id: string) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteMode,   setDeleteMode]   = useState(false);
  const [addOpen,      setAddOpen]      = useState(false);
  const [newName,      setNewName]      = useState("");
  const [newLoc,       setNewLoc]       = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const code = newName.trim().split(" ").pop()?.charAt(0).toUpperCase() ?? "X";
    onAddUnit({
      id:       `unit-${Date.now()}`,
      code,
      name:     newName.trim(),
      location: newLoc.trim() || "Unassigned Sector",
    });
    setNewName("");
    setNewLoc("");
    setAddOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="label-eyebrow">Select Unit</div>

      {/* Tile grid — 2 columns mobile, 4 desktop, full-width balanced */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {units.map((u) => (
          <div key={u.id} className="relative group/tile">
            {/* Delete overlay button (delete mode only) */}
            {deleteMode && (
              <button
                type="button"
                title="Delete this unit"
                onClick={() => onDeleteUnit(u.id)}
                className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 rounded-full border border-border
                           bg-card text-muted-foreground hover:bg-destructive hover:text-destructive-foreground
                           flex items-center justify-center transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => !deleteMode && onSelect(u)}
              className={`w-full text-left rounded-md border border-border
                          bg-card shadow-md hover:shadow-lg
                          transition-all duration-200
                          focus:outline-none focus:ring-2 focus:ring-primary/50
                          p-4
                          ${deleteMode
                            ? "cursor-default opacity-80"
                            : "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary/40"}`}
            >
              {/* Accent bar */}
              <div className="h-0.5 w-8 rounded-full bg-primary mb-3 opacity-60" />

              <div className="mono text-sm font-bold uppercase tracking-tight leading-tight text-foreground">
                {u.name}
              </div>
              <div className="flex items-center gap-1 mt-1.5 mono text-[10px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span>{u.location}</span>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* ── Advanced Features — bottom-right (mirrors Resource Inventory) ── */}
      <div className="mt-4 flex items-center justify-end gap-2">
        {deleteMode && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setDeleteMode(false)}
          >
            Exit delete mode
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdvancedOpen(true)}
          className="gap-1.5"
        >
          <Settings2 className="h-4 w-4" />
          Advanced Features
        </Button>
      </div>

      {/* Advanced Features dialog */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advanced Features</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => { setAdvancedOpen(false); setAddOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Unit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={() => { setAdvancedOpen(false); setDeleteMode(true); }}
              disabled={units.length === 0}
            >
              <X className="h-4 w-4 mr-2" /> Delete Unit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Unit dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setNewName(""); setNewLoc(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Add Unit
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <Label className="label-eyebrow">Unit Name *</Label>
              <Input
                required
                className="mt-1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Unit India"
              />
            </div>
            <div>
              <Label className="label-eyebrow">Location</Label>
              <Input
                className="mt-1"
                value={newLoc}
                onChange={(e) => setNewLoc(e.target.value)}
                placeholder="e.g. Mountain Sector"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" className="flex-1 mono uppercase tracking-wider" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="flex-1 mono uppercase tracking-wider">
                Add Unit
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Region icon fallbacks for multi-country regions ─────────────────────────
const REGION_ICON: Record<string, React.ReactNode> = {
  "sea":         <Map     className="h-9 w-9 text-muted-foreground" />,
  "middle-east": <Compass className="h-9 w-9 text-muted-foreground" />,
  "africa":      <Globe   className="h-9 w-9 text-muted-foreground" />,
};

// ─── Region grid — icon-driven country/region selection ───────────────────────

function RegionGrid({
  regions,
  onSelect,
  unit,
  onBackToUnits,
}: {
  regions: Region[];
  onSelect: (r: Region) => void;
  unit?: VisibilityUnit | null;
  onBackToUnits?: () => void;
}) {
  const totalSats = regions.reduce((sum, r) => sum + r.satellites.length, 0);

  return (
    <div className="space-y-5">
      {/* Unit context header — back to units + breadcrumb */}
      {unit && onBackToUnits && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBackToUnits}
            className="mono text-[11px] h-8 uppercase tracking-wider"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> All Units
          </Button>
          <div className="flex items-center gap-1.5 text-[12px] mono text-muted-foreground">
            <SatIcon className="h-3.5 w-3.5" />
            <span>{unit.name}</span>
            <span>/</span>
            <span className="text-foreground font-bold uppercase">Select Region</span>
          </div>
        </div>
      )}

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
  onEditSat,
  unitName,
  unitId,
}: {
  region: Region;
  onBack: () => void;
  onSelectSat: (s: GeoSatellite) => void;
  onAddSat: (sat: GeoSatellite) => void;
  onEditSat: (sat: GeoSatellite) => void;
  unitName?: string;
  unitId: string;
}) {
  return (
    <div className="space-y-3">
      {/* Compact breadcrumb only */}
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
        <div className="flex items-center gap-1.5 text-[11px] mono text-muted-foreground">
          <Globe className="h-3 w-3" />
          {unitName && <><span>{unitName}</span><span>/</span></>}
          <span>Target Satellites</span>
          <span>/</span>
          <span className="text-foreground font-semibold uppercase">{region.label}</span>
        </div>
      </div>

      {/* Satellite table — header bar contains title, scroll arrows, and all actions */}
      <SatelliteTable
        satellites={region.satellites}
        regionId={region.id}
        regionLabel={region.label}
        unitId={unitId}
        onAddSat={onAddSat}
        onEditSat={onEditSat}
      />
    </div>
  );
}

// ─── Satellite filter type ────────────────────────────────────────────────────

type SatFilter = {
  name:          string;
  orbit:         string;   // "" | "GEO" | "MEO" | "LEO"
  position:      string;
  launchYearFrom: string;
  launchYearTo:   string;
  coverage:      string;
};
const EMPTY_SAT_FILTER: SatFilter = {
  name: "", orbit: "", position: "", launchYearFrom: "", launchYearTo: "", coverage: "",
};

// ─── Satellite database table ──────────────────────────────────────────────────

function SatelliteTable({
  satellites,
  regionId,
  regionLabel,
  unitId,
  onAddSat,
  onEditSat,
}: {
  satellites: GeoSatellite[];
  regionId: string;
  regionLabel: string;
  unitId: string;
  onAddSat: (s: GeoSatellite) => void;
  onEditSat: (s: GeoSatellite) => void;
}) {
  const [editingSat,  setEditingSat]  = useState<GeoSatellite | null>(null);
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [filter,      setFilter]      = useState<SatFilter>(EMPTY_SAT_FILTER);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Derived: filtered satellite list ────────────────────────────────────────
  const filteredSats = useMemo(() => {
    return satellites.filter((s) => {
      const f = filter;
      if (f.name && !s.name.toLowerCase().includes(f.name.toLowerCase())) return false;
      if (f.orbit && (s.orbitType ?? "GEO").toUpperCase() !== f.orbit.toUpperCase()) return false;
      if (f.position && !s.position.toLowerCase().includes(f.position.toLowerCase())) return false;
      if (f.coverage && !s.beamCoverage.toLowerCase().includes(f.coverage.toLowerCase())) return false;
      const year = parseInt(s.launchDate.slice(0, 4)) || 0;
      if (f.launchYearFrom && year < parseInt(f.launchYearFrom)) return false;
      if (f.launchYearTo   && year > parseInt(f.launchYearTo))   return false;
      return true;
    });
  }, [satellites, filter]);

  const isFiltered = filteredSats.length !== satellites.length;
  const visibleIds = filteredSats.map((s) => s.id);
  const selectAll  = allSelected(visibleIds, selectedIds);

  function toggleId(id: string)    { setSelectedIds((s) => toggleSelection(s, id)); }
  function clearSelection()        { setSelectedIds(new Set()); }
  function handleSelectAll()       { setSelectedIds(selectAll ? new Set() : new Set(visibleIds)); }
  function clearFilter()           { setFilter(EMPTY_SAT_FILTER); setSelectedIds(new Set()); }
  function setF<K extends keyof SatFilter>(k: K, v: string) { setFilter((f) => ({ ...f, [k]: v })); }

  // ── Export helpers ───────────────────────────────────────────────────────────
  function exportSats(list: GeoSatellite[], label: string) {
    if (list.length === 0) { toast.error("No records to export."); return; }
    const csv = buildCsv(
      ["Satellite Name", "Orbital Position", "Launch Date", "Orbit Type",
       "C-band Transponders", "Ku-band Transponders", "Beam Coverage", "Visibility Notes"],
      list.map((s) => [
        s.name, s.position, s.launchDate, s.orbitType ?? "GEO",
        s.cBandTransponders ?? "", s.kuBandTransponders ?? "",
        s.beamCoverage, s.visibilityNotes ?? "",
      ]),
    );
    downloadCsv(`${regionLabel.toLowerCase().replace(/\s+/g, "_")}_${label}.csv`, csv);
    toast.success(`${list.length} record${list.length !== 1 ? "s" : ""} exported.`);
  }

  function scrollTable(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  }

  function scrollTable(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  }

  // ── Header bar (never scrolls) ──────────────────────────────────────────────
  const headerBar = (
    <div className="flex items-start gap-3 px-3 py-2 border-b border-border bg-background shrink-0">
      {/* LEFT — title */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 pt-0.5">
        <SatIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="mono text-[11px] font-bold uppercase tracking-wide text-foreground">
          {regionLabel} — Satellite Database
        </span>
      </div>
      {/* RIGHT — stacked actions */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {/* Row 1: Import + Export All + Export Filtered */}
        <div className="flex items-center gap-1.5">
          <ImportCsvButton regionId={regionId} onImport={onAddSat} />
          <button
            type="button"
            onClick={() => exportSats(satellites, "all")}
            title="Export all satellites"
            className="h-8 px-2 inline-flex items-center gap-1 rounded-sm border border-border
                       mono text-[11px] uppercase tracking-wider hover:bg-secondary transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export All
          </button>
          {isFiltered && (
            <button
              type="button"
              onClick={() => exportSats(filteredSats, "filtered")}
              title="Export filtered results"
              className="h-8 px-2 inline-flex items-center gap-1 rounded-sm border border-primary/40
                         mono text-[11px] uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export Filtered ({filteredSats.length})
            </button>
          )}
        </div>
        {/* Row 2: scroll + filter + add */}
        <div className="flex items-center gap-1.5">
          {satellites.length > 0 && (
            <>
              <button type="button" onClick={() => scrollTable("left")} title="Scroll left"
                className="h-7 w-7 grid place-items-center rounded-sm border border-border hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => scrollTable("right")} title="Scroll right"
                className="h-7 w-7 grid place-items-center rounded-sm border border-border hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={`h-7 px-2 inline-flex items-center gap-1 rounded-sm border mono text-[11px] uppercase tracking-wider transition-colors
                        ${filterOpen ? "border-primary/50 bg-primary/10 text-primary" : "border-border hover:bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            <Filter className="h-3 w-3" /> Filter
          </button>
          <AddSatelliteDialog regionId={regionId} onAdd={onAddSat} />
        </div>
      </div>
    </div>
  );

  // ── Record counts bar ────────────────────────────────────────────────────────
  const countsBar = (
    <div className="px-3 py-1 border-b border-border bg-secondary/20 flex items-center gap-3 shrink-0 mono text-[10px] text-muted-foreground">
      <span>Total: <span className="text-foreground font-bold">{satellites.length}</span></span>
      {isFiltered && (
        <span>Filtered: <span className="text-primary font-bold">{filteredSats.length}</span></span>
      )}
      {selectedIds.size > 0 && (
        <span>Selected: <span className="text-primary font-bold">{selectedIds.size}</span></span>
      )}
    </div>
  );

  // ── Filter panel ─────────────────────────────────────────────────────────────
  const filterPanel = filterOpen && (
    <div className="px-3 py-2 border-b border-border bg-secondary/10 shrink-0 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <input
          className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Satellite name…"
          value={filter.name}
          onChange={(e) => setF("name", e.target.value)}
        />
        <select
          className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          value={filter.orbit}
          onChange={(e) => setF("orbit", e.target.value)}
        >
          <option value="">Orbit type — all</option>
          <option value="GEO">GEO</option>
          <option value="MEO">MEO</option>
          <option value="LEO">LEO</option>
        </select>
        <input
          className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Orbital position…"
          value={filter.position}
          onChange={(e) => setF("position", e.target.value)}
        />
        <input
          className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Launch year from (e.g. 2010)"
          value={filter.launchYearFrom}
          onChange={(e) => setF("launchYearFrom", e.target.value)}
        />
        <input
          className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Launch year to (e.g. 2020)"
          value={filter.launchYearTo}
          onChange={(e) => setF("launchYearTo", e.target.value)}
        />
        <input
          className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Beam coverage…"
          value={filter.coverage}
          onChange={(e) => setF("coverage", e.target.value)}
        />
      </div>
      {isFiltered && (
        <button
          type="button"
          onClick={clearFilter}
          className="mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
        >
          × Clear Filters
        </button>
      )}
    </div>
  );

  // ── Bulk operations bar (shows only when items are selected) ─────────────────
  const bulkBar = selectedIds.size > 0 && (
    <div className="px-3 py-1.5 border-b border-border bg-primary/5 flex items-center gap-2 shrink-0 mono text-[11px]">
      <span className="text-primary font-bold">
        {selectedIds.size} record{selectedIds.size !== 1 ? "s" : ""} selected
      </span>
      <span className="text-muted-foreground/40">·</span>
      <button
        type="button"
        onClick={() => exportSats(filteredSats.filter((s) => selectedIds.has(s.id)), "selected")}
        className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
      >
        <Download className="h-3 w-3" /> Export Selected
      </button>
      <span className="text-muted-foreground/40">·</span>
      <button
        type="button"
        onClick={() => setSelectedIds(new Set(visibleIds))}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        Select All Visible ({filteredSats.length})
      </button>
      <span className="text-muted-foreground/40">·</span>
      <button type="button" onClick={clearSelection} className="text-muted-foreground hover:text-destructive transition-colors">
        Clear
      </button>
    </div>
  );

  if (satellites.length === 0) {
    return (
      <>
        <div className="rounded-md border border-border overflow-hidden flex flex-col">
          {headerBar}
          {countsBar}
          <div className="p-8 flex flex-col items-center gap-2 text-center">
            <SatIcon className="h-8 w-8 text-muted-foreground opacity-40" />
            <div className="mono text-sm font-bold uppercase tracking-wide text-muted-foreground">No satellites recorded</div>
            <div className="mono text-[11px] text-muted-foreground">Use "Add New Satellite" or "Import CSV" to populate data.</div>
          </div>
        </div>
        <SatelliteEditDialog
          satellite={editingSat}
          onClose={() => setEditingSat(null)}
          onSave={(updated) => { onEditSat(updated); setEditingSat(null); }}
        />
      </>
    );
  }

  return (
    <>
      <div className="rounded-md border border-border overflow-hidden flex flex-col" style={{ maxHeight: "70vh" }}>
        {/* Fixed bars — never scroll */}
        {headerBar}
        {countsBar}
        {filterPanel}
        {bulkBar}

        {/* Combined H + V scroll — sticky <th> elements handle column label visibility */}
        <div ref={scrollRef} className="overflow-x-auto overflow-y-auto flex-1">
          <table className="min-w-max text-[11px] mono border-collapse">
            <thead>
              <tr>
                {/* Checkbox column */}
                <th className="sticky top-0 z-10 bg-secondary px-2 py-1.5 w-8 border-b border-border">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    title="Select / deselect all visible"
                    className="cursor-pointer accent-primary"
                  />
                </th>
                {[
                  { label: "#",                cls: "w-7"            },
                  { label: "Satellite",        cls: "min-w-[130px]"  },
                  { label: "Orbital Position", cls: "min-w-[110px]"  },
                  { label: "Launch",           cls: "w-14"           },
                  { label: "Transponders",     cls: "min-w-[100px]"  },
                  { label: "Beams",            cls: "min-w-[120px]"  },
                  { label: "Visible Beams",    cls: "min-w-[220px]"  },
                  { label: "Edit",             cls: "w-12"           },
                ].map((col) => (
                  <th key={col.label}
                    className={`sticky top-0 z-10 bg-secondary px-2 py-1.5 text-left
                                text-muted-foreground font-medium border-b border-border ${col.cls}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSats.map((sat, idx) => {
                const tp = parseTransponders(sat);
                const { total: bt, beams } = getBeamBreakdown(sat);
                const visibleBeams = getVisibleBeams(unitId, sat.id, regionId);
                const checked = selectedIds.has(sat.id);

                return (
                  <tr key={sat.id}
                    className={`transition-colors align-top ${checked ? "bg-primary/8" : "hover:bg-secondary/30"}`}>

                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={checked} onChange={() => toggleId(sat.id)}
                        className="cursor-pointer accent-primary" />
                    </td>

                    <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>

                    <td className="px-2 py-1.5">
                      <div className="font-bold text-foreground uppercase tracking-tight leading-tight">{sat.name}</div>
                      <div className="text-muted-foreground text-[10px]">{sat.orbitType ?? "GEO"}</div>
                    </td>

                    <td className="px-2 py-1.5 text-foreground font-bold">{sat.position}</td>
                    <td className="px-2 py-1.5 text-foreground">{sat.launchDate.slice(0, 4)}</td>

                    <td className="px-2 py-1.5">
                      <div className="font-bold text-foreground">{tp.total}</div>
                      {tp.cBand  && <div className="text-[10px] text-muted-foreground">· {tp.cBand} C</div>}
                      {tp.kuBand && <div className="text-[10px] text-muted-foreground">· {tp.kuBand} Ku</div>}
                    </td>

                    <td className="px-2 py-1.5">
                      <div className="font-bold text-foreground">{bt}</div>
                      {beams.map((b, i) => (
                        <div key={i} className="text-[10px] text-muted-foreground">· {b}</div>
                      ))}
                    </td>

                    <td className="px-2 py-1.5">
                      {visibleBeams.length > 0 ? (
                        <div className="space-y-0.5">
                          {visibleBeams.map((b, i) => {
                            const eirp = getBeamEirp(b, sat.id, sat.beamEirp);
                            return (
                              <div key={i} className="flex items-start gap-1 text-[10px] leading-snug">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-[3px]" />
                                <span>
                                  <span className="text-foreground">{b}</span>
                                  <span className="text-muted-foreground"> (EIRP {eirp} dBW)</span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-[10px]">—</span>
                      )}
                    </td>

                    <td className="px-2 py-1.5">
                      <button type="button" title="Edit satellite data" onClick={() => setEditingSat(sat)}
                        className="h-6 w-6 grid place-items-center rounded-sm border border-border
                                   hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SatelliteEditDialog
        satellite={editingSat}
        regionId={regionId}
        onClose={() => setEditingSat(null)}
        onSave={(updated) => { onEditSat(updated); setEditingSat(null); }}
      />
    </>
  );
}

// ─── Satellite edit dialog ─────────────────────────────────────────────────────

function SatelliteEditDialog({
  satellite,
  regionId,
  onClose,
  onSave,
}: {
  satellite: GeoSatellite | null;
  regionId: string;
  onClose: () => void;
  onSave: (sat: GeoSatellite) => void;
}) {
  const [form, setForm] = useState({
    orbitType: "GEO", name: "", position: "", launchDate: "",
    cBand: "", kuBand: "", beamCoverage: "", visibilityNotes: "",
  });
  const [fpPreview, setFpPreview] = useState("");
  // Per-beam EIRP entries: {beam: label, eirp: string value}
  const [beamEirpEntries, setBeamEirpEntries] = useState<{ beam: string; eirp: string }[]>([]);

  useEffect(() => {
    if (satellite) {
      setForm({
        orbitType:       satellite.orbitType ?? "GEO",
        name:            satellite.name,
        position:        satellite.position,
        launchDate:      satellite.launchDate,
        cBand:           satellite.cBandTransponders ?? "",
        kuBand:          satellite.kuBandTransponders ?? "",
        beamCoverage:    satellite.beamCoverage,
        visibilityNotes: satellite.visibilityNotes ?? "",
      });
      setFpPreview(satellite.footprintImageUrl || satellite.beamCoverageImageUrl || "");
      // Populate EIRP entries from the region beam pool, pre-filling stored or generated values
      const pool = REGION_BEAMS[regionId] ?? [];
      setBeamEirpEntries(
        pool.map((b) => ({
          beam: b,
          eirp: String(getBeamEirp(b, satellite.id, satellite.beamEirp)),
        }))
      );
    }
  }, [satellite?.id]);

  function setEirp(idx: number, val: string) {
    setBeamEirpEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, eirp: val } : e)));
  }

  function buildBeamEirpRecord(): Record<string, number> {
    const rec: Record<string, number> = {};
    for (const { beam, eirp } of beamEirpEntries) {
      const n = parseInt(eirp);
      if (!isNaN(n)) rec[beam] = n;
    }
    return rec;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!satellite) return;
    const cNum  = parseInt(form.cBand)  || 0;
    const kuNum = parseInt(form.kuBand) || 0;
    const transponders =
      [cNum  > 0 ? `${cNum} C-band` : "", kuNum > 0 ? `${kuNum} Ku-band` : ""]
        .filter(Boolean).join(" / ") || satellite.transponders;
    onSave({
      ...satellite,
      orbitType:          form.orbitType,
      name:               form.name.trim(),
      position:           form.position.trim(),
      launchDate:         form.launchDate,
      transponders,
      cBandTransponders:  form.cBand.trim()  || undefined,
      kuBandTransponders: form.kuBand.trim() || undefined,
      beamCoverage:       form.beamCoverage.trim(),
      visibilityNotes:    form.visibilityNotes.trim() || undefined,
      footprintImageUrl:  fpPreview || undefined,
      beamEirp:           buildBeamEirpRecord(),
    });
  }

  return (
    <Dialog open={!!satellite} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2 text-sm">
            <Pencil className="h-4 w-4 text-primary" />
            Edit Satellite — {satellite?.name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <SatField label="Orbit Type">
            <Select value={form.orbitType} onValueChange={(v) => setForm({ ...form, orbitType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORBIT_TYPES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </SatField>

          <SatField label="Satellite Name *">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </SatField>

          <div className="grid grid-cols-2 gap-3">
            <SatField label="Orbital Position">
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="e.g. 87.5°E" />
            </SatField>
            <SatField label="Launch Date">
              <Input type="date" value={form.launchDate} onChange={(e) => setForm({ ...form, launchDate: e.target.value })} />
            </SatField>
          </div>

          <div className="space-y-2">
            <div className="label-eyebrow">Transponders</div>
            <div className="grid grid-cols-2 gap-3">
              <SatField label="C-band count"><Input value={form.cBand}  onChange={(e) => setForm({ ...form, cBand: e.target.value })}  placeholder="e.g. 20" /></SatField>
              <SatField label="Ku-band count"><Input value={form.kuBand} onChange={(e) => setForm({ ...form, kuBand: e.target.value })} placeholder="e.g. 18" /></SatField>
            </div>
          </div>

          <SatField label="Beam Coverage">
            <Input value={form.beamCoverage} onChange={(e) => setForm({ ...form, beamCoverage: e.target.value })} placeholder="e.g. Asia / Pacific" />
          </SatField>

          <SatField label="Visibility Notes">
            <Input value={form.visibilityNotes} onChange={(e) => setForm({ ...form, visibilityNotes: e.target.value })} placeholder="e.g. Ku Spot Beam 08 visible from this unit" />
          </SatField>

          {/* Per-beam EIRP values */}
          {beamEirpEntries.length > 0 && (
            <div className="space-y-2">
              <div className="label-eyebrow">Visible Beam EIRP Values (dBW)</div>
              <div className="rounded-sm border border-border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-secondary border-b border-border">
                      <th className="px-2 py-1 text-left text-muted-foreground font-medium">Beam</th>
                      <th className="px-2 py-1 text-left text-muted-foreground font-medium w-20">EIRP (dBW)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {beamEirpEntries.map((entry, idx) => (
                      <tr key={entry.beam} className="hover:bg-secondary/30">
                        <td className="px-2 py-1 text-foreground">{entry.beam}</td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={0}
                            max={80}
                            value={entry.eirp}
                            onChange={(e) => setEirp(idx, e.target.value)}
                            className="h-6 text-[11px] px-1.5 w-16"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground">Typical range: 30–60 dBW. Values are stored per beam.</p>
            </div>
          )}

          <SatField label="Footprint / Coverage Map">
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-sm cursor-pointer hover:border-primary transition-colors bg-secondary/30">
              {fpPreview ? (
                <img src={fpPreview} alt="Footprint" className="h-full w-full object-contain rounded-sm" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                  <span className="mono text-[11px]">Click to upload JPG / PNG / WEBP</span>
                </div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onloadend = () => setFpPreview(reader.result as string);
                  reader.readAsDataURL(f);
                }}
              />
            </label>
          </SatField>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" className="flex-1 mono uppercase tracking-wider" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="flex-1 mono uppercase tracking-wider">
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Footprint image modal ─────────────────────────────────────────────────────

function FootprintModal({
  satellite,
  onClose,
}: {
  satellite: GeoSatellite | null;
  onClose: () => void;
}) {
  const imgUrl = satellite?.footprintImageUrl || satellite?.beamCoverageImageUrl;
  return (
    <Dialog open={!!satellite} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2 text-sm">
            <ImageIcon className="h-4 w-4 text-primary" />
            {satellite?.name} — Footprint / Coverage Map
          </DialogTitle>
        </DialogHeader>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={`${satellite?.name} footprint`}
            className="w-full object-contain rounded-sm border border-border max-h-[60vh]"
          />
        ) : (
          <p className="mono text-[12px] text-muted-foreground text-center py-6">
            No footprint image available for this satellite.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── CSV import button ─────────────────────────────────────────────────────────

function ImportCsvButton({
  regionId,
  onImport,
}: {
  regionId: string;
  onImport: (sat: GeoSatellite) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === "," && !inQuotes) { result.push(current); current = ""; continue; }
      current += char;
    }
    result.push(current);
    return result;
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const check = validateImportFile(file);
    if (!check.ok) { toast.error(check.error); return; }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Excel file detected. Please export to CSV format (.csv) first, then re-import.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { toast.error("File appears empty or has no data rows."); return; }
      let added = 0;
      lines.slice(1).forEach((line, i) => {
        const [satName, position, launchDate, cBand, kuBand, beamCoverage, visNotes] = parseCsvLine(line);
        if (!satName?.trim()) return;
        const cNum  = parseInt(cBand  ?? "0") || 0;
        const kuNum = parseInt(kuBand ?? "0") || 0;
        const sat: GeoSatellite = {
          id:                 `${regionId}-csv-${Date.now()}-${i}`,
          name:               satName.trim(),
          position:           position?.trim() || "—",
          launchDate:         launchDate?.trim() || "—",
          transponders:       [cNum  > 0 ? `${cNum} C-band` : "", kuNum > 0 ? `${kuNum} Ku-band` : ""]
                                .filter(Boolean).join(" / ") || "—",
          cBandTransponders:  cBand?.trim()  || undefined,
          kuBandTransponders: kuBand?.trim() || undefined,
          beamCoverage:       beamCoverage?.trim() || "—",
          visibilityNotes:    visNotes?.trim() || undefined,
        };
        onImport(sat);
        added++;
      });
      if (added > 0) toast.success(`${added} satellite${added > 1 ? "s" : ""} imported successfully.`);
    };
    reader.readAsText(file);
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 mono text-[11px] uppercase tracking-wider"
        onClick={() => fileRef.current?.click()}
        title="Import satellite data from CSV file"
      >
        <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
      </Button>
    </>
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
  // Per-beam EIRP entries initialised from the region's beam pool
  const regionPool = REGION_BEAMS[regionId] ?? [];
  const [beamEirpEntries, setBeamEirpEntries] = useState<{ beam: string; eirp: string }[]>(
    regionPool.map((b) => ({ beam: b, eirp: "" }))
  );

  function setEirp(idx: number, val: string) {
    setBeamEirpEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, eirp: val } : e)));
  }

  function buildBeamEirpRecord(): Record<string, number> {
    const rec: Record<string, number> = {};
    for (const { beam, eirp } of beamEirpEntries) {
      const n = parseInt(eirp);
      if (!isNaN(n)) rec[beam] = n;
    }
    return rec;
  }

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
    setBeamEirpEntries(regionPool.map((b) => ({ beam: b, eirp: "" })));
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
      beamEirp: buildBeamEirpRecord(),
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

          {/* Per-beam EIRP values */}
          {beamEirpEntries.length > 0 && (
            <div className="space-y-2">
              <div className="label-eyebrow">Visible Beam EIRP Values (dBW)</div>
              <div className="rounded-sm border border-border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-secondary border-b border-border">
                      <th className="px-2 py-1 text-left text-muted-foreground font-medium">Beam</th>
                      <th className="px-2 py-1 text-left text-muted-foreground font-medium w-20">EIRP (dBW)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {beamEirpEntries.map((entry, idx) => (
                      <tr key={entry.beam} className="hover:bg-secondary/30">
                        <td className="px-2 py-1 text-foreground">{entry.beam}</td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={0}
                            max={80}
                            value={entry.eirp}
                            onChange={(e) => setEirp(idx, e.target.value)}
                            placeholder="e.g. 52"
                            className="h-6 text-[11px] px-1.5 w-16"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground">Leave blank to auto-generate. Typical range: 30–60 dBW.</p>
            </div>
          )}

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
