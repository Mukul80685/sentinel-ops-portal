import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Satellite, FileOutput, ArrowUpDown, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useSatelliteCatalog,
  sortSatelliteRows,
  type FlatSatelliteRow,
  type NameSort,
  type DateSort,
} from "@/lib/satelliteCatalog";
import { buildCsv, downloadCsv, downloadExcel, toggleSelection, allSelected } from "@/lib/dataTableUtils";
import { useSidebarModules } from "./SidebarModulesProvider";
import type { GeoSatellite } from "@/lib/visibilityMatrix";
import { formatSatelliteTransponders } from "@/lib/visibilityMatrix";
import { formatLaunchDateDisplay } from "@/lib/launchDateFormat";
import { removeSatelliteFromOverlay } from "@/lib/visibilityOverlay";

const EXPORT_HEADERS = ["Satellite Name", "Country of Origin", "Date of Launch"];

function SatelliteDetailDialog({
  sat,
  country,
  open,
  onClose,
}: {
  sat: GeoSatellite | null;
  country: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2">
            <Satellite className="h-4 w-4 text-primary" />
            {sat?.name}
          </DialogTitle>
        </DialogHeader>
        {sat && (
          <div className="grid grid-cols-2 gap-2 text-[11px] mono">
            <Info label="Country of Origin" value={country} />
            <Info label="Launch Date" value={formatLaunchDateDisplay(sat.launchDate)} />
            <Info label="Position" value={sat.position} />
            <Info label="Frequency Bands" value={formatSatelliteTransponders(sat)} />
            <Info label="Beam Coverage" value={sat.beamCoverage} className="col-span-2" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`panel p-2 ${className ?? ""}`}>
      <div className="text-foreground text-[9px] uppercase tracking-wider font-semibold">{label}</div>
      <div className="font-semibold mt-0.5 text-foreground">{value}</div>
    </div>
  );
}

export function SatellitesModuleModal() {
  const { activeModule, closeModule } = useSidebarModules();
  const open = activeModule === "satellites";
  const catalog = useSatelliteCatalog();

  const [nameSort, setNameSort] = useState<NameSort>("asc");
  const [dateSort, setDateSort] = useState<DateSort>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmExport, setConfirmExport] = useState(false);
  const [detailRow, setDetailRow] = useState<FlatSatelliteRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlatSatelliteRow | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const rows = useMemo(
    () => sortSatelliteRows(catalog, nameSort, dateSort),
    [catalog, nameSort, dateSort],
  );

  const visibleIds = rows.map((r) => r.id);
  const selectAll = allSelected(visibleIds, selected);

  function cycleNameSort() {
    setDateSort(null);
    setNameSort((s) => (s === "asc" ? "desc" : "asc"));
  }

  function cycleDateSort() {
    setNameSort(null);
    setDateSort((s) => (s === "asc" ? "desc" : "asc"));
  }

  function doExport() {
    const list = rows.filter((r) => selected.has(r.id));
    if (list.length === 0) { toast.error("No satellites selected for export."); return; }
    const data = list.map((r) => [r.name, r.countryOfOrigin, r.launchDate]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`satellites-${stamp}.csv`, buildCsv(EXPORT_HEADERS, data));
    downloadExcel(`satellites-${stamp}.xlsx`, EXPORT_HEADERS, data);
    toast.success(`${list.length} satellite${list.length !== 1 ? "s" : ""} exported.`);
    setConfirmExport(false);
  }

  function doDeleteSingle() {
    if (!deleteTarget) return;
    removeSatelliteFromOverlay(deleteTarget.regionId, deleteTarget.id);
    setSelected((s) => { const n = new Set(s); n.delete(deleteTarget.id); return n; });
    toast.success("Satellite removed.");
    setDeleteTarget(null);
  }

  function doBulkDelete() {
    const list = rows.filter((r) => selected.has(r.id));
    for (const row of list) {
      removeSatelliteFromOverlay(row.regionId, row.id);
    }
    toast.success(`${list.length} satellite${list.length !== 1 ? "s" : ""} removed.`);
    setBulkDeleteOpen(false);
    setSelected(new Set());
  }

  function handleClose() {
    setSelected(new Set());
    setConfirmExport(false);
    setDeleteTarget(null);
    setBulkDeleteOpen(false);
    closeModule();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 pr-16 border-b border-border shrink-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2 min-w-0 flex-1">
                <Satellite className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">Satellites</span>
                <span className="text-foreground font-normal text-[10px] shrink-0">
                  ({catalog.length} from Visibility Matrix)
                </span>
              </DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mono text-[10px] uppercase h-7 shrink-0 mr-2"
                onClick={() => {
                  if (selected.size === 0) { toast.error("Select satellites to export."); return; }
                  setConfirmExport(true);
                }}
              >
                <FileOutput className="h-3 w-3 mr-1" />
                Export
              </Button>
            </div>
          </DialogHeader>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="px-4 py-2 border-b border-border bg-primary/5 flex items-center gap-3 mono text-[11px] shrink-0">
              <span className="text-primary font-bold">
                {selected.size} satellite{selected.size !== 1 ? "s" : ""} selected
              </span>
              <span className="text-muted-foreground/40">·</span>
              <button
                type="button"
                onClick={() => { if (selected.size === 0) return; setConfirmExport(true); }}
                className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
              >
                <FileOutput className="h-3 w-3" /> Export Selected
              </button>
              <span className="text-muted-foreground/40">·</span>
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors"
              >
                <Trash2 className="h-3 w-3" /> Delete Selected
              </button>
              <span className="text-muted-foreground/40">·</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          <div className="overflow-auto flex-1 min-h-0 px-4 py-2">
            <table className="w-full text-[11px] mono">
              <thead className="text-foreground sticky top-0 bg-muted/50 z-10">
                <tr className="border-b border-border">
                  <th className="w-8 py-2">
                    <Checkbox
                      checked={selectAll}
                      onCheckedChange={() =>
                        setSelected(selectAll ? new Set() : new Set(visibleIds))
                      }
                    />
                  </th>
                  <th className="text-left py-2 font-semibold">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-foreground uppercase tracking-wider font-semibold"
                      onClick={cycleNameSort}
                    >
                      Satellite Name
                      <ArrowUpDown className="h-3 w-3" />
                      {nameSort && <span className="text-primary">{nameSort === "asc" ? "A–Z" : "Z–A"}</span>}
                    </button>
                  </th>
                  <th className="text-left py-2 uppercase tracking-wider font-semibold">Country of Origin</th>
                  <th className="text-left py-2 font-semibold">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-foreground uppercase tracking-wider font-semibold"
                      onClick={cycleDateSort}
                    >
                      Date of Launch
                      <ArrowUpDown className="h-3 w-3" />
                      {dateSort && <span className="text-primary">{dateSort === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                  <th className="w-8 py-2" />
                </tr>
              </thead>
              <tbody className="bg-white">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border/60 bg-white hover:bg-gray-50 ${selected.has(row.id) ? "ring-1 ring-inset ring-primary/25" : ""}`}
                  >
                    <td className="py-1.5">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={() => setSelected((s) => toggleSelection(s, row.id))}
                      />
                    </td>
                    <td className="py-1.5 bg-white text-foreground font-semibold">
                      <button
                        type="button"
                        className="text-left text-foreground font-semibold hover:text-primary hover:underline"
                        onClick={() => setDetailRow(row)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="py-1.5 bg-white text-foreground font-medium">{row.countryOfOrigin}</td>
                    <td className="py-1.5 bg-white text-foreground font-medium">{formatLaunchDateDisplay(row.launchDate)}</td>
                    <td className="py-1.5 bg-white">
                      <button
                        type="button"
                        title="Delete satellite"
                        onClick={() => setDeleteTarget(row)}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <SatelliteDetailDialog
        sat={detailRow?.satellite ?? null}
        country={detailRow?.countryOfOrigin ?? ""}
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
      />

      {/* Export confirm */}
      <AlertDialog open={confirmExport} onOpenChange={setConfirmExport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase">Confirm Export</AlertDialogTitle>
            <AlertDialogDescription>
              Export {selected.size} selected satellite{selected.size !== 1 ? "s" : ""}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doExport}>Export</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              Remove Satellite
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              Remove <span className="font-bold">{deleteTarget?.name}</span> from the Visibility Matrix? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="mono text-[11px] uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); doDeleteSingle(); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              Delete Selected Satellites
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              Remove {selected.size} satellite{selected.size !== 1 ? "s" : ""} from the Visibility Matrix? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="mono text-[11px] uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); doBulkDelete(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
