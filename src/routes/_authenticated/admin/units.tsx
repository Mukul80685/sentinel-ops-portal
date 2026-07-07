import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useIsAdmin } from "@/lib/auth";
import type { OpUnit } from "@/lib/operationalDataset";
import {
  addOperationalUnit,
  getOperationalDataset,
  persistOperationalDataset,
  removeOperationalUnit,
} from "@/lib/operationalStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listUnits, exportCsv } from "@/lib/queries";
import { toggleSelection, allSelected } from "@/lib/dataTableUtils";

export const Route = createFileRoute("/_authenticated/admin/units")({ component: UnitsAdmin });

type UnitPatch = Partial<Pick<OpUnit, "code" | "name" | "description">>;

function updateOperationalUnit(id: string, patch: UnitPatch): boolean {
  const ds = getOperationalDataset();
  const unit = ds.units.find((u) => u.id === id);
  if (!unit) return false;

  Object.assign(unit, patch);

  if (patch.code !== undefined || patch.name !== undefined) {
    for (const eq of ds.equipment.filter((e) => e.unit_id === id)) {
      eq.units = { code: unit.code, name: unit.name };
    }
  }

  persistOperationalDataset(ds);
  return true;
}

function UnitsAdmin() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  if (!isAdmin)
    return (
      <AppShell title="Units" subtitle="Admin" showBack>
        <div className="panel p-6 mono text-muted-foreground">Admin access required.</div>
      </AppShell>
    );

  function update(id: string, patch: UnitPatch) {
    if (!updateOperationalUnit(id, patch)) {
      toast.error("Unit not found.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["units"] });
  }

  function remove(id: string) {
    if (!confirm("Delete unit and all related data?")) return;
    if (!removeOperationalUnit(id)) {
      toast.error("Unit not found.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["units"] });
    toast.success("Unit removed.");
  }

  const visibleIds = units.map((u) => u.id);
  const selectAll = allSelected(visibleIds, selectedIds);

  function handleSelectAll() {
    setSelectedIds(selectAll ? new Set() : new Set(visibleIds));
  }

  function confirmBulkDelete() {
    let deleted = 0;
    for (const id of selectedIds) {
      if (removeOperationalUnit(id)) deleted++;
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    qc.invalidateQueries({ queryKey: ["units"] });
    toast.success(`${deleted} unit(s) deleted.`);
  }

  return (
    <AppShell
      title="Units / Agencies"
      subtitle="Administration"
      showBack
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(units, "units.csv")}
            className="mono text-[11px] uppercase tracking-wider h-8"
          >
            CSV
          </Button>
          <AddUnit />
        </div>
      }
    >
      {selectedIds.size > 0 && (
        <div className="mb-2 px-3 py-2 rounded-md border border-border bg-primary/5 flex items-center gap-3 mono text-[11px]">
          <span className="text-primary font-bold">
            {selectedIds.size} unit{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="mono text-[11px] uppercase tracking-wider h-7"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected
          </Button>
        </div>
      )}

      <div className="panel overflow-auto">
        <table className="min-w-full text-sm mono">
          <thead className="bg-secondary text-secondary-foreground">
            <tr>
              <th className="px-3 py-2 w-8 border-r border-border">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  title="Select / deselect all"
                  className="cursor-pointer accent-primary"
                />
              </th>
              {["Code", "Name", "Description", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 text-[11px] uppercase tracking-wider border-r border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr
                key={u.id}
                className={`border-t border-border ${selectedIds.has(u.id) ? "bg-primary/5" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(u.id)}
                    onChange={() => setSelectedIds((s) => toggleSelection(s, u.id))}
                    className="cursor-pointer accent-primary"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={u.code}
                    onBlur={(e) => e.target.value !== u.code && update(u.id, { code: e.target.value })}
                    className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm font-bold uppercase"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={u.name}
                    onBlur={(e) => e.target.value !== u.name && update(u.id, { name: e.target.value })}
                    className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm w-64"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={u.description ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (u.description ?? "") &&
                      update(u.id, { description: e.target.value })
                    }
                    className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm w-72"
                  />
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => remove(u.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              Delete Units
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              Delete {selectedIds.size} unit{selectedIds.size !== 1 ? "s" : ""} and all their
              related data? This cannot be undone.
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
                confirmBulkDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function AddUnit() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: "", name: "", description: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    addOperationalUnit(form);
    toast.success("Unit registered");
    setOpen(false);
    setForm({ code: "", name: "", description: "" });
    qc.invalidateQueries({ queryKey: ["units"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Unit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider">Register Unit / Agency</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="label-eyebrow">Code *</Label>
            <Input
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. 61 WEU"
            />
          </div>
          <div>
            <Label className="label-eyebrow">Name *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label className="label-eyebrow">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full mono uppercase tracking-wider">
            Register
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
