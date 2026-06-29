import { createFileRoute, Link } from "@tanstack/react-router";
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
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  Radar,
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
import {
  GEO_REGIONS,
  REGION_BEAMS,
  seedRand,
  getBeamBreakdown,
  getVisibleBeams,
  type GeoSatellite,
  type GeoRegion,
} from "@/lib/visibilityMatrix";
import {
  getVisibilityOverlay,
  patchVisibilityOverlay,
  VISIBILITY_OVERLAY_EVENT,
} from "@/lib/visibilityOverlay";
import { mergeRegionsWithOverlay, useVisibleSatelliteCounts } from "@/lib/satelliteCatalog";
import { INT_UNITS } from "@/lib/intelRepository";
import { unitTileTitle, UNIT_SLOTS, type UnitSlot } from "@/lib/priorityAllocation";
import { hasIntVisibilityCrossLink } from "@/lib/intelAnalysisData";

// ─── Static unit roster for visibility layer (shared naming with INT) ─────────

type VisibilityUnit = (typeof INT_UNITS)[number];

const VISIBILITY_UNITS: VisibilityUnit[] = [...INT_UNITS];

// GeoSatellite / GeoRegion / GEO_REGIONS / REGION_BEAMS / beam helpers — @/lib/visibilityMatrix (SSOT)

type Region = GeoRegion;

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
    region: typeof search.region === "string" ? search.region : undefined,
  }),
  component: VisibilityPage,
});

// ─── Main page component ───────────────────────────────────────────────────────

function VisibilityPage() {
  const { unit: searchUnit, satellite: searchSatellite, region: searchRegion } = Route.useSearch();

  // Three-level hierarchy: unit → region → satellite
  const [localUnits, setLocalUnits] = useState<VisibilityUnit[]>(VISIBILITY_UNITS);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [activeSat, setActiveSat] = useState<GeoSatellite | null>(null);
  /** Deep-link target — highlights row in region table; does not open detail modal. */
  const [focusSatelliteId, setFocusSatelliteId] = useState<string | null>(null);

  const selectedUnit = localUnits.find((u) => u.id === selectedUnitId) ?? null;

  function handleAddUnit(u: VisibilityUnit) {
    setLocalUnits((prev) => [...prev, u]);
  }
  function handleDeleteUnit(id: string) {
    setLocalUnits((prev) => prev.filter((u) => u.id !== id));
    if (selectedUnitId === id) setSelectedUnitId(null);
  }

  // User-added / edited satellites — SSOT via visibilityOverlay (synced with Satellites sidebar)
  const [overlayVersion, setOverlayVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setOverlayVersion((v) => v + 1);
    window.addEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
    return () => window.removeEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
  }, []);

  function handleAddSat(regionId: string, sat: GeoSatellite) {
    const overlay = getVisibilityOverlay();
    patchVisibilityOverlay({
      addedSats: {
        ...overlay.addedSats,
        [regionId]: [...(overlay.addedSats[regionId] ?? []), sat],
      },
    });
  }

  function handleEditSat(updated: GeoSatellite) {
    const overlay = getVisibilityOverlay();
    patchVisibilityOverlay({
      editedSats: { ...overlay.editedSats, [updated.id]: updated },
    });
  }

  const mergedRegions = useMemo(
    () => mergeRegionsWithOverlay(),
    [overlayVersion],
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
    if (!searchUnit && !searchSatellite && !searchRegion) return;

    if (searchUnit && !localUnits.some((u) => u.id === searchUnit)) {
      return;
    }

    if (searchUnit) {
      setSelectedUnitId(searchUnit);
    }

    if (searchSatellite || searchRegion) {
      const targetName = searchSatellite?.trim().toLowerCase();
      let matched = false;

      const tryMatchRegions = (regions: typeof mergedRegions) => {
        for (const region of regions) {
          const sat = region.satellites.find(
            (s) => targetName && s.name.trim().toLowerCase() === targetName,
          );
          if (sat) {
            setActiveRegionId(region.id);
            setFocusSatelliteId(sat.id);
            matched = true;
            return;
          }
        }
      };

      if (targetName) {
        if (searchRegion) {
          tryMatchRegions(mergedRegions.filter((r) => r.id === searchRegion));
        }
        if (!matched) {
          tryMatchRegions(mergedRegions);
        }
      } else if (searchRegion) {
        const regionExists = mergedRegions.some((r) => r.id === searchRegion);
        if (regionExists) setActiveRegionId(searchRegion);
      }
    } else {
      setActiveRegionId(null);
      setFocusSatelliteId(null);
    }
  }, [searchUnit, searchSatellite, searchRegion, mergedRegions, localUnits]);

  return (
    <AppShell
      title="Satellite Visibility Matrices"
      subtitle="Target Country Satellites"
      headerIcon={<SatIcon className="h-4 w-4 shrink-0" />}
      horizontalNav={null}
    >
      {/* ── Level 1: Unit selection ──────────────────────────────────────── */}
      {!selectedUnitId && (
        <div className="flex flex-col h-[calc(100dvh-7.5rem)] min-h-0 -m-4 sm:-m-6 p-4 sm:p-6 overflow-hidden">
          <UnitGrid
            units={localUnits}
            onSelect={(u) => setSelectedUnitId(u.id)}
            onAddUnit={handleAddUnit}
            onDeleteUnit={handleDeleteUnit}
          />
        </div>
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
          onBack={() => {
            setActiveRegionId(null);
            setFocusSatelliteId(null);
          }}
          onAddSat={(sat) => handleAddSat(activeRegion.id, sat)}
          onEditSat={handleEditSat}
          unitName={selectedUnit?.name}
          unitId={selectedUnitId}
          highlightSatelliteId={focusSatelliteId}
          onHighlightConsumed={() => setFocusSatelliteId(null)}
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
  const visibleCounts = useVisibleSatelliteCounts();

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
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="grid grid-cols-2 sm:grid-cols-4 grid-rows-4 sm:grid-rows-2 gap-2 flex-1 min-h-0 h-full auto-rows-fr">
        {units.map((u) => {
          const title = (UNIT_SLOTS as readonly string[]).includes(u.id) ? unitTileTitle(u.id as UnitSlot) : u.name;
          const count = visibleCounts[u.id] ?? 0;

          return (
            <div key={u.id} className="relative group/tile h-full min-h-0">
              {deleteMode && (
                <button
                  type="button"
                  title="Delete this unit"
                  onClick={() => onDeleteUnit(u.id)}
                  className="absolute -top-1 -right-1 z-10 h-5 w-5 rounded-full border border-border
                             bg-card text-muted-foreground hover:bg-destructive hover:text-destructive-foreground
                             flex items-center justify-center transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => !deleteMode && onSelect(u)}
                className={`tile text-center flex flex-col justify-between focus:outline-none focus:border-primary p-3 h-full min-h-0 w-full ${
                  deleteMode
                    ? "cursor-default opacity-80"
                    : "hover:border-primary cursor-pointer"
                }`}
              >
                <div className="min-w-0">
                  <div className="mono text-[14px] sm:text-[15px] font-bold uppercase leading-tight">
                    {title}
                  </div>
                  <div className="text-[10px] text-muted-foreground mono mt-1 truncate">
                    {u.location}
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center flex-1 py-2 min-h-[3rem]">
                  <span className="mono text-[26px] sm:text-[32px] font-bold text-primary leading-none tabular-nums">
                    {count}
                  </span>
                  <span className="mono text-[10px] sm:text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">
                    Satellite{count !== 1 ? "s" : ""}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Advanced Features — bottom-right (mirrors Resource Inventory) ── */}
      <div className="mt-3 flex items-center justify-end gap-2 shrink-0">
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
  "sea":         <MapIcon className="h-9 w-9 text-muted-foreground" />,
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
  onAddSat,
  onEditSat,
  unitName,
  unitId,
  highlightSatelliteId,
  onHighlightConsumed,
}: {
  region: Region;
  onBack: () => void;
  onAddSat: (sat: GeoSatellite) => void;
  onEditSat: (sat: GeoSatellite) => void;
  unitName?: string;
  unitId: string;
  highlightSatelliteId?: string | null;
  onHighlightConsumed?: () => void;
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
        highlightSatelliteId={highlightSatelliteId}
        onHighlightConsumed={onHighlightConsumed}
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
  highlightSatelliteId,
  onHighlightConsumed,
}: {
  satellites: GeoSatellite[];
  regionId: string;
  regionLabel: string;
  unitId: string;
  onAddSat: (s: GeoSatellite) => void;
  onEditSat: (s: GeoSatellite) => void;
  highlightSatelliteId?: string | null;
  onHighlightConsumed?: () => void;
}) {
  const [editingSat,  setEditingSat]  = useState<GeoSatellite | null>(null);
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [filter,      setFilter]      = useState<SatFilter>(EMPTY_SAT_FILTER);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const highlightApplied = useRef<string | null>(null);

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

  useEffect(() => {
    if (!highlightSatelliteId) {
      highlightApplied.current = null;
      return;
    }
    if (highlightApplied.current === highlightSatelliteId) return;
    const row = rowRefs.current.get(highlightSatelliteId);
    if (!row) return;
    highlightApplied.current = highlightSatelliteId;
    requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = window.setTimeout(() => onHighlightConsumed?.(), 6000);
    return () => window.clearTimeout(timer);
  }, [highlightSatelliteId, filteredSats, onHighlightConsumed]);

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

  // ── Compact header + icon toolbar (single row) ─────────────────────────────
  const headerBar = (
    <div className="flex items-center gap-2 px-2 py-1 border-b border-border bg-background shrink-0 min-h-[30px]">
      <SatIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="mono text-[10px] font-bold uppercase tracking-wide text-foreground whitespace-nowrap">
        {regionLabel} Sat DB
      </span>
      <span className="mono text-[9px] text-muted-foreground whitespace-nowrap hidden sm:inline">
        · {satellites.length} total
        {isFiltered && ` · ${filteredSats.length} shown`}
        {selectedIds.size > 0 && ` · ${selectedIds.size} sel`}
      </span>
      <div className="flex-1 min-w-2" />
      <div className="flex items-center gap-0.5 shrink-0">
        <ImportCsvButton regionId={regionId} onImport={onAddSat} iconOnly />
        <button
          type="button"
          onClick={() => exportSats(satellites, "all")}
          title="Export all satellites"
          className="h-7 w-7 grid place-items-center rounded-sm border border-border
                     hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {isFiltered && (
          <button
            type="button"
            onClick={() => exportSats(filteredSats, "filtered")}
            title={`Export filtered results (${filteredSats.length})`}
            className="h-7 w-7 grid place-items-center rounded-sm border border-primary/40
                       text-primary hover:bg-primary/10 transition-colors"
          >
            <Download className="h-3 w-3" />
          </button>
        )}
        {satellites.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => scrollTable("left")}
              title="Scroll left"
              className="h-7 w-7 grid place-items-center rounded-sm border border-border hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => scrollTable("right")}
              title="Scroll right"
              className="h-7 w-7 grid place-items-center rounded-sm border border-border hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          title="Filter satellites"
          className={`h-7 w-7 grid place-items-center rounded-sm border transition-colors
                      ${filterOpen
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border hover:bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
        <AddSatelliteDialog regionId={regionId} onAdd={onAddSat} iconOnly />
      </div>
    </div>
  );

  // counts merged into header bar — no separate counts row
  const countsBar = null;

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
          regionId={regionId}
          onClose={() => setEditingSat(null)}
          onSave={(updated) => { onEditSat(updated); setEditingSat(null); }}
        />
      </>
    );
  }

  return (
    <>
      <div className="rounded-md border border-border overflow-hidden flex flex-col" style={{ maxHeight: "78vh" }}>
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
                const highlighted = highlightSatelliteId === sat.id;

                return (
                  <tr
                    key={sat.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(sat.id, el);
                      else rowRefs.current.delete(sat.id);
                    }}
                    className={`transition-colors align-top ${
                      highlighted
                        ? "bg-primary/15 ring-1 ring-inset ring-primary/50"
                        : checked
                          ? "bg-primary/8"
                          : "hover:bg-secondary/30"
                    }`}
                  >

                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={checked} onChange={() => toggleId(sat.id)}
                        className="cursor-pointer accent-primary" />
                    </td>

                    <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>

                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <div className="font-bold text-foreground uppercase tracking-tight leading-tight">{sat.name}</div>
                        {hasIntVisibilityCrossLink(unitId, sat.name) && (
                          <Link
                            to="/intel/$unitId"
                            params={{ unitId }}
                            search={{ satellite: sat.name }}
                            title={`Open ${sat.name} INT report`}
                            className="inline-flex items-center px-1 py-0 rounded border border-primary/40
                                       bg-primary/10 mono text-[8px] font-bold uppercase text-primary
                                       hover:bg-primary/20 transition-colors shrink-0"
                          >
                            INT
                          </Link>
                        )}
                      </div>
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
  iconOnly,
}: {
  regionId: string;
  onImport: (sat: GeoSatellite) => void;
  iconOnly?: boolean;
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
        className={iconOnly ? "h-7 w-7 p-0" : "h-8 mono text-[11px] uppercase tracking-wider"}
        onClick={() => fileRef.current?.click()}
        title="Import satellite data from CSV file"
      >
        <Upload className={iconOnly ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1"} />
        {!iconOnly && " Import CSV"}
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
  iconOnly,
}: {
  regionId: string;
  onAdd: (sat: GeoSatellite) => void;
  iconOnly?: boolean;
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
          title="Add new satellite"
          className={
            iconOnly
              ? "h-7 w-7 p-0 bg-emerald-700 hover:bg-emerald-600 text-white border-0"
              : "h-8 mono text-[11px] uppercase tracking-wider bg-emerald-700 hover:bg-emerald-600 text-white border-0"
          }
        >
          <Plus className={iconOnly ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1"} />
          {!iconOnly && " Add New Satellite"}
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
