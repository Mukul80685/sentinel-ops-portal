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
import { Satellite, Download, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useSatelliteCatalog,
  sortSatelliteRows,
  type FlatSatelliteRow,
  type NameSort,
  type DateSort,
} from "@/lib/satelliteCatalog";
import { buildCsv, downloadCsv, downloadExcel, toggleSelection } from "@/lib/dataTableUtils";
import { useSidebarModules } from "./SidebarModulesProvider";
import type { GeoSatellite } from "@/lib/visibilityMatrix";

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
            <Info label="Launch Date" value={sat.launchDate} />
            <Info label="Position" value={sat.position} />
            <Info label="Transponders" value={sat.transponders} />
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
      <div className="text-muted-foreground text-[9px] uppercase tracking-wider">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

export function SatellitesModuleModal() {
  const { activeModule, closeModule } = useSidebarModules();
  const open = activeModule === "satellites";
  const catalog = useSatelliteCatalog();

  const [nameSort, setNameSort] = useState<NameSort>("asc");
  const [dateSort, setDateSort] = useState<DateSort>(null);
  const [exportMode, setExportMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmExport, setConfirmExport] = useState(false);
  const [detailRow, setDetailRow] = useState<FlatSatelliteRow | null>(null);

  const rows = useMemo(
    () => sortSatelliteRows(catalog, nameSort, dateSort),
    [catalog, nameSort, dateSort],
  );

  function cycleNameSort() {
    setDateSort(null);
    setNameSort((s) => (s === "asc" ? "desc" : "asc"));
  }

  function cycleDateSort() {
    setNameSort(null);
    setDateSort((s) => (s === "asc" ? "desc" : "asc"));
  }

  function handleExportClick() {
    if (!exportMode) {
      setExportMode(true);
      return;
    }
    if (selected.size === 0) {
      toast.error("No satellite selected for export");
      return;
    }
    setConfirmExport(true);
  }

  function doExport() {
    const list = rows.filter((r) => selected.has(r.id));
    const data = list.map((r) => [r.name, r.countryOfOrigin, r.launchDate]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`satellites-${stamp}.csv`, buildCsv(EXPORT_HEADERS, data));
    downloadExcel(`satellites-${stamp}.xlsx`, EXPORT_HEADERS, data);
    toast.success(`${list.length} satellite${list.length !== 1 ? "s" : ""} exported.`);
    setConfirmExport(false);
    setExportMode(false);
    setSelected(new Set());
  }

  function handleClose() {
    setExportMode(false);
    setSelected(new Set());
    setConfirmExport(false);
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
                <span className="text-muted-foreground font-normal text-[10px] shrink-0">
                  ({catalog.length} from Visibility Matrix)
                </span>
              </DialogTitle>
              <Button
                type="button"
                variant={exportMode ? "default" : "outline"}
                size="sm"
                className="mono text-[10px] uppercase h-7 shrink-0 mr-2"
                onClick={handleExportClick}
              >
                <Download className="h-3 w-3 mr-1" />
                Export
              </Button>
            </div>
          </DialogHeader>

          <div className="overflow-auto flex-1 min-h-0 px-4 py-2">
            <table className="w-full text-[11px] mono">
              <thead className="text-muted-foreground sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  {exportMode && <th className="w-8 py-2" />}
                  <th className="text-left py-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground uppercase tracking-wider"
                      onClick={cycleNameSort}
                    >
                      Satellite Name
                      <ArrowUpDown className="h-3 w-3" />
                      {nameSort && <span className="text-primary">{nameSort === "asc" ? "A–Z" : "Z–A"}</span>}
                    </button>
                  </th>
                  <th className="text-left py-2 uppercase tracking-wider">Country of Origin</th>
                  <th className="text-left py-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground uppercase tracking-wider"
                      onClick={cycleDateSort}
                    >
                      Date of Launch
                      <ArrowUpDown className="h-3 w-3" />
                      {dateSort && <span className="text-primary">{dateSort === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-secondary/30">
                    {exportMode && (
                      <td className="py-1.5">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => setSelected((s) => toggleSelection(s, row.id))}
                        />
                      </td>
                    )}
                    <td className="py-1.5">
                      <button
                        type="button"
                        className="text-left hover:text-primary hover:underline"
                        onClick={() => setDetailRow(row)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="py-1.5 text-muted-foreground">{row.countryOfOrigin}</td>
                    <td className="py-1.5 text-muted-foreground">{row.launchDate}</td>
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

      <AlertDialog open={confirmExport} onOpenChange={setConfirmExport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase">Confirm Export</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm export of selected satellites?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doExport}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
