import { createFileRoute, redirect } from "@tanstack/react-router";
import { ccHubSearch } from "@/lib/controlCenter";
import {
  clearImportant,
  getImportantFrequencyRefs,
  getFrequencyState,
  INTEL_FREQ_EVENT,
} from "@/lib/intelFrequencyActions";
import { ImportantFrequencyMetadata } from "@/components/intel/FrequencyStateSymbols";
import { VISIBILITY_SATELLITE_PROFILES } from "@/lib/intelAnalysisData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { listSatellites } from "@/lib/queries";
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
import { useCanEdit, useAuth } from "@/lib/auth";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  FileText,
  Filter,
  Plus,
  Radio,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { validateImportFile, buildCsv, downloadCsv, ACCEPTED_SPREADSHEET_ACCEPT, readSpreadsheetFile, toggleSelection, allSelected } from "@/lib/dataTableUtils";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/important")({
  beforeLoad: () => {
    throw redirect({ to: "/control-center", search: ccHubSearch("important") });
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

/** Table + import schema — column order must match exactly. */
const TABLE_HEADERS = ["Satellite", "Frequency", "Unit", "Date of Report", "INT Notes"] as const;
const FREQ_GRID_COLS =
  "[grid-template-columns:1.5rem_1.5rem_minmax(0,1.05fr)_minmax(0,0.88fr)_minmax(2.75rem,0.62fr)_3.5rem_minmax(5rem,1.75fr)_4.5rem]";

type FreqRow = {
  id: string;
  satellite_id: string;
  frequency: string;
  band: string | null;
  label: string | null;
  created_at: string;
  _mock?: true;
  _satName?: string;
  _refKey?: string;
  _polarization?: string;
};

const IMPORTANT_FREQUENCIES_KEY = "ssacc_important_frequencies";

type StoredImportantFrequency = Omit<
  FreqRow,
  "_mock" | "_satName" | "_refKey" | "_polarization"
>;

function loadImportantFrequencies(): StoredImportantFrequency[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(IMPORTANT_FREQUENCIES_KEY);
    return raw ? (JSON.parse(raw) as StoredImportantFrequency[]) : [];
  } catch {
    return [];
  }
}

function saveImportantFrequencies(rows: StoredImportantFrequency[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(IMPORTANT_FREQUENCIES_KEY, JSON.stringify(rows));
}

function insertImportantFrequencies(
  entries: Omit<StoredImportantFrequency, "id">[],
): void {
  const existing = loadImportantFrequencies();
  const next = [
    ...entries.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
    })),
    ...existing,
  ];
  saveImportantFrequencies(next);
}

function deleteImportantFrequency(id: string): void {
  saveImportantFrequencies(loadImportantFrequencies().filter((row) => row.id !== id));
}

function clearImportantFrequencies(): void {
  saveImportantFrequencies([]);
}

// Demo rows — shown when the local store is empty (layout preview only).
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

function fmtDateCompact(iso: string): string {
  if (!iso || iso === "—") return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function sortReportingUnits(units: Set<string>): string[] {
  return [...units].sort((a, b) => (UNIT_ORDER[a] ?? 999) - (UNIT_ORDER[b] ?? 999));
}

function resolveRowPolarization(row: FreqRow, satName: string): string {
  if (row._polarization) return row._polarization;
  return VISIBILITY_SATELLITE_PROFILES[satName]?.defaultPolarization ?? "—";
}

/** MHz value only — strips INT drill-down polarization prefix from stored frequency IDs. */
function displayFrequencyMhz(stored: string): string {
  const v = stored.trim();
  const prefixed = v.match(/^(?:[A-Z0-9]+(?:-[A-Z0-9]+)*)-([\d.]+\s*MHz(?:\s*\([^)]*\))?)$/i);
  if (prefixed) return prefixed[1].trim();
  const suffixed = v.match(/^([\d.]+\s*MHz)\s*\([A-Z0-9-]+\)$/i);
  if (suffixed) return suffixed[1].trim();
  return v;
}

const TOOLBAR_ICON_BTN =
  "h-9 w-9 grid place-items-center rounded-sm border transition-colors shrink-0";
const TOOLBAR_ICON_BTN_IDLE =
  `${TOOLBAR_ICON_BTN} border-border hover:bg-secondary text-muted-foreground hover:text-foreground`;
const TOOLBAR_ICON_BTN_ACTIVE =
  `${TOOLBAR_ICON_BTN} border-primary/50 bg-primary/10 text-primary`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ImportantFrequenciesView() {
  const canEdit  = useCanEdit();
  const { user } = useAuth();
  const userLabel = user?.email ?? "Operator";
  const qc       = useQueryClient();
  const [q, setQ]                       = useState("");
  const [sortKey, setSortKey]           = useState<SortKey | null>(null);
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [addOpen,         setAddOpen]         = useState(false);
  const [advancedOpen,    setAdvancedOpen]    = useState(false);
  const [clearConfirm,    setClearConfirm]    = useState(false);
  const [filterOpen,      setFilterOpen]      = useState(false);
  const [freqFilter,      setFreqFilter]      = useState<FreqFilter>(EMPTY_FREQ_FILTER);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [bulkDeleteOpen,  setBulkDeleteOpen]  = useState(false);
  const [hiddenRowIds,    setHiddenRowIds]    = useState<Set<string>>(new Set());
  const [unitsDialog,     setUnitsDialog]     = useState<{ freqLabel: string; units: string[] } | null>(null);
  const [refSync, setRefSync] = useState(0);

  useEffect(() => {
    const h = () => setRefSync((n) => n + 1);
    window.addEventListener(INTEL_FREQ_EVENT, h);
    return () => window.removeEventListener(INTEL_FREQ_EVENT, h);
  }, []);

  // ── Data queries ─────────────────────────────────────────────────────────────
  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const { data: rows = [] } = useQuery({
    queryKey: ["important"],
    queryFn: () => loadImportantFrequencies(),
  });

  const satMap = useMemo(
    () => Object.fromEntries(sats.map((s: any) => [s.id, s])),
    [sats],
  );

  // ── Effective row set: DB (or demo rows) + INT cross-module refs ─────────────
  const effectiveRows = useMemo(() => {
    const base = rows.length > 0 ? (rows as FreqRow[]) : MOCK_FREQUENCIES;
    const refs = getImportantFrequencyRefs()
      .filter((ref) => !getFrequencyState(ref.refKey).flags.discarded)
      .map(
      (ref): FreqRow => ({
        id: ref.id,
        satellite_id: "",
        frequency: ref.frequency,
        band: ref.unitLabel,
        label: `[INT ref] ${ref.satelliteName}${ref.beamName ? ` · ${ref.beamName}` : ""}`,
        created_at: ref.createdAt,
        _mock: true,
        _satName: ref.satelliteName,
        _refKey: ref.refKey,
        _polarization: ref.polarization,
      }),
    );
    const dedupedBase = base.filter((r) => {
      const satName = r._mock ? (r._satName ?? "") : (satMap[r.satellite_id]?.name ?? "");
      return !refs.some((ref) => ref.frequency === r.frequency && ref._satName === satName);
    });
    return [...refs, ...dedupedBase].filter((r) => !hiddenRowIds.has(r.id));
  }, [rows, refSync, satMap, hiddenRowIds]);

  /** Distinct reporting units per satellite + frequency (mock scan history + row unit). */
  const reportingUnitsByKey = useMemo(() => {
    const byKey = new Map<string, Set<string>>();
    for (const row of effectiveRows) {
      const satName = row._mock ? (row._satName ?? "") : (satMap[row.satellite_id]?.name ?? "");
      const key = `${satName}::${row.frequency}`;
      const units = byKey.get(key) ?? new Set<string>();
      if (row.band) units.add(row.band);
      for (const scan of MOCK_SCAN_HISTORY[row.id] ?? []) units.add(scan.unit);
      byKey.set(key, units);
    }
    const sorted = new Map<string, string[]>();
    for (const [key, units] of byKey) sorted.set(key, sortReportingUnits(units));
    return sorted;
  }, [effectiveRows, satMap]);

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
      if (f.dateFrom && r.created_at && r.created_at < f.dateFrom)                                   return false;
      if (f.dateTo   && r.created_at && r.created_at.slice(0, 10) > f.dateTo)                        return false;
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

  function downloadPublicExcelTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([TABLE_HEADERS as unknown as string[]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Important Frequencies");
    XLSX.writeFile(wb, "important-frequencies-template.xlsx");
  }

  function clearAllEntries() {
    clearImportantFrequencies();
    qc.invalidateQueries({ queryKey: ["important"] });
    toast.success("All frequency entries cleared");
    setClearConfirm(false);
    setAdvancedOpen(false);
  }

  // ── Row actions ──────────────────────────────────────────────────────────────
  function deleteRow(id: string) {
    deleteImportantFrequency(id);
    toast.success("Frequency removed");
    qc.invalidateQueries({ queryKey: ["important"] });
  }

  function removeIntRef(refKey: string) {
    clearImportant(refKey, userLabel);
    toast.success("Removed from Important Frequencies");
    setRefSync((n) => n + 1);
  }

  function dismissLocalRow(id: string) {
    setHiddenRowIds((prev) => new Set(prev).add(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.success("Frequency removed");
  }

  function removeRow(row: FreqRow) {
    if (row._refKey) {
      removeIntRef(row._refKey);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      return;
    }
    if (row._mock || row.id.startsWith("mock-")) {
      dismissLocalRow(row.id);
      return;
    }
    deleteRow(row.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Search + Controls bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search frequency, satellite, unit, notes…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-7 mono text-xs"
            />
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {canEdit && (
              <ImportFrequencyButton
                iconOnly
                sats={sats}
                onImported={() => qc.invalidateQueries({ queryKey: ["important"] })}
              />
            )}
            <button
              type="button"
              onClick={() => exportRows(effectiveRows, "all")}
              title="Export all frequencies"
              className={TOOLBAR_ICON_BTN_IDLE}
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            {isFiltered && (
              <button
                type="button"
                onClick={() => exportRows(sorted, "filtered")}
                title={`Export filtered results (${sorted.length})`}
                className={`${TOOLBAR_ICON_BTN} border-primary/40 text-primary hover:bg-primary/10`}
              >
                <Upload className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={downloadPublicExcelTemplate}
              title="Public Excel file (import template)"
              className={TOOLBAR_ICON_BTN_IDLE}
            >
              <FileText className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              title="Filter frequencies"
              className={filterOpen ? TOOLBAR_ICON_BTN_ACTIVE : TOOLBAR_ICON_BTN_IDLE}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              size="sm"
              className="h-9 px-5 mono text-[11px] uppercase tracking-wider font-bold shadow-md
                         bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add Frequency
            </Button>
          </div>
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
              <Upload className="h-3 w-3" /> Export Selected
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
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors"
            >
              Delete Selected
            </button>
          </>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-10 text-center mono text-[11px] text-muted-foreground">
          No entries recorded.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-x-hidden">
          <div
            className={`grid ${FREQ_GRID_COLS} gap-x-1 items-center border-b border-border bg-secondary/50 px-1 py-1.5 sticky top-0 z-10`}
          >
            <div className="flex justify-center">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={handleSelectAll}
                title="Select / deselect all visible"
                className="cursor-pointer accent-primary"
              />
            </div>
            <FreqTh>#</FreqTh>
            <FreqTh sortable onClick={() => toggleSort("satellite")}>
              Satellite{sortIcon("satellite")}
            </FreqTh>
            <FreqTh>Frequency</FreqTh>
            <FreqTh sortable onClick={() => toggleSort("unit")}>
              Unit{sortIcon("unit")}
            </FreqTh>
            <FreqTh>Date</FreqTh>
            <FreqTh>INT</FreqTh>
            <FreqTh align="right">Actions</FreqTh>
          </div>

          {sorted.map((row, idx) => {
            const satKey     = row._mock ? (row._satName ?? "") : (satMap[row.satellite_id]?.name ?? "");
            const satName    = satKey || "—";
            const freqKey    = `${satKey}::${row.frequency}`;
            const reportingUnits = reportingUnitsByKey.get(freqKey) ?? [];
            const unitCount  = reportingUnits.length;
            const checked    = selectedIds.has(row.id);

            return (
                <div
                  key={row.id}
                  className={`grid ${FREQ_GRID_COLS} gap-x-1 items-center border-b border-border px-1 py-1.5
                              transition-colors
                              ${checked ? "bg-primary/8" : "hover:bg-secondary/20"}`}
                >
                  <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checked} onChange={() => toggleId(row.id)}
                      className="cursor-pointer accent-primary" />
                  </div>
                  <div className="mono text-[11px] text-muted-foreground tabular-nums text-center">{idx + 1}</div>
                  <div className="mono text-[11px] font-bold text-foreground uppercase leading-tight min-w-0">
                    {satName}
                    <ImportantFrequencyMetadata
                      refKey={row._refKey}
                      polarization={resolveRowPolarization(row, satName)}
                      tick={refSync}
                    />
                  </div>
                  <div className="flex items-center gap-1 min-w-0">
                    <Radio className="h-3 w-3 text-primary shrink-0" />
                    <span className="mono text-[11px] font-bold text-foreground">{displayFrequencyMhz(row.frequency)}</span>
                  </div>
                  <div className="mono text-[11px] text-foreground">{row.band || "—"}</div>
                  <div className="mono text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{fmtDateCompact(row.created_at)}</div>
                  <div className="mono text-[11px] text-foreground leading-snug break-words whitespace-normal overflow-visible min-w-0">
                    {row.label || "—"}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {unitCount > 1 && (
                      <button
                        type="button"
                        title={`Reported by ${unitCount} units — click to view`}
                        onClick={() =>
                          setUnitsDialog({
                            freqLabel: `${satName} · ${displayFrequencyMhz(row.frequency)}`,
                            units: reportingUnits,
                          })
                        }
                        className="inline-flex flex-col items-center justify-center min-w-[1.25rem] px-0.5 py-0.5 rounded-sm
                                   bg-primary/15 border border-primary/30 text-primary leading-none
                                   hover:bg-primary/25 transition-colors cursor-pointer"
                      >
                        <span className="text-[10px] leading-none">★</span>
                        <span className="mono text-[9px] font-bold tabular-nums leading-none mt-0.5">{unitCount}</span>
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRow(row);
                        }}
                        title="Remove frequency entry"
                        className="h-6 w-6 grid place-items-center rounded-sm border border-destructive/30
                                   hover:bg-destructive/10 transition-colors text-destructive/60 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
            );
          })}
        </div>
      )}

      {/* ── Reporting units dialog ─────────────────────────────────────────── */}
      <Dialog open={unitsDialog !== null} onOpenChange={(open) => { if (!open) setUnitsDialog(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm">
              Reporting Units
            </DialogTitle>
          </DialogHeader>
          {unitsDialog && (
            <>
              <p className="mono text-[10px] text-muted-foreground">{unitsDialog.freqLabel}</p>
              <ul className="space-y-1 mt-2">
                {unitsDialog.units.map((unit) => (
                  <li key={unit} className="mono text-[11px] font-bold text-foreground">
                    {unit}
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>

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

      {/* ── Bulk Delete confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              Delete Selected Entries
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              Delete {selectedIds.size} selected frequency entr{selectedIds.size !== 1 ? "ies" : "y"}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="mono text-[11px] uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                sorted.filter((r) => selectedIds.has(r.id)).forEach((r) => removeRow(r));
                clearSelection();
                setBulkDeleteOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Clear All confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Frequency Entries?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all saved frequency records. This cannot be undone.
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.satelliteId || !form.frequency.trim()) return;
    setBusy(true);
    insertImportantFrequencies([
      {
        satellite_id: form.satelliteId,
        frequency: form.frequency.trim(),
        band: form.unit,
        label: form.notes.trim() || null,
        created_at: new Date().toISOString(),
      },
    ]);
    setBusy(false);
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
              className="flex-1 mono uppercase tracking-wider font-bold"
              disabled={busy || !form.satelliteId || !form.frequency.trim()}
            >
              {busy ? "Saving…" : "Add Entry"}
            </Button>
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Or import from file
            </div>
            <ImportFrequencyFileInput
              sats={sats}
              compact
              onImported={() => {
                setForm(EMPTY_ADD_FORM);
                onSaved();
              }}
            />
            <p className="mono text-[9px] text-muted-foreground leading-snug">
              Columns required: {TABLE_HEADERS.join(", ")}
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Table header cell ────────────────────────────────────────────────────────

function FreqTh({
  children,
  sortable,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  sortable?: boolean;
  onClick?: () => void;
  align?: "left" | "right";
}) {
  const alignCls = align === "right" ? "text-right justify-end" : "text-left";
  return (
    <div
      className={`mono text-[9px] uppercase tracking-wide text-muted-foreground font-medium
                  flex items-center min-w-0 ${alignCls} ${sortable ? "cursor-pointer hover:text-foreground select-none" : ""}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ─── CSV / Excel import ───────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.replace(/^"|"$/g, "").trim().toLowerCase();
}

function validateImportHeaders(headerRow: string[]): string | null {
  if (headerRow.length !== TABLE_HEADERS.length) {
    return `Expected ${TABLE_HEADERS.length} columns (${TABLE_HEADERS.join(", ")}), found ${headerRow.length}.`;
  }
  for (let i = 0; i < TABLE_HEADERS.length; i++) {
    if (normalizeHeader(headerRow[i] ?? "") !== TABLE_HEADERS[i].toLowerCase()) {
      return `Column ${i + 1} must be "${TABLE_HEADERS[i]}", found "${headerRow[i] ?? ""}".`;
    }
  }
  return null;
}

function parseReportDateForImport(raw: string): string | null {
  const t = raw.trim();
  if (!t) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function ImportFrequencyButton({
  sats,
  onImported,
  iconOnly,
}: {
  sats: any[];
  onImported: () => void;
  iconOnly?: boolean;
}) {
  return (
    <ImportFrequencyFileInput
      sats={sats}
      onImported={onImported}
      iconOnly={iconOnly}
      trigger={
        iconOnly ? (
          <button
            type="button"
            title="Import CSV / Excel"
            className={`${TOOLBAR_ICON_BTN_IDLE} border-primary/40 hover:bg-primary/10`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 mono text-[11px] uppercase tracking-wider border-primary/40 hover:bg-primary/10"
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Import CSV / Excel
          </Button>
        )
      }
    />
  );
}

function ImportFrequencyFileInput({
  sats,
  onImported,
  compact,
  iconOnly,
  trigger,
}: {
  sats: any[];
  onImported: () => void;
  compact?: boolean;
  iconOnly?: boolean;
  trigger?: React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const check = validateImportFile(file);
    if (!check.ok) { toast.error(check.error); return; }

    setBusy(true);
    try {
      const rows = await readSpreadsheetFile(file);
      if (rows.length < 2) {
        toast.error("File has no data rows.");
        return;
      }

      const headerErr = validateImportHeaders(rows[0]);
      if (headerErr) {
        toast.error(`Schema mismatch: ${headerErr}`);
        return;
      }

      const satByName = new Map(
        sats.map((s: any) => [String(s.name).trim().toLowerCase(), s.id as string]),
      );

      const inserts: {
        satellite_id: string;
        frequency: string;
        band: string;
        label: string | null;
        created_at: string;
      }[] = [];

      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i];
        if (cells.every((c) => !c.trim())) continue;
        if (cells.length !== TABLE_HEADERS.length) {
          toast.error(`Row ${i + 1}: expected ${TABLE_HEADERS.length} columns, found ${cells.length}.`);
          return;
        }

        const [satName, frequency, unit, dateRaw, notes] = cells;
        if (!satName.trim() || !frequency.trim()) {
          toast.error(`Row ${i + 1}: Satellite and Frequency are required.`);
          return;
        }

        const satellite_id = satByName.get(satName.trim().toLowerCase());
        if (!satellite_id) {
          toast.error(`Row ${i + 1}: unknown satellite "${satName.trim()}".`);
          return;
        }

        const created_at = parseReportDateForImport(dateRaw);
        if (!created_at) {
          toast.error(`Row ${i + 1}: invalid date "${dateRaw}".`);
          return;
        }

        inserts.push({
          satellite_id,
          frequency: frequency.trim(),
          band: unit.trim() || UNIT_LABELS[0],
          label: notes.trim() || null,
          created_at,
        });
      }

      if (inserts.length === 0) {
        toast.error("No valid rows to import.");
        return;
      }

      insertImportantFrequencies(inserts);

      toast.success(`Imported ${inserts.length} frequenc${inserts.length === 1 ? "y" : "ies"}.`);
      onImported();
    } catch {
      toast.error("Failed to read file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_SPREADSHEET_ACCEPT}
        className="hidden"
        onChange={handleFile}
      />
      {trigger ? (
        <div onClick={() => !busy && fileRef.current?.click()} className={busy ? "opacity-50 pointer-events-none" : ""}>
          {trigger}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`w-full mono text-[10px] uppercase tracking-wider ${compact ? "h-8" : "h-9"}`}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          title="Import CSV / Excel"
        >
          <Download className={iconOnly ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1"} />
          {!iconOnly && (busy ? "Importing…" : "Browse File")}
        </Button>
      )}
    </>
  );
}
