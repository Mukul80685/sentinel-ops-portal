/**
 * Shared "Advanced Features" control — identical across all five main modules.
 * Add Unit asks ONLY for Unit Name + Unit Location (module-specific data is
 * entered later inside the unit). Delete Unit removes the unit globally so the
 * Satellite Monitoring Dashboard stays in sync.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
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
import {
  addOperationalUnit,
  purgeUnitCompletely,
  updateOperationalUnit,
} from "@/lib/operationalStore";
import {
  clearUnitFromAllHiddenLists,
  unhideUnitInAllModules,
  type ModuleScope,
} from "@/lib/moduleUnitRegistry";
import { clearUnitScanHistory } from "@/lib/scanHistoryStore";
import { useModuleUnits } from "@/hooks/useModuleUnits";
import type { Unit } from "@/lib/queries";

export function UnitAdvancedFeatures({
  scope,
  onUnitsChanged,
  align = "end",
  noTopMargin = false,
}: {
  /** Which module hosts this control — delete only affects this vertical. */
  scope: ModuleScope;
  /** Called after a unit is added or deleted so the host page can refresh local state. */
  onUnitsChanged?: () => void;
  /** Horizontal alignment of the trigger button. */
  align?: "start" | "center" | "end";
  /** When true, omit default top margin (host provides spacing). */
  noTopMargin?: boolean;
}) {
  const queryClient = useQueryClient();
  const { units } = useModuleUnits(scope);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [unitName, setUnitName] = useState("");
  const [unitLocation, setUnitLocation] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Unit | null>(null);
  const [pendingRename, setPendingRename] = useState<Unit | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameLocation, setRenameLocation] = useState("");

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["units"] });
    queryClient.invalidateQueries();
    onUnitsChanged?.();
  }

  function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!unitName.trim()) {
      toast.error("Unit Name is required.");
      return;
    }
    if (!unitLocation.trim()) {
      toast.error("Unit Location is required.");
      return;
    }
    const created = addOperationalUnit({
      name: unitName.trim(),
      description: unitLocation.trim(),
    });
    unhideUnitInAllModules(created.id);
    toast.success(`Unit "${created.name}" created.`);
    setUnitName("");
    setUnitLocation("");
    setAddOpen(false);
    refresh();
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const label = pendingDelete.name;
    const ok = purgeUnitCompletely(pendingDelete.id);
    if (ok) {
      clearUnitFromAllHiddenLists(pendingDelete.id);
      clearUnitScanHistory(pendingDelete.id);
      toast.success(`Unit "${label}" deleted from all modules.`);
    } else {
      toast.error("Unit could not be deleted.");
    }
    setPendingDelete(null);
    setDeleteOpen(false);
    refresh();
  }

  function openRenameDialog(unit: Unit) {
    setPendingRename(unit);
    setRenameName(unit.name);
    setRenameLocation(unit.description ?? "");
    setRenameOpen(true);
  }

  function handleRenameUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingRename) return;
    if (!renameName.trim()) {
      toast.error("Unit Name is required.");
      return;
    }
    if (!renameLocation.trim()) {
      toast.error("Unit Location is required.");
      return;
    }
    const updated = updateOperationalUnit(pendingRename.id, {
      name: renameName.trim(),
      description: renameLocation.trim(),
    });
    if (updated) {
      toast.success(`Unit renamed to "${updated.name}".`);
      setRenameOpen(false);
      setPendingRename(null);
      refresh();
    } else {
      toast.error("Unit could not be updated.");
    }
  }

  const alignCls =
    align === "center" ? "justify-center" : align === "start" ? "justify-start" : "justify-end";

  return (
    <>
      {/* Trigger — placement controlled by host via align prop */}
      <div className={`${noTopMargin ? "" : "mt-4"} flex items-center ${alignCls} gap-2`}>
        <Button
          variant="outline"
          size="sm"
          className="mono text-[11px] uppercase tracking-wider gap-1.5"
          onClick={() => setAdvancedOpen(true)}
        >
          <Settings2 className="h-4 w-4" />
          Advanced Features
        </Button>
      </div>

      {/* Advanced Features menu */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wide">Advanced Features</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="mono justify-start gap-2 uppercase text-[12px] tracking-wider"
              onClick={() => {
                setAdvancedOpen(false);
                setUnitName("");
                setUnitLocation("");
                setAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Unit
            </Button>
            <Button
              variant="outline"
              className="mono justify-start gap-2 uppercase text-[12px] tracking-wider"
              disabled={units.length === 0}
              onClick={() => {
                setAdvancedOpen(false);
                setPendingRename(null);
                setRenameOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" /> Change Unit Name & Location
            </Button>
            <Button
              variant="outline"
              className="mono justify-start gap-2 uppercase text-[12px] tracking-wider"
              disabled={units.length === 0}
              onClick={() => {
                setAdvancedOpen(false);
                setPendingDelete(null);
                setDeleteOpen(true);
              }}
            >
              <X className="h-4 w-4" /> Delete Unit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Unit — universal: name + location ONLY */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wide">Add Unit</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUnit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="af-unit-name" className="mono text-[11px] uppercase tracking-wider">
                Unit Name
              </Label>
              <Input
                id="af-unit-name"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="e.g. Alpha Unit"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="af-unit-loc" className="mono text-[11px] uppercase tracking-wider">
                Unit Location
              </Label>
              <Input
                id="af-unit-loc"
                value={unitLocation}
                onChange={(e) => setUnitLocation(e.target.value)}
                placeholder="e.g. Location A"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Unit</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Unit — pick unit, then edit name + location */}
      <Dialog open={renameOpen && !pendingRename} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wide">
              Change Unit Name & Location
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Select the unit to rename. Changes apply across all administrator modules and the
            Satellite Monitoring Dashboard.
          </p>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {units.map((u) => (
              <Button
                key={u.id}
                variant="outline"
                className="mono justify-between gap-2 text-[12px] w-full"
                onClick={() => openRenameDialog(u)}
              >
                <span className="truncate">
                  {u.name}
                  {u.description ? (
                    <span className="text-muted-foreground"> — {u.description}</span>
                  ) : null}
                </span>
                <Pencil className="h-3.5 w-3.5 shrink-0" />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingRename}
        onOpenChange={(o) => {
          if (!o) setPendingRename(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wide">
              Change Unit Name & Location
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenameUnit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rn-unit-name" className="mono text-[11px] uppercase tracking-wider">
                Unit Name
              </Label>
              <Input
                id="rn-unit-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rn-unit-loc" className="mono text-[11px] uppercase tracking-wider">
                Unit Location
              </Label>
              <Input
                id="rn-unit-loc"
                value={renameLocation}
                onChange={(e) => setRenameLocation(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPendingRename(null)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Unit — pick a unit, then confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wide">Delete Unit</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Select the unit to delete. This removes the unit and its data from all administrator
            modules and the Satellite Monitoring Dashboard.
          </p>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {units.map((u) => (
              <Button
                key={u.id}
                variant="outline"
                className="mono justify-between gap-2 text-[12px] w-full"
                onClick={() => setPendingDelete(u)}
              >
                <span className="truncate">
                  {u.name}
                  {u.description ? (
                    <span className="text-muted-foreground"> — {u.description}</span>
                  ) : null}
                </span>
                <Trash2 className="h-3.5 w-3.5 text-destructive shrink-0" />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete unit permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">{pendingDelete?.name}</span>? This
              removes the unit from every administrator module and the Satellite Monitoring
              Dashboard. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete Unit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
