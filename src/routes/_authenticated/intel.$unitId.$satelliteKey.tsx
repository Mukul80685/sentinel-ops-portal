import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Archive,
  ArrowLeft,
  Download,
  Filter,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  validateImportFile,
  buildCsv,
  downloadCsv,
  toggleSelection,
  allSelected,
} from "@/lib/dataTableUtils";
import {
  INT_UNITS,
  EMPTY_INTEL_FILTER,
  PRODUCTIVITY_LABELS,
  EXPORT_HEADERS,
  type IntelFilter,
  type IntelRecord,
  type ProductivityStatus,
  mergeRecords,
  normalizeDbRow,
  applyIntelFilter,
  isFilterActive,
  computeSatelliteHealth,
  recordsToExportRows,
  makeSatelliteKey,
  displaySatelliteName,
  displayPolarization,
  parseIntelCsv,
  loadImportedRecords,
  saveImportedRecords,
  formatDisplayDate,
  productivityColor,
} from "@/lib/intelRepository";

export const Route = createFileRoute("/_authenticated/intel/$unitId/$satelliteKey")({
  component: SatelliteIntelRepository,
});

function SatelliteIntelRepository() {
  const { unitId, satelliteKey } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const fileRef = useRef<HTMLInputElement>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<IntelFilter>(EMPTY_INTEL_FILTER);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"delete" | "archive" | null>(null);
  const [localRecords, setLocalRecords] = useState<IntelRecord[]>([]);

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const unit = useMemo(() => {
    const local = INT_UNITS.find((u) => u.id === unitId);
    if (local) return local;
    const db = dbUnits.find((u) => u.id === unitId);
    if (db) return { id: db.id, code: db.code, name: db.name, location: db.location ?? "—" };
    return null;
  }, [unitId, dbUnits]);

  const { data: dbRows = [] } = useQuery({
    queryKey: ["intel", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intel_records")
        .select("*, satellites:satellite_id(name), units:unit_id(code)")
        .eq("unit_id", unitId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!unitId,
  });

  const baseRecords = useMemo(() => {
    if (!unit) return [];
    const normalized = dbRows.map((r) =>
      normalizeDbRow(r as Record<string, unknown>, unit.name),
    );
    return mergeRecords(normalized, unitId, unit.name);
  }, [dbRows, unitId, unit]);

  useEffect(() => {
    setLocalRecords(baseRecords);
  }, [baseRecords]);

  const allUnitRecords = localRecords.length > 0 ? localRecords : baseRecords;

  // Filter to this satellite + polarization
  const satelliteRecords = useMemo(() => {
    return allUnitRecords.filter((r) => makeSatelliteKey(r.satellite, r.polarization) === satelliteKey);
  }, [allUnitRecords, satelliteKey]);

  const satelliteName = displaySatelliteName(satelliteKey, satelliteRecords);
  const polarization = displayPolarization(satelliteKey, satelliteRecords);

  const filtered = useMemo(
    () => applyIntelFilter(satelliteRecords, filter),
    [satelliteRecords, filter],
  );

  const health = useMemo(() => computeSatelliteHealth(satelliteRecords), [satelliteRecords]);
  const isFiltered = isFilterActive(filter);
  const visibleIds = filtered.map((r) => r.id);
  const selectAll = allSelected(visibleIds, selectedIds);

  function setF<K extends keyof IntelFilter>(key: K, val: IntelFilter[K]) {
    setFilter((prev) => ({ ...prev, [key]: val }));
  }

  function clearFilter() {
    setFilter(EMPTY_INTEL_FILTER);
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => toggleSelection(prev, id));
  }

  function handleSelectAll() {
    if (selectAll) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function exportRecords(recs: IntelRecord[], label: string) {
    if (recs.length === 0) return toast.info("No records to export");
    const csv = buildCsv(EXPORT_HEADERS, recordsToExportRows(recs));
    const slug = satelliteName.replace(/\s+/g, "-").toLowerCase();
    downloadCsv(`intel-${slug}-${label}.csv`, csv);
    toast.success(`Exported ${recs.length} record${recs.length !== 1 ? "s" : ""}`);
  }

  function handleImport(file: File) {
    const check = validateImportFile(file);
    if (!check.ok) return toast.error(check.error);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!unit) return;
      const imported = parseIntelCsv(text, unitId, unit.name);
      if (imported.length === 0) return toast.error("No valid records found in file");

      const existing = loadImportedRecords(unitId);
      saveImportedRecords(unitId, [...existing, ...imported]);
      setLocalRecords((prev) => [...prev, ...imported]);
      toast.success(`Imported ${imported.length} record${imported.length !== 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["intel"] });
    };
    reader.readAsText(file);
  }

  async function executeBulkAction() {
    if (!bulkAction || selectedIds.size === 0) return;

    if (bulkAction === "delete") {
      const toDelete = Array.from(selectedIds);
      const dbIds = toDelete.filter((id) => !id.startsWith("mock-") && !id.startsWith("import-"));
      if (dbIds.length > 0 && canEdit) {
        const { error } = await supabase.from("intel_records").delete().in("id", dbIds);
        if (error) toast.error(error.message);
      }
      setLocalRecords((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      const remaining = loadImportedRecords(unitId).filter((r) => !selectedIds.has(r.id));
      saveImportedRecords(unitId, remaining);
      toast.success(`Deleted ${selectedIds.size} record${selectedIds.size !== 1 ? "s" : ""}`);
    } else if (bulkAction === "archive") {
      setLocalRecords((prev) =>
        prev.map((r) => (selectedIds.has(r.id) ? { ...r, archived: true } : r)),
      );
      toast.success(`Archived ${selectedIds.size} record${selectedIds.size !== 1 ? "s" : ""}`);
    }

    setSelectedIds(new Set());
    setBulkAction(null);
    qc.invalidateQueries({ queryKey: ["intel"] });
  }

  if (!unit) {
    return (
      <AppShell title="INT Repository" showBack>
        <Empty title="Unit not found" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`${satelliteName}`}
      subtitle={`${unit.name} · ${polarization} — Intelligence Repository`}
      showBack
      headerIcon={<Archive className="h-4 w-4 shrink-0" />}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => navigate({ to: "/intel" })}
          className="mono text-[11px] uppercase tracking-wider flex items-center gap-1 text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Units
        </button>
        <span className="text-muted-foreground/40">›</span>
        <button
          type="button"
          onClick={() => navigate({ to: "/intel/$unitId", params: { unitId } })}
          className="mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-primary"
        >
          {unit.name}
        </button>
        <span className="text-muted-foreground/40">›</span>
        <span className="mono text-[11px] text-foreground font-medium">{satelliteName}</span>
      </div>

      {/* Satellite Health Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <HealthTile label="Total Scanned" value={health.totalScanned.toLocaleString()} />
        <HealthTile label="Productive" value={health.productive.toLocaleString()} color="text-emerald-400" />
        <HealthTile label="Non-Productive" value={health.nonProductive.toLocaleString()} />
        <HealthTile label="Partial" value={health.partiallyProductive.toLocaleString()} color="text-amber-400" />
        <HealthTile label="Success Rate" value={`${health.successRate}%`} color="text-primary" />
        <HealthTile label="Unknown" value={health.unknown.toLocaleString()} color="text-sky-400" />
      </div>

      {/* Collection Timeline */}
      <div className="panel p-3 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] mono">
        <TimelineItem label="First Collection" value={health.firstCollection ? formatDisplayDate(health.firstCollection) : "—"} />
        <TimelineItem label="Latest Collection" value={health.latestCollection ? formatDisplayDate(health.latestCollection) : "—"} />
        <TimelineItem label="Total Uploads" value={String(health.uploadCount)} />
        <TimelineItem label="Total Records" value={health.totalRecords.toLocaleString()} />
      </div>

      {/* Search + Controls */}
      <div className="panel p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search satellite, frequency, operator, remarks…"
            value={filter.q}
            onChange={(e) => setF("q", e.target.value)}
            className="pl-7 mono text-[11px] h-8"
          />
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" className="h-8 mono text-[11px] uppercase tracking-wider" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
        </Button>
        <Button variant="outline" size="sm" className="h-8 mono text-[11px] uppercase tracking-wider" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Import Excel
        </Button>
        <Button variant="outline" size="sm" className="h-8 mono text-[11px] uppercase tracking-wider" onClick={() => exportRecords(satelliteRecords, "all")}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export All
        </Button>
        {isFiltered && (
          <Button variant="outline" size="sm" className="h-8 mono text-[11px] uppercase tracking-wider" onClick={() => exportRecords(filtered, "filtered")}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export Filtered
          </Button>
        )}
        <Button
          variant={filterOpen ? "default" : "outline"}
          size="sm"
          className="h-8 mono text-[11px] uppercase tracking-wider"
          onClick={() => setFilterOpen((o) => !o)}
        >
          <Filter className="h-3.5 w-3.5 mr-1" /> Filter
        </Button>
      </div>

      {/* Record counts */}
      <div className="flex items-center gap-3 mb-2 mono text-[10px] text-muted-foreground">
        <span>Total: <strong className="text-foreground">{satelliteRecords.length}</strong></span>
        {isFiltered && <span>Filtered: <strong className="text-foreground">{filtered.length}</strong></span>}
        {selectedIds.size > 0 && <span>Selected: <strong className="text-primary">{selectedIds.size}</strong></span>}
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="panel p-3 mb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <FilterField label="Polarization">
            <Input value={filter.polarization} onChange={(e) => setF("polarization", e.target.value)} placeholder="e.g. KU-H" className="h-7 text-[11px] mono" />
          </FilterField>
          <FilterField label="Country">
            <Input value={filter.country} onChange={(e) => setF("country", e.target.value)} className="h-7 text-[11px] mono" />
          </FilterField>
          <FilterField label="Frequency Min (MHz)">
            <Input type="number" value={filter.freqMin} onChange={(e) => setF("freqMin", e.target.value)} className="h-7 text-[11px] mono" />
          </FilterField>
          <FilterField label="Frequency Max (MHz)">
            <Input type="number" value={filter.freqMax} onChange={(e) => setF("freqMax", e.target.value)} className="h-7 text-[11px] mono" />
          </FilterField>
          <FilterField label="Date From">
            <Input type="date" value={filter.dateFrom} onChange={(e) => setF("dateFrom", e.target.value)} className="h-7 text-[11px] mono" />
          </FilterField>
          <FilterField label="Date To">
            <Input type="date" value={filter.dateTo} onChange={(e) => setF("dateTo", e.target.value)} className="h-7 text-[11px] mono" />
          </FilterField>
          <FilterField label="Productivity">
            <Select value={filter.productivity || "all"} onValueChange={(v) => setF("productivity", v === "all" ? "" : v as ProductivityStatus)}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {Object.entries(PRODUCTIVITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Operator">
            <Input value={filter.operator} onChange={(e) => setF("operator", e.target.value)} className="h-7 text-[11px] mono" />
          </FilterField>
          <FilterField label="Signal Type">
            <Select value={filter.signalType || "all"} onValueChange={(v) => setF("signalType", v === "all" ? "" : v)}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {["SIGINT", "COMINT", "ELINT", "TECHINT", "OSINT"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Input value={filter.status} onChange={(e) => setF("status", e.target.value)} className="h-7 text-[11px] mono" />
          </FilterField>
          <div className="col-span-full flex justify-end">
            <Button variant="ghost" size="sm" className="mono text-[11px]" onClick={clearFilter}>Clear Filters</Button>
          </div>
        </div>
      )}

      {/* Bulk bar */}
      {selectedIds.size > 0 && (
        <div className="panel p-2 mb-3 flex flex-wrap items-center gap-2">
          <span className="mono text-[11px] text-foreground">{selectedIds.size} record{selectedIds.size !== 1 ? "s" : ""} selected</span>
          <Button size="sm" variant="outline" className="h-7 mono text-[10px] uppercase" onClick={() => exportRecords(filtered.filter((r) => selectedIds.has(r.id)), "selected")}>
            <Download className="h-3 w-3 mr-1" /> Export Selected
          </Button>
          <Button size="sm" variant="outline" className="h-7 mono text-[10px] uppercase" onClick={handleSelectAll}>
            {selectAll ? "Deselect All" : "Select All Filtered"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 mono text-[10px]" onClick={clearSelection}>Clear</Button>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" className="h-7 mono text-[10px] uppercase" onClick={() => setBulkAction("archive")}>
                <Archive className="h-3 w-3 mr-1" /> Bulk Archive
              </Button>
              <Button size="sm" variant="outline" className="h-7 mono text-[10px] uppercase text-destructive" onClick={() => setBulkAction("delete")}>
                <Trash2 className="h-3 w-3 mr-1" /> Bulk Delete
              </Button>
            </>
          )}
        </div>
      )}

      {/* Intelligence table */}
      {filtered.length === 0 ? (
        <Empty title="No records match" hint="Adjust filters or import collection data." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-max text-[11px] mono">
            <thead>
              <tr className="bg-secondary border-b border-border text-muted-foreground">
                <th className="px-2 py-1.5 w-8 sticky top-0 bg-secondary">
                  <input type="checkbox" checked={selectAll} onChange={handleSelectAll} className="accent-primary cursor-pointer" />
                </th>
                {[
                  "#", "Date", "Satellite", "Polarization", "Frequency",
                  "Symbol Rate", "Modulation", "Signal Type", "Status",
                  "Analysis Summary", "Unit", "Operator", "Remarks", "Productivity",
                ].map((col) => (
                  <th key={col} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, idx) => {
                const checked = selectedIds.has(r.id);
                return (
                  <tr key={r.id} className={`align-top transition-colors ${checked ? "bg-primary/8" : "hover:bg-secondary/30"}`}>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={checked} onChange={() => toggleId(r.id)} className="accent-primary cursor-pointer" />
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDisplayDate(r.collectionDate)}</td>
                    <td className="px-2 py-1.5 font-bold uppercase">{r.satellite}</td>
                    <td className="px-2 py-1.5">{r.polarization}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.frequency}</td>
                    <td className="px-2 py-1.5">{r.symbolRate}</td>
                    <td className="px-2 py-1.5">{r.modulation}</td>
                    <td className="px-2 py-1.5">{r.signalType}</td>
                    <td className="px-2 py-1.5">{r.status}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.analysisSummary}>{r.analysisSummary}</td>
                    <td className="px-2 py-1.5">{r.unitLabel}</td>
                    <td className="px-2 py-1.5">{r.operator}</td>
                    <td className="px-2 py-1.5 max-w-[120px] truncate" title={r.remarks}>{r.remarks}</td>
                    <td className={`px-2 py-1.5 font-medium ${productivityColor(r.productivity)}`}>
                      {PRODUCTIVITY_LABELS[r.productivity]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk action confirmation */}
      <AlertDialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "delete" ? "Bulk Delete Records" : "Bulk Archive Records"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "delete"
                ? `Permanently delete ${selectedIds.size} selected record${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`
                : `Archive ${selectedIds.size} selected record${selectedIds.size !== 1 ? "s" : ""}? Archived records are hidden from default views.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeBulkAction}
              className={bulkAction === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function HealthTile({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="panel px-2 py-1.5">
      <div className="label-eyebrow">{label}</div>
      <div className={`mono text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function TimelineItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className="text-foreground font-medium mt-0.5">{value}</div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="label-eyebrow text-[10px]">{label}</Label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
