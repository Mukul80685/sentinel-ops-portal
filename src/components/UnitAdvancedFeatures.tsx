/**
 * Shared "Advanced Features" control — identical across all five main modules.
 * Add Unit asks ONLY for Unit Name + Unit Location (module-specific data is
 * entered later inside the unit). Delete Unit is scoped to the host module only.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Settings2, Trash2, X } from "lucide-react";
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
import { addOperationalUnit } from "@/lib/operationalStore";
import {
  MODULE_SCOPE_LABELS,
  purgeUnitFromModule,
  type ModuleScope,
} from "@/lib/moduleUnitRegistry";
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
  const [unitName, setUnitName] = useState("");
  const [unitLocation, setUnitLocation] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Unit | null>(null);

  const moduleLabel = MODULE_SCOPE_LABELS[scope];

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
    toast.success(`Unit "${created.name}" created.`);
    setUnitName("");
    setUnitLocation("");
    setAddOpen(false);
    refresh();
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const ok = purgeUnitFromModule(pendingDelete.id, scope);
    if (ok) {
      toast.success(`Unit "${pendingDelete.name}" removed from ${moduleLabel}.`);
    } else {
      toast.error("Unit could not be deleted.");
    }
    setPendingDelete(null);
    setDeleteOpen(false);
    refresh();
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

      {/* Delete Unit — pick a unit, then confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wide">Delete Unit</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Select the unit to remove from {moduleLabel} only.
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
            <AlertDialogTitle>Remove unit from {moduleLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">{pendingDelete?.name}</span> from{" "}
              {moduleLabel} only? This module&apos;s data for this unit will be cleared. The unit
              will remain available in all other features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Remove from Module
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
