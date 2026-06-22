import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { Archive, ChevronRight, Plus, Search, Settings2, X } from "lucide-react";
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
  applyIntelFilter,
  makeSatelliteKey,
  EMPTY_INTEL_FILTER,
} from "@/lib/intelRepository";

export const Route = createFileRoute("/_authenticated/intel/")({
  component: IntelRepositoryHome,
});

function IntelRepositoryHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [localUnits, setLocalUnits] = useState<IntelUnit[]>(INT_UNITS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IntelUnit | null>(null);
  const [newName, setNewName] = useState("");
  const [newLoc, setNewLoc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  // Fetch all intel records once for unit-level stats
  const { data: allDbRows = [] } = useQuery({
    queryKey: ["intel-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intel_records")
        .select("*, satellites:satellite_id(name), units:unit_id(code)");
      if (error) throw error;
      return data ?? [];
    },
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

  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim();
    if (!q) return [];
    const filter = { ...EMPTY_INTEL_FILTER, q };
    const results: { unitId: string; unitName: string; satellite: string; polarization: string; key: string; matchCount: number }[] = [];

    for (const unit of localUnits) {
      const dbForUnit = allDbRows
        .filter((r) => r.unit_id === unit.id)
        .map((r) => normalizeDbRow(r as Record<string, unknown>, unit.name));
      const imported = loadImportedRecords(unit.id);
      const records = dbForUnit.length + imported.length > 0
        ? [...dbForUnit, ...imported]
        : generateMockIntelRecords(unit.id, unit.name);

      const matched = applyIntelFilter(records, filter);
      if (matched.length === 0) continue;

      const bySat = new Map<string, number>();
      for (const r of matched) {
        const key = makeSatelliteKey(r.satellite, r.polarization);
        bySat.set(key, (bySat.get(key) ?? 0) + 1);
      }
      for (const [key, count] of bySat) {
        const sample = matched.find((r) => makeSatelliteKey(r.satellite, r.polarization) === key)!;
        results.push({
          unitId: unit.id,
          unitName: unit.name,
          satellite: sample.satellite,
          polarization: sample.polarization,
          key,
          matchCount: count,
        });
      }
    }
    return results.slice(0, 20);
  }, [globalSearch, localUnits, allDbRows]);

  function openAddUnit() {
    setAdvancedOpen(false);
    setAddOpen(true);
  }

  function enableDeleteMode() {
    setAdvancedOpen(false);
    setDeleteMode(true);
  }

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
      setNewName("");
      setNewLoc("");
      setAddOpen(false);
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
      setPendingDelete(null);
      setDeleteMode(false);
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
      {/* Global repository search */}
      <div className="panel p-3 mb-4">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search across all units — satellite, frequency, operator, remarks, analysis…"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="pl-7 mono text-[11px] h-8"
          />
        </div>
        {globalSearch.trim() && (
          <div className="mt-2 space-y-1">
            {globalSearchResults.length === 0 ? (
              <p className="mono text-[10px] text-muted-foreground">No matches across the repository.</p>
            ) : (
              globalSearchResults.map((r) => (
                <button
                  key={`${r.unitId}-${r.key}`}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/intel/$unitId/$satelliteKey",
                      params: { unitId: r.unitId, satelliteKey: r.key },
                    })
                  }
                  className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm
                             hover:bg-secondary/60 transition-colors mono text-[10px]"
                >
                  <span>
                    <span className="font-bold text-foreground uppercase">{r.satellite}</span>
                    <span className="text-muted-foreground"> · {r.polarization} · {r.unitName}</span>
                  </span>
                  <span className="text-primary shrink-0">{r.matchCount} match{r.matchCount !== 1 ? "es" : ""}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── All Units aggregate entry ────────────────────────────────────── */}
      {(() => {
        const totals = Array.from(unitStatsMap.values()).reduce(
          (acc, s) => ({
            satellites: acc.satellites + s.satellitesProfiled,
            scanned:    acc.scanned    + s.totalScanned,
            productive: acc.productive + s.productive,
            nonProd:    acc.nonProd    + s.nonProductive,
          }),
          { satellites: 0, scanned: 0, productive: 0, nonProd: 0 },
        );
        const pct = totals.scanned > 0
          ? Math.round((totals.productive / totals.scanned) * 100)
          : 0;
        return (
          <div className="mb-3 rounded-md border border-border bg-card shadow-sm hover:shadow-md hover:border-primary/40 hover:bg-secondary/20 transition-all duration-200 cursor-default">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="mono text-[11px] font-bold uppercase tracking-wide text-foreground">
                  All Units Overview
                </div>
                <div className="mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground/50 mt-0.5">
                  {localUnits.length} Operational Units · Aggregate Intelligence
                </div>
              </div>
              <div className="flex items-center gap-5">
                <AggregateStat label="Satellites" value={totals.satellites} />
                <AggregateStat label="Scanned"    value={totals.scanned.toLocaleString()} />
                <AggregateStat label="Productive" value={totals.productive.toLocaleString()} color="emerald" />
                <AggregateStat label="Non-Prod"   value={totals.nonProd.toLocaleString()} />
                <div className="flex flex-col items-end gap-1">
                  <span className={`mono text-[13px] font-bold ${pct >= 60 ? "text-emerald-600" : pct >= 30 ? "text-amber-500" : "text-destructive/80"}`}>
                    {pct}%
                  </span>
                  <div className="w-24 h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-destructive/60"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Individual unit tiles ─────────────────────────────────────────── */}
      <div className="mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground/50 mb-2 font-semibold">
        Operational Units
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {localUnits.map((unit) => {
          const stats = unitStatsMap.get(unit.id);
          const pct = stats && stats.totalScanned > 0
            ? Math.round((stats.productive / stats.totalScanned) * 100)
            : 0;
          return (
            <div key={unit.id} className="relative group/tile">
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
              <button
                type="button"
                onClick={() => !deleteMode && navigate({ to: "/intel/$unitId", params: { unitId: unit.id } })}
                className={`w-full text-left rounded-md border border-border bg-card shadow-sm p-3
                            focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200
                            ${deleteMode
                              ? "cursor-default opacity-70"
                              : "hover:border-primary/50 hover:shadow-md hover:bg-secondary/15 cursor-pointer"
                            }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <div className="mono text-[11px] font-bold uppercase tracking-tight text-foreground leading-tight">
                      Unit {unit.code}
                    </div>
                    <div className="mono text-[8px] text-muted-foreground/55 mt-0.5 truncate">
                      {unit.location}
                    </div>
                  </div>
                  <div className={`h-2 w-2 rounded-full mt-0.5 shrink-0 ${pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-destructive/50"}`} />
                </div>

                {/* Stats block */}
                {stats ? (
                  <div className="space-y-1 border-t border-border/60 pt-2">
                    <StatRow label="Satellites"  value={String(stats.satellitesProfiled)} />
                    <StatRow label="Productive"  value={stats.productive.toLocaleString()}   color="emerald" />
                    <StatRow label="Non-Prod"    value={stats.nonProductive.toLocaleString()} />
                    <StatRow label="Last Upload" value={stats.lastUpload ? formatDisplayDate(stats.lastUpload) : "—"} />
                  </div>
                ) : (
                  <div className="mono text-[8px] text-muted-foreground/35 pt-1">No data</div>
                )}

                {/* Productivity bar */}
                {stats && stats.totalScanned > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-destructive/60"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`mono text-[8px] font-bold shrink-0 ${pct >= 60 ? "text-emerald-600" : pct >= 30 ? "text-amber-500" : "text-destructive/80"}`}>
                      {pct}%
                    </span>
                  </div>
                )}

                {/* Click affordance */}
                {!deleteMode && (
                  <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between">
                    <span className="mono text-[7px] uppercase tracking-wider text-muted-foreground/35">View Records</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover/tile:text-primary transition-colors" />
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Advanced Features — bottom-right */}
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
          <DialogHeader>
            <DialogTitle>Advanced Features</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="justify-start" onClick={openAddUnit}>
              <Plus className="h-4 w-4 mr-2" /> Add Unit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={enableDeleteMode}
              disabled={localUnits.length === 0}
            >
              <X className="h-4 w-4 mr-2" /> Delete Unit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Unit dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Unit</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUnit} className="space-y-3">
            <div>
              <Label className="label-eyebrow">Unit Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Unit India" className="mt-1" required />
            </div>
            <div>
              <Label className="label-eyebrow">Location / Sector</Label>
              <Input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="e.g. Forward Sector" className="mt-1" />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !newName.trim()}>
              Add Unit
            </Button>
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

function StatLine({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "emerald";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[10px] mono leading-snug">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={highlight === "emerald" ? "text-emerald-400 font-bold" : "text-foreground font-medium"}>
        {value}
      </span>
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "emerald";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="mono text-[8px] text-muted-foreground/55 shrink-0">{label}</span>
      <span className={`mono text-[9px] font-semibold ${color === "emerald" ? "text-emerald-600" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function AggregateStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: "emerald";
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`mono text-[13px] font-bold leading-none ${color === "emerald" ? "text-emerald-600" : "text-foreground"}`}>
        {value}
      </span>
      <span className="mono text-[7px] uppercase tracking-[0.15em] text-muted-foreground/45 leading-none">
        {label}
      </span>
    </div>
  );
}
