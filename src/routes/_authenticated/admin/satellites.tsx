import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useIsAdmin } from "@/lib/auth";
import type { OpSatellite } from "@/lib/operationalDataset";
import {
  getOperationalDataset,
  persistOperationalDataset,
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
import { exportCsv, listSatellites } from "@/lib/queries";
import { toggleSelection, allSelected } from "@/lib/dataTableUtils";

export const Route = createFileRoute("/_authenticated/admin/satellites")({ component: SatellitesAdmin });

type StoredSatellite = OpSatellite & { notes?: string | null };

type SatelliteRow = {
  id: string;
  name: string;
  orbital_position: number;
  notes: string | null;
};

type SatellitePatch = Partial<Pick<SatelliteRow, "name" | "orbital_position" | "notes">>;

function listAdminSatellites(): SatelliteRow[] {
  const ds = getOperationalDataset();
  const notesById = new Map(
    ds.satellites.map((sat) => [sat.id, (sat as StoredSatellite).notes ?? null]),
  );

  return ds.satellites
    .map((sat) => ({
      id: sat.id,
      name: sat.name,
      orbital_position: sat.orbital_position,
      notes: notesById.get(sat.id) ?? null,
    }))
    .sort((a, b) => a.orbital_position - b.orbital_position);
}

function updateOperationalSatellite(id: string, patch: SatellitePatch): boolean {
  const ds = getOperationalDataset();
  const sat = ds.satellites.find((s) => s.id === id) as StoredSatellite | undefined;
  if (!sat) return false;

  if (patch.name !== undefined) sat.name = patch.name;
  if (patch.orbital_position !== undefined) sat.orbital_position = patch.orbital_position;
  if (patch.notes !== undefined) sat.notes = patch.notes;

  if (patch.name !== undefined) {
    for (const eng of ds.engagements.filter((e) => e.satellite_id === id)) {
      eng.satellites = { name: sat.name };
    }
  }

  persistOperationalDataset(ds);
  return true;
}

function removeOperationalSatellite(id: string): void {
  const ds = getOperationalDataset();
  ds.satellites = ds.satellites.filter((s) => s.id !== id);
  ds.engagements = ds.engagements.filter((e) => e.satellite_id !== id);
  ds.intelRows = (ds.intelRows ?? []).filter((r) => r.satellite_id !== id);
  persistOperationalDataset(ds);
}

function addOperationalSatellite(input: {
  name: string;
  orbital_position: number;
  notes: string;
}): void {
  const ds = getOperationalDataset();
  const satellite: StoredSatellite = {
    id: `op-sat-${Date.now()}`,
    name: input.name.trim(),
    orbital_position: Number(input.orbital_position),
    notes: input.notes.trim() || null,
  };
  ds.satellites.push(satellite);
  persistOperationalDataset(ds);
}

function SatellitesAdmin() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data: sats = [] } = useQuery({
    queryKey: ["sats"],
    queryFn: async () => {
      await listSatellites();
      return listAdminSatellites();
    },
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  if (!isAdmin)
    return (
      <AppShell title="Satellites" subtitle="Admin" showBack>
        <div className="panel p-6 mono text-muted-foreground">Admin access required.</div>
      </AppShell>
    );

  function update(id: string, patch: SatellitePatch) {
    if (!updateOperationalSatellite(id, patch)) {
      toast.error("Satellite not found.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["sats"] });
  }

  function remove(id: string) {
    if (!confirm("Delete satellite?")) return;
    removeOperationalSatellite(id);
    qc.invalidateQueries({ queryKey: ["sats"] });
    toast.success("Satellite removed.");
  }

  const visibleIds = sats.map((s) => s.id);
  const selectAll = allSelected(visibleIds, selectedIds);

  function handleSelectAll() {
    setSelectedIds(selectAll ? new Set() : new Set(visibleIds));
  }

  function confirmBulkDelete() {
    const count = selectedIds.size;
    for (const id of selectedIds) {
      removeOperationalSatellite(id);
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    qc.invalidateQueries({ queryKey: ["sats"] });
    toast.success(`${count} satellite(s) deleted.`);
  }

  return (
    <AppShell
      title="Satellites"
      subtitle="Administration"
      showBack
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(sats, "satellites.csv")}
            className="mono text-[11px] uppercase tracking-wider h-8"
          >
            CSV
          </Button>
          <AddSat />
        </div>
      }
    >
      {selectedIds.size > 0 && (
        <div className="mb-2 px-3 py-2 rounded-md border border-border bg-primary/5 flex items-center gap-3 mono text-[11px]">
          <span className="text-primary font-bold">
            {selectedIds.size} satellite{selectedIds.size !== 1 ? "s" : ""} selected
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
              {["Name", "Orbital Position", "Notes", ""].map((h) => (
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
            {sats.map((s) => (
              <tr
                key={s.id}
                className={`border-t border-border ${selectedIds.has(s.id) ? "bg-primary/5" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => setSelectedIds((prev) => toggleSelection(prev, s.id))}
                    className="cursor-pointer accent-primary"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={s.name}
                    onBlur={(e) => e.target.value !== s.name && update(s.id, { name: e.target.value })}
                    className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm font-bold"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={s.orbital_position}
                    onBlur={(e) =>
                      Number(e.target.value) !== Number(s.orbital_position) &&
                      update(s.id, { orbital_position: Number(e.target.value) })
                    }
                    className="w-24 bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={s.notes ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (s.notes ?? "") && update(s.id, { notes: e.target.value })
                    }
                    className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm w-72"
                  />
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
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
              Delete Satellites
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              Delete {selectedIds.size} satellite{selectedIds.size !== 1 ? "s" : ""} and all their
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

function AddSat() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", orbital_position: 0, notes: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    addOperationalSatellite(form);
    toast.success("Satellite added");
    setOpen(false);
    setForm({ name: "", orbital_position: 0, notes: "" });
    qc.invalidateQueries({ queryKey: ["sats"] });
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
          <DialogTitle className="mono uppercase tracking-wider">Register Satellite</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="label-eyebrow">Name *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. SAT-1"
            />
          </div>
          <div>
            <Label className="label-eyebrow">Orbital Position (°E) *</Label>
            <Input
              required
              type="number"
              step="0.1"
              value={form.orbital_position}
              onChange={(e) => setForm({ ...form, orbital_position: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="label-eyebrow">Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
