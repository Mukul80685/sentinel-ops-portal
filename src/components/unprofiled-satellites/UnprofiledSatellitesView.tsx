import { useEffect, useRef, useState } from "react";
import { Download, FileUp, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { ACCEPTED_SPREADSHEET_ACCEPT } from "@/lib/dataTableUtils";
import {
  UNPROFILED_SATELLITE_COLUMNS,
  UNPROFILED_SATELLITES_EVENT,
  deleteUnprofiledSatellite,
  listUnprofiledSatellites,
  updateUnprofiledSatellite,
  type UnprofiledSatellite,
  type UnprofiledSatelliteDraft,
} from "@/lib/unprofiledSatellitesStore";
import {
  downloadUnprofiledSatellitesTemplate,
  importUnprofiledSatellitesFile,
} from "@/lib/unprofiledSatellitesImport";

const GRID_COLS =
  "[grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_5.5rem]";

const EMPTY_DRAFT: UnprofiledSatelliteDraft = {
  satelliteName: "",
  countryOfOrigin: "",
  dateOfLaunch: "",
  orbitalPosition: "",
};

export function UnprofiledSatellitesView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UnprofiledSatellite[]>(() => listUnprofiledSatellites());
  const [editTarget, setEditTarget] = useState<UnprofiledSatellite | null>(null);
  const [editDraft, setEditDraft] = useState<UnprofiledSatelliteDraft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<UnprofiledSatellite | null>(null);

  useEffect(() => {
    const refresh = () => setRows(listUnprofiledSatellites());
    window.addEventListener(UNPROFILED_SATELLITES_EVENT, refresh);
    return () => window.removeEventListener(UNPROFILED_SATELLITES_EVENT, refresh);
  }, []);

  function openEdit(row: UnprofiledSatellite) {
    setEditTarget(row);
    setEditDraft({
      satelliteName: row.satelliteName,
      countryOfOrigin: row.countryOfOrigin,
      dateOfLaunch: row.dateOfLaunch,
      orbitalPosition: row.orbitalPosition,
    });
  }

  function saveEdit() {
    if (!editTarget) return;
    if (!editDraft.satelliteName.trim()) {
      toast.error("Satellite Name is required.");
      return;
    }
    const updated = updateUnprofiledSatellite(editTarget.id, editDraft);
    if (!updated) {
      toast.error("Could not save — check for duplicate satellite names.");
      return;
    }
    toast.success("Satellite updated.");
    setEditTarget(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const ok = deleteUnprofiledSatellite(deleteTarget.id);
    if (ok) {
      toast.success(`Removed "${deleteTarget.satelliteName}".`);
    } else {
      toast.error("Could not delete this row.");
    }
    setDeleteTarget(null);
  }

  async function handleImport(file: File) {
    const result = await importUnprofiledSatellitesFile(file, "append");
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Imported ${result.imported} satellite${result.imported !== 1 ? "s" : ""}. Total: ${result.total}.`,
    );
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mono text-[11px] text-muted-foreground uppercase tracking-wider">
          {rows.length} satellite{rows.length !== 1 ? "s" : ""} registered
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mono text-[10px] uppercase tracking-wider h-8"
            onClick={() => downloadUnprofiledSatellitesTemplate()}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mono text-[10px] uppercase tracking-wider h-8"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="h-3.5 w-3.5 mr-1" />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_SPREADSHEET_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleImport(file);
            }}
          />
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div
          className={`grid ${GRID_COLS} gap-2 px-3 py-2 border-b border-border bg-secondary/20 mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground`}
        >
          {UNPROFILED_SATELLITE_COLUMNS.map((col) => (
            <span key={col}>{col}</span>
          ))}
          <span className="text-center">Actions</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No satellites yet. Download the template, fill in the four columns, and import.
          </p>
        ) : (
          <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.id}
                className={`grid ${GRID_COLS} gap-2 px-3 py-2.5 border-b border-border/60 items-center text-[12px] mono`}
              >
                <span className="font-semibold truncate" title={row.satelliteName}>
                  {row.satelliteName}
                </span>
                <span className="truncate" title={row.countryOfOrigin}>
                  {row.countryOfOrigin || "—"}
                </span>
                <span className="truncate" title={row.dateOfLaunch}>
                  {row.dateOfLaunch || "—"}
                </span>
                <span className="truncate" title={row.orbitalPosition}>
                  {row.orbitalPosition || "—"}
                </span>
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${row.satelliteName}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border hover:bg-secondary/60"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${row.satelliteName}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider">Edit Satellite</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {UNPROFILED_SATELLITE_COLUMNS.map((col, index) => {
              const field =
                index === 0
                  ? "satelliteName"
                  : index === 1
                    ? "countryOfOrigin"
                    : index === 2
                      ? "dateOfLaunch"
                      : "orbitalPosition";
              return (
                <div key={col} className="space-y-1.5">
                  <Label className="mono text-[10px] uppercase tracking-wider">{col}</Label>
                  <Input
                    value={editDraft[field]}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="mono uppercase tracking-wider">
              Delete satellite?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.satelliteName}</strong> from the unprofiled satellites
              list? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
