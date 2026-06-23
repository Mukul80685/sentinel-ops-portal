import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  getImportantFrequencyRefs,
  INTEL_FREQ_EVENT,
} from "@/lib/intelFrequencyActions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Empty } from "@/components/Empty";
import { listSatellites } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanEdit } from "@/lib/auth";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Filter,
  Plus,
  Radio,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { validateImportFile, buildCsv, downloadCsv, toggleSelection, allSelected } from "@/lib/dataTableUtils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/important")({
  beforeLoad: () => {
    throw redirect({ to: "/control-center", search: { module: "important" } });
  },
  component: () => null,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_LABELS = [
  "Unit A","Unit B","Unit C","Unit D",
  "Unit E","Unit F","Unit G","Unit H",
];

// Ordered index for unit-based sorting
const UNIT_ORDER: Record<string, number> = Object.fromEntries(
  UNIT_LABELS.map((u, i) => [u, i]),
);

// ─── Filter type ──────────────────────────────────────────────────────────────

type FreqFilter = {
  sat:        string;
  freq:       string;
  unit:       string;   // "" or specific unit label
  dateFrom:   string;   // ISO date string YYYY-MM-DD
  dateTo:     string;
  intKeyword: string;
};
const EMPTY_FREQ_FILTER: FreqFilter = {
  sat: "", freq: "", unit: "", dateFrom: "", dateTo: "", intKeyword: "",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanEntry = {
  id: string;
  unit: string;
  date: string;
  observation: string;
};

type SortKey = "satellite" | "unit";
type SortDir = "asc" | "desc";

// ─── Mock seed data (shown when Supabase table is empty) ──────────────────────

type FreqRow = {
  id: string;
  satellite_id: string;
  frequency: string;
  band: string | null;
  label: string | null;
  created_at: string;
  _mock?: true;
  _satName?: string;
};

const MOCK_FREQUENCIES: FreqRow[] = [
  {
    id: "mock-1", satellite_id: "", frequency: "3 785 MHz",
    band: "Unit A", label: "Strong carrier detected. Possible VSAT uplink — active during daylight window.",
    created_at: "2026-05-10T08:30:00Z", _mock: true, _satName: "INSAT-4A",
  },
  {
    id: "mock-2", satellite_id: "", frequency: "11 470 MHz",
    band: "Unit B", label: "Ku-band beacon. Signal intermittent — further monitoring required.",
    created_at: "2026-05-14T10:15:00Z", _mock: true, _satName: "SES-8",
  },
  {
    id: "mock-3", satellite_id: "", frequency: "4 012 MHz",
    band: "Unit C", label: "Wideband transponder. Interference risk noted on adjacent channel.",
    created_at: "2026-05-18T14:45:00Z", _mock: true, _satName: "GSAT-30",
  },
  {
    id: "mock-4", satellite_id: "", frequency: "12 245 MHz",
    band: "Unit A", label: "DTH broadcast active. Signal level −74 dBm at terminal.",
    created_at: "2026-05-20T09:00:00Z", _mock: true, _satName: "MEASAT-3a",
  },
  {
    id: "mock-5", satellite_id: "", frequency: "3 940 MHz",
    band: "Unit D", label: "C-band uplink. Potential crosslink interference observed.",
    created_at: "2026-05-22T11:30:00Z", _mock: true, _satName: "AsiaSat 7",
  },
  {
    id: "mock-6", satellite_id: "", frequency: "10 980 MHz",
    band: "Unit B", label: "X-band segment. Encrypted — source unconfirmed.",
    created_at: "2026-06-01T07:45:00Z", _mock: true, _satName: "INTELSAT 20",
  },
  {
    id: "mock-7", satellite_id: "", frequency: "6 175 MHz",
    band: "Unit E", label: "FSS service uplink. Active during business hours only.",
    created_at: "2026-06-05T16:20:00Z", _mock: true, _satName: "Thaicom 6",
  },
  {
    id: "mock-8", satellite_id: "", frequency: "11 920 MHz",
    band: "Unit C", label: "Multi-beam Ku. Co-channel interference detected from adjacent satellite.",
    created_at: "2026-06-08T13:00:00Z", _mock: true, _satName: "SES-12",
  },
];

// Pre-seeded scan history for mock rows that show the ★ multi-scan badge
const MOCK_SCAN_HISTORY: Record<string, ScanEntry[]> = {
  "mock-1": [
    { id: "ms-1a", unit: "Unit A", date: "2026-05-10", observation: "Carrier confirmed at −68 dBm. Uplink burst every 12 min." },
    { id: "ms-1b", unit: "Unit C", date: "2026-05-13", observation: "Same carrier observed. Possible shared uplink facility." },
  ],
  "mock-3": [
    { id: "ms-3a", unit: "Unit C", date: "2026-05-18", observation: "Interference measured at +4 dB above noise floor on 4 010 MHz." },
    { id: "ms-3b", unit: "Unit F", date: "2026-05-21", observation: "Interference persists. Adjacent channel guard band insufficient." },
    { id: "ms-3c", unit: "Unit C", date: "2026-05-28", observation: "Signal source isolated — commercial Ku hub uplink spillover." },
  ],
  "mock-6": [
    { id: "ms-6a", unit: "Unit B", date: "2026-06-01", observation: "Encrypted burst. 128 kbps estimated throughput. Direction: 67°E." },
    { id: "ms-6b", unit: "Unit H", date: "2026-06-03", observation: "Same encryption signature. Possibly government/defence link." },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso || iso === "—") return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ImportantFrequenciesView() {
  const canEdit  = useCanEdit();
  const qc       = useQueryClient();
  const [q, setQ]                       = useState("");
  const [sortKey, setSortKey]           = useState<SortKey | null>(null);
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [addOpen,         setAddOpen]         = useState(false);
  const [advancedOpen,    setAdvancedOpen]    = useState(false);
  const [clearConfirm,    setClearConfirm]    = useState(false);
  const [filterOpen,      setFilterOpen]      = useState(false);
  const [freqFilter,      setFreqFilter]      = useState<FreqFilter>(EMPTY_FREQ_FILTER);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [refSync, setRefSync] = useState(0);

  useEffect(() => {
    const h = () => setRefSync((n) => n + 1);
    window.addEventListener(INTEL_FREQ_EVENT, h);
    return () => window.removeEventListener(INTEL_FREQ_EVENT, h);
  }, []);

  // In-memory traceability data: Record<freqRowId, ScanEntry[]>
  // Pre-seeded with mock scan history for visualisation purposes
  const [scanHistory, setScanHistory]   = useState<Record<string, ScanEntry[]>>(MOCK_SCAN_HISTORY);
  // Which row's "Log Scan" form is open
  const [addScanForId, setAddScanForId] = useState<string | null>(null);
  const [scanForm, setScanForm]         = useState({
    unit: UNIT_LABELS[0],
    date: new Date().toISOString().slice(0, 10),
    observation: "",
  });

  // ── Data queries ─────────────────────────────────────────────────────────────
  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const { data: rows = [] } = useQuery({
    queryKey: ["important"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("important_frequencies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const satMap = useMemo(
    () => Object.fromEntries(sats.map((s: any) => [s.id, s])),
    [sats],
  );

  // ── Effective row set: DB + INT cross-module refs ───────────────────────────
  const effectiveRows = useMemo(() => {
    const base = rows.length > 0 ? (rows as FreqRow[]) : MOCK_FREQUENCIES;
    const refs = getImportantFrequencyRefs().map(
      (ref): FreqRow => ({
        id: ref.id,
        satellite_id: "",
        frequency: ref.frequency,
        band: ref.unitLabel,
        label: `[INT ref] ${ref.satelliteName}`,
        created_at: ref.createdAt,
        updated_at: ref.createdAt,
        _mock: true,
        _satName: ref.satelliteName,
      }),
    );
    return [...refs, ...base];
  }, [rows, refSync]);

  // ── Filtering (text search + structured filters) ─────────────────────────────
  const filtered = useMemo(() => {
    return effectiveRows.filter((r) => {
      const satName = r._mock ? (r._satName ?? "") : (satMap[r.satellite_id]?.name ?? "");
      // Text search
      if (q.trim()) {
        const lq = q.toLowerCase();
        if (!`${r.frequency} ${r.band ?? ""} ${r.label ?? ""} ${satName}`.toLowerCase().includes(lq))
          return false;
      }
      // Structured filters
      const f = freqFilter;
      if (f.sat        && !satName.toLowerCase().includes(f.sat.toLowerCase()))      return false;
      if (f.freq       && !r.frequency.toLowerCase().includes(f.freq.toLowerCase())) return false;
      if (f.unit       && (r.band ?? "") !== f.unit)                                 return false;
      if (f.intKeyword && !(r.label ?? "").toLowerCase().includes(f.intKeyword.toLowerCase())) return false;
      if (f.dateFrom && r.created_at < f.dateFrom)                                   return false;
      if (f.dateTo   && r.created_at.slice(0, 10) > f.dateTo)                        return false;
      return true;
    });
  }, [effectiveRows, q, satMap, freqFilter]);

  // ── Sorting ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "satellite") {
        const sa = (a._mock ? (a._satName ?? "") : (satMap[a.satellite_id]?.name ?? "")).toLowerCase();
        const sb = (b._mock ? (b._satName ?? "") : (satMap[b.satellite_id]?.name ?? "")).toLowerCase();
        cmp = sa.localeCompare(sb);
      } else if (sortKey === "unit") {
        const ua = UNIT_ORDER[a.band ?? ""] ?? 999;
        const ub = UNIT_ORDER[b.band ?? ""] ?? 999;
        cmp = ua - ub;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, satMap]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  // Sort icon helper
  const sortIcon = (col: SortKey) => {
    if (sortKey !== col)
      return <ChevronsUpDown className="h-3 w-3 opacity-40 ml-0.5 shrink-0" />;
    return sortDir === "asc"
      ? <ChevronUp   className="h-3 w-3 ml-0.5 shrink-0 text-primary" />
      : <ChevronDown className="h-3 w-3 ml-0.5 shrink-0 text-primary" />;
  };

  // ── Selection helpers ─────────────────────────────────────────────────────────
  const visibleIds = sorted.map((r) => r.id);
  const selectAll  = allSelected(visibleIds, selectedIds);
  const isFiltered = sorted.length !== effectiveRows.length;

  function toggleId(id: string)    { setSelectedIds((s) => toggleSelection(s, id)); }
  function clearSelection()        { setSelectedIds(new Set()); }
  function handleSelectAll()       { setSelectedIds(selectAll ? new Set() : new Set(visibleIds)); }
  function setF<K extends keyof FreqFilter>(k: K, v: string) { setFreqFilter((f) => ({ ...f, [k]: v })); }
  function clearFilter()           { setFreqFilter(EMPTY_FREQ_FILTER); setSelectedIds(new Set()); }

  // ── Export helpers ────────────────────────────────────────────────────────────
  function exportRows(list: FreqRow[], label: string) {
    if (list.length === 0) { toast.error("No records to export."); return; }
    const csv = buildCsv(
      ["#", "Satellite", "Frequency", "Unit", "Date of Report", "INT Notes"],
      list.map((r, i) => {
        const satName = r._mock ? (r._satName ?? "") : (satMap[r.satellite_id]?.name ?? "");
        return [i + 1, satName, r.frequency, r.band ?? "", fmtDate(r.created_at), r.label ?? ""];
      }),
    );
    downloadCsv(`important-frequencies-${label}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`${list.length} record${list.length !== 1 ? "s" : ""} exported.`);
  }

  // ── Advanced Features actions ─────────────────────────────────────────────────
  function exportAllCsv() {
    exportRows(effectiveRows, "all");
    setAdvancedOpen(false);
  }

  async function clearAllEntries() {
    const { error } = await supabase.from("important_frequencies").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["important"] });
    toast.success("All frequency entries cleared");
    setClearConfirm(false);
    setAdvancedOpen(false);
  }

  // ── Row actions ──────────────────────────────────────────────────────────────
  async function deleteRow(id: string) {
    const { error } = await supabase.from("important_frequencies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Frequency removed");
    qc.invalidateQueries({ queryKey: ["important"] });
    if (expandedId === id) setExpandedId(null);
  }

  function logScan(freqId: string) {
    if (!scanForm.observation.trim()) return;
    const entry: ScanEntry = {
      id: `scan-${Date.now()}`,
      unit:        scanForm.unit,
      date:        scanForm.date,
      observation: scanForm.observation.trim(),
    };
    setScanHistory((prev) => ({
      ...prev,
      [freqId]: [...(prev[freqId] ?? []), entry],
    }));
    toast.success(`Scan logged for ${scanForm.unit}`);
    setScanForm({
      unit: UNIT_LABELS[0],
      date: new Date().toISOString().slice(0, 10),
      observation: "",
    });
    setAddScanForId(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Search + Controls bar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search frequency, satellite, unit, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-7 mono text-xs"
          />
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-sm border mono text-[11px] uppercase tracking-wider transition-colors shrink-0
                      ${filterOpen ? "border-primary/50 bg-primary/10 text-primary" : "border-border hover:bg-secondary text-muted-foreground hover:text-foreground"}`}
        >
          <Filter className="h-3.5 w-3.5" /> Filter
        </button>

        {/* Export buttons */}
        <button
          type="button"
          onClick={() => exportRows(effectiveRows, "all")}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-sm border border-border mono text-[11px] uppercase tracking-wider hover:bg-secondary transition-colors shrink-0"
        >
          <Download className="h-3.5 w-3.5" /> Export All
        </button>
        {isFiltered && (
          <button
            type="button"
            onClick={() => exportRows(sorted, "filtered")}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-sm border border-primary/40 mono text-[11px] uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors shrink-0"
          >
            <Download className="h-3.5 w-3.5" /> Export Filtered ({sorted.length})
          </button>
        )}

        {canEdit && (
          <Button
            size="sm"
            className="h-9 mono text-[11px] uppercase tracking-wider shrink-0"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Frequency
          </Button>
        )}
      </div>

      {/* ── Filter panel ──────────────────────────────────────────────────────── */}
      {filterOpen && (
        <div className="mb-2 rounded-sm border border-border bg-secondary/10 px-3 py-2.5 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <input
              className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Satellite name…"
              value={freqFilter.sat}
              onChange={(e) => setF("sat", e.target.value)}
            />
            <input
              className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Frequency (e.g. 3785 MHz)…"
              value={freqFilter.freq}
              onChange={(e) => setF("freq", e.target.value)}
            />
            <select
              className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={freqFilter.unit}
              onChange={(e) => setF("unit", e.target.value)}
            >
              <option value="">Unit — all</option>
              {UNIT_LABELS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input
              type="date"
              className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              title="Date of report — from"
              value={freqFilter.dateFrom}
              onChange={(e) => setF("dateFrom", e.target.value)}
            />
            <input
              type="date"
              className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              title="Date of report — to"
              value={freqFilter.dateTo}
              onChange={(e) => setF("dateTo", e.target.value)}
            />
            <input
              className="h-7 px-2 rounded-sm border border-border bg-background mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="INT notes keyword…"
              value={freqFilter.intKeyword}
              onChange={(e) => setF("intKeyword", e.target.value)}
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
      )}

      {/* ── Record counts + bulk bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2 mono text-[10px] text-muted-foreground">
        <span>Total: <span className="text-foreground font-bold">{effectiveRows.length}</span></span>
        {isFiltered && (
          <span>Filtered: <span className="text-primary font-bold">{sorted.length}</span></span>
        )}
        {selectedIds.size > 0 && (
          <>
            <span>Selected: <span className="text-primary font-bold">{selectedIds.size}</span></span>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => exportRows(sorted.filter((r) => selectedIds.has(r.id)), "selected")}
              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
            >
              <Download className="h-3 w-3" /> Export Selected
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button type="button" onClick={() => setSelectedIds(new Set(visibleIds))}
              className="hover:text-foreground transition-colors">
              Select All Visible ({sorted.length})
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button type="button" onClick={clearSelection}
              className="hover:text-destructive transition-colors">
              Clear
            </button>
          </>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <Empty
          title="No important frequencies logged"
          hint="Click 'Add Frequency' to log the first entry."
        />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          {/* Mock data notice */}
          {rows.length === 0 && (
            <div className="px-3 py-1.5 bg-primary/5 border-b border-border flex items-center gap-1.5">
              <span className="mono text-[10px] text-primary/70 font-bold uppercase tracking-wider">
                Sample Data
              </span>
              <span className="mono text-[10px] text-muted-foreground">
                — No live entries found. Showing visualisation data. Add a real entry to replace this view.
              </span>
            </div>
          )}
          <table className="w-full text-[11px] mono border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {/* Select-all checkbox */}
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    title="Select / deselect all visible"
                    className="cursor-pointer accent-primary"
                  />
                </th>
                <th className="px-3 py-2 text-left text-muted-foreground font-medium w-8">#</th>

                {/* Sortable: Satellite */}
                <th
                  className="px-3 py-2 text-left text-muted-foreground font-medium
                             cursor-pointer hover:text-foreground select-none min-w-[120px]"
                  onClick={() => toggleSort("satellite")}
                >
                  <span className="inline-flex items-center">
                    Satellite{sortIcon("satellite")}
                  </span>
                </th>

                <th className="px-3 py-2 text-left text-muted-foreground font-medium min-w-[110px]">Frequency</th>

                {/* Sortable: Unit */}
                <th
                  className="px-3 py-2 text-left text-muted-foreground font-medium
                             cursor-pointer hover:text-foreground select-none min-w-[90px]"
                  onClick={() => toggleSort("unit")}
                >
                  <span className="inline-flex items-center">
                    Unit{sortIcon("unit")}
                  </span>
                </th>

                <th className="px-3 py-2 text-left text-muted-foreground font-medium w-28">Date of Report</th>
                <th className="px-3 py-2 text-left text-muted-foreground font-medium min-w-[140px]">INT</th>
                <th className="px-3 py-2 text-right text-muted-foreground font-medium w-28">Actions</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((row, idx) => {
                const satName    = row._mock ? (row._satName ?? "—") : (satMap[row.satellite_id]?.name ?? "—");
                const scans      = scanHistory[row.id] ?? [];
                const isExpanded = expandedId === row.id;
                const checked    = selectedIds.has(row.id);

                return (
                  <Fragment key={row.id}>
                    {/* ── Main data row ─────────────────────────────────── */}
                    <tr
                      className={`border-b border-border transition-colors cursor-pointer
                                  ${checked ? "bg-primary/8" : isExpanded ? "bg-secondary/30" : "hover:bg-secondary/20"}`}
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    >
                      {/* Checkbox cell — stopPropagation so row expand doesn't fire */}
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked} onChange={() => toggleId(row.id)}
                          className="cursor-pointer accent-primary" />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>

                      <td className="px-3 py-2">
                        <div className="font-bold text-foreground uppercase tracking-tight leading-tight">
                          {satName}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Radio className="h-3 w-3 text-primary shrink-0" />
                          <span className="font-bold text-foreground">{row.frequency}</span>
                        </div>
                      </td>

                      <td className="px-3 py-2 text-foreground">
                        {row.band || "—"}
                      </td>

                      <td className="px-3 py-2 text-muted-foreground tabular-nums">
                        {fmtDate(row.created_at)}
                      </td>

                      <td className="px-3 py-2 text-muted-foreground max-w-[200px]">
                        <div className="truncate" title={row.label ?? ""}>{row.label || "—"}</div>
                      </td>

                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">

                          {/* Multi-scan badge — shows count when ≥ 1 scan logged */}
                          {scans.length > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm
                                         bg-primary/15 border border-primary/30 text-primary
                                         mono text-[9px] font-bold cursor-default"
                              title={`${scans.length} scan report${scans.length !== 1 ? "s" : ""} logged`}
                            >
                              ★ {scans.length}
                            </span>
                          )}

                          {/* Expand / collapse */}
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : row.id)}
                            title={isExpanded ? "Collapse" : "Expand scan history"}
                            className="h-6 w-6 grid place-items-center rounded-sm border border-border
                                       hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded
                              ? <ChevronUp   className="h-3 w-3" />
                              : <ChevronDown className="h-3 w-3" />}
                          </button>

                          {/* Delete — hidden for mock/sample rows */}
                          {canEdit && !row._mock && (
                            <button
                              type="button"
                              onClick={() => deleteRow(row.id)}
                              title="Delete frequency entry"
                              className="h-6 w-6 grid place-items-center rounded-sm border border-destructive/30
                                         hover:bg-destructive/10 transition-colors text-destructive/60 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded scan history panel ────────────────────── */}
                    {isExpanded && (
                      <tr className="border-b border-border bg-secondary/10">
                        <td colSpan={8} className="px-5 py-3">
                          <div className="space-y-2.5">

                            {/* Header */}
                            <div className="label-eyebrow flex items-center gap-1.5">
                              <Radio className="h-2.5 w-2.5" />
                              Frequency: <span className="text-foreground font-bold">{row.frequency}</span>
                              {satName !== "—" && (
                                <span className="text-muted-foreground/60">— {satName}</span>
                              )}
                              — Unit Scan History
                            </div>

                            {/* Scan history table */}
                            {scans.length === 0 ? (
                              <p className="mono text-[11px] text-muted-foreground italic">
                                No scan reports logged yet. Use "Log Scan" to add traceability entries.
                              </p>
                            ) : (
                              <table className="w-full text-[11px] mono border-collapse">
                                <thead>
                                  <tr className="border-b border-border">
                                    <th className="pb-1 pr-5 text-left text-muted-foreground font-medium">Unit</th>
                                    <th className="pb-1 pr-5 text-left text-muted-foreground font-medium">Date</th>
                                    <th className="pb-1 text-left text-muted-foreground font-medium">Observation / Result</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {scans.map((scan) => (
                                    <tr key={scan.id}>
                                      <td className="py-1.5 pr-5 font-bold text-foreground">{scan.unit}</td>
                                      <td className="py-1.5 pr-5 text-muted-foreground tabular-nums">{fmtDate(scan.date)}</td>
                                      <td className="py-1.5 text-foreground">{scan.observation}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}

                            {/* Log new scan — toggle inline form */}
                            {addScanForId === row.id ? (
                              <div className="border border-border rounded-sm p-3 bg-background space-y-2">
                                <div className="label-eyebrow mb-1">Log New Scan</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="label-eyebrow">Reporting Unit</Label>
                                    <Select
                                      value={scanForm.unit}
                                      onValueChange={(v) => setScanForm((f) => ({ ...f, unit: v }))}
                                    >
                                      <SelectTrigger className="mt-1 h-8 mono text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {UNIT_LABELS.map((u) => (
                                          <SelectItem key={u} value={u} className="mono text-xs">{u}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="label-eyebrow">Date of Scan</Label>
                                    <Input
                                      type="date"
                                      className="mt-1 h-8 mono text-xs"
                                      value={scanForm.date}
                                      onChange={(e) => setScanForm((f) => ({ ...f, date: e.target.value }))}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <Label className="label-eyebrow">Observation / Result *</Label>
                                  <Textarea
                                    className="mt-1 mono text-xs resize-none"
                                    rows={2}
                                    value={scanForm.observation}
                                    onChange={(e) => setScanForm((f) => ({ ...f, observation: e.target.value }))}
                                    placeholder="e.g. Active carrier detected, interference noted, measured −72 dBm…"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mono uppercase tracking-wider"
                                    onClick={() => setAddScanForId(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="mono uppercase tracking-wider"
                                    disabled={!scanForm.observation.trim()}
                                    onClick={() => logScan(row.id)}
                                  >
                                    Log Scan
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 mono text-[10px] uppercase tracking-wider"
                                onClick={() => setAddScanForId(row.id)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Log Scan
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Advanced Features — bottom-right (mirrors Resource Inventory) ── */}
      <div className="mt-4 flex items-center justify-end gap-2">
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

      {/* ── Advanced Features dialog ────────────────────────────────────────── */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advanced Features</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="justify-start" onClick={exportAllCsv}>
              <Download className="h-4 w-4 mr-2" /> Export All as CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={() => { setAdvancedOpen(false); setClearConfirm(true); }}
              disabled={rows.length === 0}
            >
              <X className="h-4 w-4 mr-2" /> Clear All Entries
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Clear All confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Frequency Entries?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all frequency records from the database. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={clearAllEntries}
              className="bg-muted text-muted-foreground hover:bg-muted/80 border border-border shadow-none"
            >
              YES, CLEAR ALL
            </AlertDialogAction>
            <AlertDialogCancel className="bg-primary text-primary-foreground hover:bg-primary/90 border-0">
              NO
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add Frequency dialog ────────────────────────────────────────────── */}
      <AddFrequencyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        sats={sats}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["important"] });
          setAddOpen(false);
        }}
      />
    </>
  );
}

// ─── Add Frequency dialog ─────────────────────────────────────────────────────

const EMPTY_ADD_FORM = {
  satelliteId: "",
  frequency:   "",
  unit:        UNIT_LABELS[0],
  notes:       "",
};

function AddFrequencyDialog({
  open,
  onClose,
  sats,
  onSaved,
}: {
  open:    boolean;
  onClose: () => void;
  sats:    any[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState(EMPTY_ADD_FORM);
  const [busy, setBusy] = useState(false);

  function f<K extends keyof typeof EMPTY_ADD_FORM>(k: K, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.satelliteId || !form.frequency.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("important_frequencies").insert({
      satellite_id: form.satelliteId,
      frequency:    form.frequency.trim(),
      band:         form.unit,            // unit stored in band column
      label:        form.notes.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Frequency entry added");
    setForm(EMPTY_ADD_FORM);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setForm(EMPTY_ADD_FORM); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" /> Add Frequency Entry
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="label-eyebrow">Satellite *</Label>
            <Select value={form.satelliteId} onValueChange={(v) => f("satelliteId", v)}>
              <SelectTrigger className="mt-1 mono text-xs">
                <SelectValue placeholder="Select satellite…" />
              </SelectTrigger>
              <SelectContent>
                {sats.map((s: any) => (
                  <SelectItem key={s.id} value={s.id} className="mono text-xs">{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="label-eyebrow">Frequency *</Label>
            <Input
              required
              className="mt-1 mono text-xs"
              value={form.frequency}
              onChange={(e) => f("frequency", e.target.value)}
              placeholder="e.g. 3785 MHz or 11.470 GHz"
            />
          </div>

          <div>
            <Label className="label-eyebrow">Reporting Unit</Label>
            <Select value={form.unit} onValueChange={(v) => f("unit", v)}>
              <SelectTrigger className="mt-1 mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIT_LABELS.map((u) => (
                  <SelectItem key={u} value={u} className="mono text-xs">{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="label-eyebrow">INT Notes</Label>
            <Textarea
              className="mt-1 mono text-xs resize-none"
              rows={2}
              value={form.notes}
              onChange={(e) => f("notes", e.target.value)}
              placeholder="Intelligence notes, signal characteristics, observations…"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 mono uppercase tracking-wider"
              onClick={() => { onClose(); setForm(EMPTY_ADD_FORM); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="flex-1 mono uppercase tracking-wider"
              disabled={busy || !form.satelliteId || !form.frequency.trim()}
            >
              {busy ? "Saving…" : "Add Entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
