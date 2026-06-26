import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ccModuleBackLink } from "@/lib/controlCenter";
import { exportCsv } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Download, ArrowUpDown, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  addAllocationForUnit,
  allocationRowsToCsv,
  clearUserAllocationsForUnit,
  getAllocationsForUnit,
  getUserAllocationCount,
  sortAllocationRows,
  unitCodeToSlot,
  unitShortLabel,
  type AllocationSortKey,
  type SortDir,
} from "@/lib/priorityAllocation";
import { flattenSatelliteCatalog } from "@/lib/satelliteCatalog";

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
      className={`text-left px-3 py-2 text-[10px] uppercase tracking-wider border-r border-border cursor-pointer hover:bg-secondary/60 select-none whitespace-nowrap ${cls ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
        {active && (
          <span className="text-[8px] text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>
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

  const { data: unit } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: async () =>
      (await supabase.from("units").select("*").eq("id", unitId).maybeSingle()).data,
  });

  const slot = unit?.code ? unitCodeToSlot(unit.code) : null;
  const shortLabel = unit?.code ? unitShortLabel(unit.code) : "Unit";

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

  return (
    <AppShell
      title={`Satellite Priority & Allocation – ${shortLabel}`}
      subtitle={`Priority of Satellites Allocated to ${shortLabel}`}
      headerTitleClassName="mono text-[0.8rem] sm:text-[0.95rem] font-bold tracking-tight uppercase whitespace-normal leading-snug"
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
            className="mono text-[11px] uppercase tracking-wider h-8"
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Download CSV
          </Button>
          {canEdit && slot && (
            <AddAllocation slot={slot} existingIds={rows.map((r) => r.satelliteId)} onAdded={handleAdded} />
          )}
        </div>

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
              <thead className="bg-secondary sticky top-0 z-10">
                <tr>
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
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/40 align-top">
                    <td className="px-3 py-2 font-bold text-primary">{r.priority}</td>
                    <td className="px-3 py-2 font-bold">{r.satelliteName}</td>
                    <td className="px-3 py-2">{r.country}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.orbitalPosition}</td>
                    <td className="px-3 py-2">{r.launchDate}</td>
                    <td className="px-3 py-2">{r.transponders}</td>
                    <td className="px-3 py-2 text-[11px]">{r.beamDetails}</td>
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
  slot: NonNullable<ReturnType<typeof unitCodeToSlot>>;
  existingIds: string[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [satelliteId, setSatelliteId] = useState("");
  const catalog = useMemo(() => flattenSatelliteCatalog(), []);
  const available = catalog.filter((s) => !existingIds.includes(s.id));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!satelliteId) return;
    const row = catalog.find((s) => s.id === satelliteId);
    if (!row) return;
    const added = addAllocationForUnit(slot, row);
    if (!added) {
      toast.error("Satellite already allocated.");
      return;
    }
    toast.success(`Allocated ${row.name}`);
    setOpen(false);
    setSatelliteId("");
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Satellite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider">Allocate Satellite</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="label-eyebrow">Satellite</Label>
            <Select value={satelliteId} onValueChange={setSatelliteId}>
              <SelectTrigger>
                <SelectValue placeholder="Select satellite" />
              </SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {s.countryOfOrigin} ({s.satellite.position})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full mono uppercase tracking-wider" disabled={!satelliteId}>
            Allocate
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
