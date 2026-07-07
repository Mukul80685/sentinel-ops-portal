import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ccModuleBackLink } from "@/lib/controlCenter";
import { exportCsv, getUnitById } from "@/lib/queries";
import { useCanEdit } from "@/lib/auth";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Download, ArrowUpDown, ListOrdered, Settings2, Trash2 } from "lucide-react";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { toast } from "sonner";
import {
  addAllocationForUnit,
  allocationRowsToCsv,
  clearUserAllocationsForUnit,
  getAllocationsForUnit,
  getUserAllocationCount,
  removeAllocationsByIds,
  sortAllocationRows,
  updateAllocationPriority,
  allocationSlotForUnit,
  unitCodeToSlot,
  unitShortLabel,
  SAT_PRIORITIES,
  SAT_PRIORITY_LABEL,
  type AllocationSortKey,
  type SatPriority,
  type SortDir,
} from "@/lib/priorityAllocation";
import { flattenGlobalSatelliteCatalog } from "@/lib/satelliteCatalog";
import { VISIBILITY_OVERLAY_EVENT } from "@/lib/visibilityOverlay";

export const Route = createFileRoute("/_authenticated/priority/$unitId")({
  component: PriorityUnit,
});

const SORTABLE_COLUMNS: { key: AllocationSortKey; label: string; cls?: string }[] = [
  { key: "priority", label: "Priority", cls: "w-16" },
  { key: "satelliteName", label: "Satellite Name", cls: "min-w-[130px]" },
  { key: "launchDate", label: "Launch Date", cls: "min-w-[100px]" },
];

const STATIC_COLUMNS: { label: string; cls?: string }[] = [
  { label: "Country", cls: "min-w-[100px]" },
  { label: "Orbital Position", cls: "min-w-[110px]" },
  { label: "Transponders", cls: "min-w-[140px]" },
  { label: "Beam Details", cls: "min-w-[160px]" },
];

function StaticTh({ label, cls }: { label: string; cls?: string }) {
  return (
    <th
      className={`text-left px-3 py-2 text-[10px] uppercase tracking-wider border-r border-border whitespace-nowrap ${cls ?? ""}`}
    >
      {label}
    </th>
  );
}

function SortTh({
  col,
  label,
  cls,
  sortKey,
  sortDir,
  onSort,
}: {
  col: AllocationSortKey;
  label: string;
  cls?: string;
  sortKey: AllocationSortKey;
  sortDir: SortDir;
  onSort: (col: AllocationSortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`text-left px-3 py-2 text-[10px] uppercase tracking-wider border-r border-border cursor-pointer hover:bg-secondary/60 select-none whitespace-nowrap text-secondary-foreground ${cls ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-secondary-foreground" : "text-secondary-foreground/50"}`} />
        {active && (
          <span className="text-[8px] text-secondary-foreground">{sortDir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );
}

/** Vertical scroll in body; single sticky horizontal scroll track at bottom. */
function StickyHorizontalTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const measure = () => setScrollWidth(inner.scrollWidth);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [children]);

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ""}`}>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div
          ref={innerRef}
          className="min-w-max"
          style={{ transform: `translateX(-${scrollLeft}px)` }}
        >
          {children}
        </div>
      </div>
      <div
        ref={trackRef}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        className="sticky bottom-0 z-10 shrink-0 overflow-x-auto overflow-y-hidden border-t border-border bg-card/95 backdrop-blur-sm h-4"
        aria-label="Horizontal table scroll"
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
    </div>
  );
}

function PriorityUnit() {
  const { unitId } = Route.useParams();
  const canEdit = useCanEdit();
  const [sortKey, setSortKey] = useState<AllocationSortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [refreshKey, setRefreshKey] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<"single" | "bulk" | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data: unit } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: () => getUnitById(unitId),
  });

  const slot = unit ? allocationSlotForUnit(unit) : null;
  const seedLabel = unit?.code ? unitShortLabel(unit.code) : "Unit";
  const shortLabel = seedLabel !== "Unit" ? seedLabel : (unit?.name ?? "Unit");

  const rows = useMemo(() => {
    if (!slot) return [];
    void refreshKey;
    return getAllocationsForUnit(slot);
  }, [slot, refreshKey]);

  const sortedRows = useMemo(
    () => sortAllocationRows(rows, sortKey, sortDir),
    [rows, sortKey, sortDir],
  );

  const userAddedCount = useMemo(() => {
    if (!slot) return 0;
    void refreshKey;
    return getUserAllocationCount(slot);
  }, [slot, refreshKey]);

  function handleSort(col: AllocationSortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  function exportData() {
    if (sortedRows.length === 0) {
      toast.error("No records to export.");
      return;
    }
    exportCsv(allocationRowsToCsv(sortedRows), `priority-${unit?.code ?? unitId}.csv`);
    toast.success("CSV exported.");
  }

  function handleAdded() {
    setRefreshKey((k) => k + 1);
  }

  function handleClearUserAllocations() {
    if (!slot) return;
    const removed = clearUserAllocationsForUnit(slot);
    if (removed === 0) {
      toast.error("No user-added allocations to clear.");
      return;
    }
    toast.success(`Removed ${removed} user-added allocation${removed !== 1 ? "s" : ""}.`);
    setRefreshKey((k) => k + 1);
    setAdvancedOpen(false);
  }

  const allRowIds = sortedRows.map((r) => r.id);
  const allUserSelected =
    allRowIds.length > 0 && allRowIds.every((id) => selectedIds.has(id));
  const someUserSelected = allRowIds.some((id) => selectedIds.has(id));

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allUserSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allRowIds));
    }
  }

  function confirmDeleteSingle(id: string) {
    setPendingDeleteId(id);
    setDeleteConfirm("single");
  }

  function confirmDeleteBulk() {
    setDeleteConfirm("bulk");
  }

  function executeDelete() {
    if (!slot) return;
    if (deleteConfirm === "single" && pendingDeleteId) {
      removeAllocationsByIds(slot, [pendingDeleteId]);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(pendingDeleteId); return n; });
      toast.success("Satellite removed from allocation list.");
    } else if (deleteConfirm === "bulk") {
      const ids = [...selectedIds];
      removeAllocationsByIds(slot, ids);
      setSelectedIds(new Set());
      toast.success(`${ids.length} satellite${ids.length !== 1 ? "s" : ""} removed from allocation list.`);
    }
    setDeleteConfirm(null);
    setPendingDeleteId(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <AppShell
      title="Satellite Priority & Allocation"
      pageTitle={`Priority of Satellites Allocated to ${shortLabel}`}
      headerIcon={<HomeNavIconBadge icon={ListOrdered} theme="priority" size="md" />}
      showBack
      backLink={ccModuleBackLink("priority")}
      horizontalNav={null}
    >
      <div className="flex flex-col h-[calc(100dvh-6rem)] min-h-0 -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="flex items-center justify-end gap-2 mb-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={sortedRows.length === 0}
            className="mono text-[11px] uppercase tracking-wider h-8"
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Download CSV
          </Button>
          {canEdit && slot && (
            <AddAllocation slot={slot} existingIds={rows.map((r) => r.satelliteId)} onAdded={handleAdded} />
          )}
        </div>

        {canEdit && selectedIds.size > 0 && (
          <div className="mb-2 px-3 py-2 rounded-md border border-border bg-primary/5 flex items-center gap-3 mono text-[11px] shrink-0">
            <span className="text-primary font-bold">
              {selectedIds.size} satellite{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={confirmDeleteBulk}
              className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              Clear selection
            </button>
          </div>
        )}

        <div className="panel overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="px-4 py-1.5 border-b border-border bg-secondary/20 flex items-center justify-between gap-2 shrink-0">
            <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {sortedRows.length} satellite{sortedRows.length !== 1 ? "s" : ""} allocated
            </span>
            <span className="mono text-[9px] text-muted-foreground">
              Sorted by {SORTABLE_COLUMNS.find((c) => c.key === sortKey)?.label} ({sortDir === "asc" ? "ascending" : "descending"})
            </span>
          </div>

          <StickyHorizontalTable className="flex-1 min-h-0">
            <table className="min-w-full text-sm mono">
              <thead className="bg-secondary text-secondary-foreground sticky top-0 z-10">
                <tr>
                  {canEdit && (
                    <th className="w-8 px-2 py-2 border-r border-border">
                      <Checkbox
                        checked={allUserSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all satellites"
                        disabled={allRowIds.length === 0}
                        className={someUserSelected && !allUserSelected ? "opacity-50" : ""}
                      />
                    </th>
                  )}
                  {SORTABLE_COLUMNS.slice(0, 2).map((col) => (
                    <SortTh
                      key={col.key}
                      col={col.key}
                      label={col.label}
                      cls={col.cls}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  ))}
                  {STATIC_COLUMNS.slice(0, 2).map((col) => (
                    <StaticTh key={col.label} label={col.label} cls={col.cls} />
                  ))}
                  <SortTh
                    col={SORTABLE_COLUMNS[2].key}
                    label={SORTABLE_COLUMNS[2].label}
                    cls={SORTABLE_COLUMNS[2].cls}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  {STATIC_COLUMNS.slice(2).map((col) => (
                    <StaticTh key={col.label} label={col.label} cls={col.cls} />
                  ))}
                  {canEdit && <th className="w-10 border-l border-border" />}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border hover:bg-secondary/40 align-top ${
                      selectedIds.has(r.id) ? "bg-primary/5" : ""
                    }`}
                  >
                    {canEdit && (
                      <td className="w-8 px-2 py-2 border-r border-border/40">
                        <Checkbox
                          checked={selectedIds.has(r.id)}
                          onCheckedChange={() => toggleRow(r.id)}
                          aria-label={`Select ${r.satelliteName}`}
                        />
                      </td>
                    )}
                    <td className="px-2 py-1.5">
                      <select
                        value={Math.min(Math.max(Math.round(r.priority), 1), 3)}
                        onChange={(e) => {
                          if (!slot) return;
                          updateAllocationPriority(slot, r.satelliteId, Number(e.target.value) as SatPriority);
                          setRefreshKey((k) => k + 1);
                        }}
                        disabled={!canEdit}
                        className="mono text-[11px] font-bold text-primary bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5 cursor-pointer hover:bg-primary/15 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60 disabled:cursor-default"
                        aria-label={`Priority for ${r.satelliteName}`}
                      >
                        {SAT_PRIORITIES.map((p) => (
                          <option key={p} value={p}>{SAT_PRIORITY_LABEL[p]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 font-bold">{r.satelliteName}</td>
                    <td className="px-3 py-2">{r.country}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.orbitalPosition}</td>
                    <td className="px-3 py-2">{r.launchDate}</td>
                    <td className="px-3 py-2">{r.transponders}</td>
                    <td className="px-3 py-2 text-[11px]">{r.beamDetails}</td>
                    {canEdit && (
                      <td className="w-10 px-1 py-2 border-l border-border/40 text-center">
                        <button
                          type="button"
                          onClick={() => confirmDeleteSingle(r.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={`Delete ${r.satelliteName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </StickyHorizontalTable>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 shrink-0">
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
      </div>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) { setDeleteConfirm(null); setPendingDeleteId(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm === "bulk"
                ? `Remove ${selectedIds.size} satellite${selectedIds.size !== 1 ? "s" : ""}?`
                : "Remove satellite?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm === "bulk"
                ? `The selected ${selectedIds.size} user-added satellite${selectedIds.size !== 1 ? "s" : ""} will be removed from this unit's allocation list. Seed satellites cannot be removed.`
                : "This user-added satellite will be removed from this unit's allocation list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advanced Features</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="justify-start" onClick={() => { exportData(); setAdvancedOpen(false); }}>
              <Download className="h-4 w-4 mr-2" /> Export Allocations as CSV
            </Button>
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                className="justify-start text-destructive hover:text-destructive"
                onClick={handleClearUserAllocations}
                disabled={userAddedCount === 0}
              >
                Clear User-Added Allocations
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function AddAllocation({
  slot,
  existingIds,
  onAdded,
}: {
  slot: string;
  existingIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Per-satellite priority: defaults to P1 when a satellite is first checked
  const [priorities, setPriorities] = useState<Record<string, SatPriority>>({});

  const [catalog, setCatalog] = useState(() => flattenGlobalSatelliteCatalog());
  useEffect(() => {
    const refresh = () => setCatalog(flattenGlobalSatelliteCatalog());
    window.addEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
    return () => window.removeEventListener(VISIBILITY_OVERLAY_EVENT, refresh);
  }, []);

  const available = useMemo(
    () => catalog.filter((s) => !existingIds.includes(s.id)),
    [catalog, existingIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.countryOfOrigin.toLowerCase().includes(q),
    );
  }, [available, search]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Default priority to P1 when first selected
        setPriorities((p) => (id in p ? p : { ...p, [id]: 1 }));
      }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      const newIds = filtered.map((s) => s.id);
      setSelected(new Set(newIds));
      setPriorities((prev) => {
        const next = { ...prev };
        for (const id of newIds) if (!(id in next)) next[id] = 1;
        return next;
      });
    }
  }

  function setPriority(id: string, p: SatPriority) {
    setPriorities((prev) => ({ ...prev, [id]: p }));
  }

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) {
      setSearch("");
      setSelected(new Set());
      setPriorities({});
    }
  }

  function submit() {
    if (selected.size === 0) return;
    let added = 0;
    for (const id of selected) {
      const row = catalog.find((s) => s.id === id);
      if (row && addAllocationForUnit(slot, row, priorities[id] ?? 1)) added++;
    }
    if (added > 0) {
      toast.success(`${added} satellite${added !== 1 ? "s" : ""} allocated.`);
      onAdded();
    } else {
      toast.error("No new satellites were added (already allocated).");
    }
    handleOpen(false);
  }

  const allFiltered = filtered.length > 0 && selected.size === filtered.length;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Satellite
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider">Allocate Satellites</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Search */}
          <Input
            placeholder="Search by name or country…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); setPriorities({}); }}
            className="mono text-xs h-8"
            autoFocus
          />

          {/* Column header */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Checkbox
                id="alloc-select-all"
                checked={allFiltered}
                onCheckedChange={toggleAll}
                className="shrink-0"
              />
              <label
                htmlFor="alloc-select-all"
                className="mono text-[10px] uppercase tracking-wider cursor-pointer text-muted-foreground select-none flex-1"
              >
                {allFiltered ? "Deselect all" : `Select all (${filtered.length})`}
              </label>
              <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground w-16 text-center shrink-0">
                Priority
              </span>
              {selected.size > 0 && (
                <span className="mono text-[11px] text-primary font-bold ml-1">
                  {selected.size} selected
                </span>
              )}
            </div>
          )}

          {/* Satellite list */}
          <div className="overflow-y-auto max-h-60 space-y-0.5 pr-1">
            {filtered.length === 0 ? (
              <p className="mono text-[11px] text-muted-foreground text-center py-6">
                {available.length === 0
                  ? "All satellites are already allocated."
                  : "No satellites match your search."}
              </p>
            ) : (
              filtered.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-2.5 rounded px-2 py-1.5 transition-colors group ${
                    selected.has(s.id)
                      ? "bg-primary/10 hover:bg-primary/15"
                      : "hover:bg-secondary hover:text-secondary-foreground"
                  }`}
                >
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={() => toggleOne(s.id)}
                    className="shrink-0"
                  />
                  {/* Name + country — clicking the text area toggles the checkbox */}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => toggleOne(s.id)}
                  >
                    <div className="mono text-[12px] font-bold leading-tight truncate">{s.name}</div>
                    <div className="mono text-[10px] text-muted-foreground group-hover:text-secondary-foreground/80 truncate">
                      {s.countryOfOrigin}
                      {s.satellite.position ? ` · ${s.satellite.position}` : ""}
                    </div>
                  </button>
                  {/* Priority dropdown — always visible; applies only if row is selected */}
                  <select
                    value={priorities[s.id] ?? 1}
                    onChange={(e) => {
                      const p = Number(e.target.value) as SatPriority;
                      setPriority(s.id, p);
                      // Auto-select the row when a priority is explicitly chosen
                      if (!selected.has(s.id)) {
                        setSelected((prev) => new Set([...prev, s.id]));
                      }
                    }}
                    className={`mono text-[11px] font-bold border rounded px-1.5 py-0.5 w-16 shrink-0 focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer ${
                      selected.has(s.id)
                        ? "text-primary bg-primary/10 border-primary/30 hover:bg-primary/15"
                        : "text-secondary-foreground bg-secondary border-border hover:bg-secondary/80"
                    }`}
                    aria-label={`Priority for ${s.name}`}
                  >
                    {SAT_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{SAT_PRIORITY_LABEL[p]}</option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>

          <Button
            className="w-full mono uppercase tracking-wider"
            disabled={selected.size === 0}
            onClick={submit}
          >
            Allocate {selected.size > 0 ? `${selected.size} Satellite${selected.size !== 1 ? "s" : ""}` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
