import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Archive, ChevronRight, Plus, Settings2, X } from "lucide-react";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  INT_UNITS,
  type IntelUnit,
  generateMockIntelRecords,
  computeUnitStats,
  normalizeDbRow,
  loadImportedRecords,
  formatDisplayDate,
} from "@/lib/intelRepository";

export const Route = createFileRoute("/_authenticated/intel/")({
  component: IntelRepositoryHome,
});

function IntelRepositoryHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [localUnits, setLocalUnits] = useState<IntelUnit[]>(INT_UNITS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteMode, setDeleteMode]     = useState(false);
  const [addOpen, setAddOpen]           = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IntelUnit | null>(null);
  const [newName, setNewName]           = useState("");
  const [newLoc, setNewLoc]             = useState("");
  const [submitting, setSubmitting]     = useState(false);

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const { data: allDbRows = [] } = useQuery({
    queryKey: ["intel-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intel_records")
        .select("*, satellites:satellite_id(name), units:unit_id(code)");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  const unitStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeUnitStats>>();
    for (const unit of localUnits) {
      const dbForUnit = allDbRows
        .filter((r) => r.unit_id === unit.id || (dbUnits.find((u) => u.id === r.unit_id)?.code === unit.code))
        .map((r) => normalizeDbRow(r as Record<string, unknown>, unit.name));

      const imported = loadImportedRecords(unit.id);
      const records = dbForUnit.length + imported.length > 0
        ? [...dbForUnit, ...imported]
        : generateMockIntelRecords(unit.id, unit.name);

      map.set(unit.id, computeUnitStats(records));
    }
    return map;
  }, [localUnits, allDbRows, dbUnits]);

  function openAddUnit() { setAdvancedOpen(false); setAddOpen(true); }
  function enableDeleteMode() { setAdvancedOpen(false); setDeleteMode(true); }

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const code = newName.trim().split(" ").pop()?.charAt(0).toUpperCase() ?? "X";
      const { error } = await supabase.from("units").insert({
        code,
        name: newName.trim(),
        location: newLoc.trim() || "Unassigned Sector",
      });
      if (error) throw error;
      const newUnit: IntelUnit = {
        id: `unit-${Date.now()}`,
        code,
        name: newName.trim(),
        location: newLoc.trim() || "Unassigned Sector",
      };
      setLocalUnits((prev) => [...prev, newUnit]);
      toast.success(`${newUnit.name} added`);
      setNewName(""); setNewLoc(""); setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["units"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add unit");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeleteUnit() {
    if (!pendingDelete) return;
    try {
      const dbMatch = dbUnits.find((u) => u.code === pendingDelete.code);
      if (dbMatch) {
        const { error } = await supabase.from("units").delete().eq("id", dbMatch.id);
        if (error) throw error;
      }
      setLocalUnits((prev) => prev.filter((u) => u.id !== pendingDelete.id));
      toast.success(`${pendingDelete.name} removed`);
      setPendingDelete(null); setDeleteMode(false);
      qc.invalidateQueries({ queryKey: ["units"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete unit");
    }
  }

  return (
    <AppShell
      title="INT Repository"
      subtitle="Centralized Intelligence Collection Archive"
      headerIcon={<Archive className="h-4 w-4 shrink-0" />}
    >

      {/* Unit tile grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {localUnits.map((unit) => {
          const stats = unitStatsMap.get(unit.id);
          const pct = stats && stats.totalScanned > 0
            ? Math.round((stats.productive / stats.totalScanned) * 100)
            : 0;

          return (
            <div key={unit.id} className="relative group/tile">
              {/* Delete X badge */}
              {deleteMode && (
                <button
                  type="button"
                  aria-label={`Delete ${unit.name}`}
                  onClick={() => setPendingDelete(unit)}
                  className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 rounded-full border border-border
                             bg-card text-muted-foreground hover:bg-destructive hover:text-destructive-foreground
                             flex items-center justify-center transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}

              {/* Tile card — informational, NOT the click target */}
              <div className={`rounded-md border border-border bg-card shadow-sm p-3 transition-all duration-200
                              ${deleteMode ? "opacity-70" : ""}`}>

                {/* Header row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <div className="mono text-[11px] font-bold uppercase tracking-tight text-foreground leading-tight">
                      Unit {unit.code}
                    </div>
                    <div className="mono text-[8px] text-foreground/60 mt-0.5 truncate">
                      {unit.location}
                    </div>
                  </div>
                  <div className={`h-2 w-2 rounded-full mt-0.5 shrink-0 ${
                    pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-destructive/50"
                  }`} />
                </div>

                {/* Stats block */}
                {stats ? (
                  <div className="space-y-1 border-t border-border/60 pt-2">
                    <StatRow label="Satellites"  value={String(stats.satellitesProfiled)} />
                    <StatRow label="Productive"  value={stats.productive.toLocaleString()}    color="emerald" />
                    <StatRow label="Non-Prod"    value={stats.nonProductive.toLocaleString()} />
                    <StatRow label="Last Upload" value={stats.lastUpload ? formatDisplayDate(stats.lastUpload) : "—"} />
                  </div>
                ) : (
                  <div className="mono text-[8px] text-foreground/40 pt-1">No data</div>
                )}

                {/* Productivity bar */}
                {stats && stats.totalScanned > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-destructive/60"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`mono text-[8px] font-bold shrink-0 ${
                      pct >= 60 ? "text-emerald-600" : pct >= 30 ? "text-amber-500" : "text-destructive/80"
                    }`}>
                      {pct}%
                    </span>
                  </div>
                )}

                {/* ── ONLY this button is the click target ─────────────── */}
                {!deleteMode && (
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/intel/$unitId", params: { unitId: unit.id } })}
                    className="group/btn mt-2 pt-1.5 border-t border-border/40 w-full flex items-center
                               justify-between rounded-sm px-1 py-0.5
                               hover:bg-primary/8 hover:border-primary/30 focus:outline-none
                               focus:ring-1 focus:ring-primary/50 transition-all cursor-pointer"
                  >
                    <span className="mono text-[8px] uppercase tracking-wider text-foreground/50
                                     group-hover/btn:text-primary transition-colors">
                      Review Records
                    </span>
                    <ChevronRight className="h-3 w-3 text-foreground/30 group-hover/btn:text-primary transition-colors" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Advanced Features */}
      <div className="mt-4 flex items-center justify-end gap-2">
        {deleteMode && (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setDeleteMode(false)}>
            Exit delete mode
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setAdvancedOpen(true)} className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          Advanced Features
        </Button>
      </div>

      {/* Advanced Features dialog */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Advanced Features</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="justify-start" onClick={openAddUnit}>
              <Plus className="h-4 w-4 mr-2" /> Add Unit
            </Button>
            <Button
              type="button" variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={enableDeleteMode} disabled={localUnits.length === 0}
            >
              <X className="h-4 w-4 mr-2" /> Delete Unit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Unit dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Unit</DialogTitle></DialogHeader>
          <form onSubmit={handleAddUnit} className="space-y-3">
            <div>
              <Label className="label-eyebrow">Unit Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Unit India" className="mt-1" required />
            </div>
            <div>
              <Label className="label-eyebrow">Location / Sector</Label>
              <Input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="e.g. Forward Sector" className="mt-1" />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !newName.trim()}>Add Unit</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{pendingDelete?.name}</strong> from the INT Repository unit roster?
              Collection records for this unit will remain in the archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUnit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: "emerald" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="mono text-[8px] text-foreground/50 shrink-0">{label}</span>
      <span className={`mono text-[9px] font-semibold ${color === "emerald" ? "text-emerald-600" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
