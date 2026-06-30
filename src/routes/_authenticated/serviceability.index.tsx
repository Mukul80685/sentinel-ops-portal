import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits, listCategories, listAllEquipmentDetailed, type Unit } from "@/lib/queries";
import type { OpServiceability } from "@/lib/operationalDataset";
import {
  addOperationalUnit,
  insertFaultDetail,
  removeOperationalUnit,
  updateOperationalEquipment,
} from "@/lib/operationalStore";
import { useCanEdit } from "@/lib/auth";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Satellite as SatelliteIcon,
  Zap,
  Radio,
  Cpu,
  Server,
  Package,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  RefreshCw,
  Settings2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/serviceability/")({
  component: ServiceabilityPage,
});

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_OK       = "Operational";
const STATUS_PARTIAL  = "Partially Serviceable";
const STATUS_REPAIR   = "Under Repair";
const STATUS_BAD      = "Non-Serviceable";

function isFaulty(s: string) { return s !== STATUS_OK; }
function isPartial(s: string) { return s === STATUS_PARTIAL || s === STATUS_REPAIR; }

function statusColor(s: string) {
  if (s === STATUS_OK)      return "#22c55e";
  if (s === STATUS_PARTIAL) return "#f59e0b";
  if (s === STATUS_REPAIR)  return "#f97316";
  return "#ef4444";
}

function StatusDot({ s, size = 10 }: { s: string; size?: number }) {
  return (
    <span
      className="shrink-0 inline-block rounded-full"
      style={{ width: size, height: size, backgroundColor: statusColor(s) }}
      title={s}
    />
  );
}

// Percentage → colour  (green ≥85 · amber 60–84 · red <60)
function pctColor(pct: number): string {
  if (pct >= 85) return "#22c55e";
  if (pct >= 60) return "#f59e0b";
  return "#ef4444";
}

// NATO phonetic alphabet → "Unit X" display label
const NATO_TO_LETTER: Record<string, string> = {
  alpha: "A", bravo: "B", charlie: "C", delta: "D",
  echo:  "E", foxtrot: "F", golf: "G", hotel: "H",
  india: "I", juliet: "J", kilo: "K", lima:  "L",
};
function unitDisplayName(u: { code: string; name: string }, idx: number): string {
  const hay = `${u.code} ${u.name}`.toLowerCase();
  for (const [key, letter] of Object.entries(NATO_TO_LETTER)) {
    if (hay.includes(key)) return `Unit ${letter}`;
  }
  return `Unit ${String.fromCharCode(65 + idx)}`;
}

// ─── Category icon map ─────────────────────────────────────────────────────────

function catIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("antenna"))    return SatelliteIcon;
  if (n.includes("lna"))        return Zap;
  if (n.includes("lnb"))        return Radio;
  if (n.includes("demod"))      return Cpu;
  if (n.includes("server"))     return Server;
  return Package;
}

// ─── Readiness donut SVG ───────────────────────────────────────────────────────
// Three-segment arc: green (ok) → amber (partial/repair) → red (bad)

function DonutRing({
  ok, partial, bad, total, size = 52,
}: {
  ok: number; partial: number; bad: number; total: number; size?: number;
}) {
  const cx = size / 2, cy = size / 2;
  const r  = size * 0.35;
  const sw = size * 0.15;
  const c  = 2 * Math.PI * r;
  const pct = total === 0 ? 0 : Math.round((ok / total) * 100);

  const seg = (len: number, offset: number, color: string) =>
    len > 0 ? (
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeDasharray={`${len} ${c}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    ) : null;

  const okLen      = (ok / Math.max(total, 1)) * c;
  const partialLen = (partial / Math.max(total, 1)) * c;
  const badLen     = (bad / Math.max(total, 1)) * c;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={sw} />
      {seg(okLen,       0,                     "#22c55e")}
      {seg(partialLen,  okLen,                 "#f59e0b")}
      {seg(badLen,      okLen + partialLen,    "#ef4444")}
      <text
        x={cx} y={cy + size * 0.1}
        textAnchor="middle"
        fontSize={size * 0.22}
        fontFamily="monospace"
        fontWeight="bold"
        fill="currentColor"
      >
        {pct}%
      </text>
    </svg>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type CatStatEntry = {
  cat: { id: string; name: string; sort_order: number };
  items: any[];
  ok: number;
  partial: number;
  bad: number;
  total: number;
};

function ServiceabilityPage() {
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [activeCatStat, setActiveCatStat]   = useState<CatStatEntry | null>(null);

  // ── Advanced Features state (mirrors Resource Inventory pattern) ──────────────
  const [advancedOpen,  setAdvancedOpen]  = useState(false);
  const [addUnitOpen,   setAddUnitOpen]   = useState(false);
  const [deleteMode,    setDeleteMode]    = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ unit: Unit; label: string } | null>(null);
  const [unitName,      setUnitName]      = useState("");
  const [unitLocation,  setUnitLocation]  = useState("");
  const [submitting,    setSubmitting]    = useState(false);

  function openAddUnit() { setAdvancedOpen(false); setUnitName(""); setUnitLocation(""); setAddUnitOpen(true); }
  function enableDeleteMode() { setAdvancedOpen(false); setDeleteMode(true); }

  async function handleAddUnit() {
    if (!unitName.trim() || !unitLocation.trim()) {
      toast.error("Unit Name and Location are required.");
      return;
    }
    setSubmitting(true);
    try {
      const nextCode = `UNIT-${String.fromCharCode(65 + (units as Unit[]).length)}`;
      addOperationalUnit({
        code: nextCode,
        name: unitName.trim(),
        description: unitLocation.trim(),
      });
      await qc.invalidateQueries({ queryKey: ["units"] });
      await qc.invalidateQueries({ queryKey: ["equipment-all"] });
      toast.success(`${unitName.trim()} registered.`);
      setAddUnitOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add unit.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeleteUnit() {
    if (!pendingDelete) return;
    setSubmitting(true);
    try {
      if (!removeOperationalUnit(pendingDelete.unit.id)) {
        throw new Error("Unit not found.");
      }
      await qc.invalidateQueries({ queryKey: ["units"] });
      await qc.invalidateQueries({ queryKey: ["equipment-all"] });
      toast.success(`${pendingDelete.label} removed.`);
      setPendingDelete(null);
      if ((units as Unit[]).length <= 1) setDeleteMode(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete unit.");
    } finally {
      setSubmitting(false);
    }
  }

  const { data: units = [] }      = useQuery({ queryKey: ["units"],      queryFn: listUnits });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-all"],
    queryFn: listAllEquipmentDetailed,
  });

  // ── Category stats (computed from live equipment data) ──────────────────────
  const catStats = useMemo(() => {
    return categories.map((cat) => {
      const items = equipment.filter((e: any) => e.category_id === cat.id);
      const ok      = items.filter((e: any) => e.serviceability === STATUS_OK).length;
      const partial = items.filter((e: any) => isPartial(e.serviceability)).length;
      const bad     = items.filter((e: any) => e.serviceability === STATUS_BAD).length;
      return { cat, items, ok, partial, bad, total: items.length };
    });
  }, [categories, equipment]);

  // ── Unit stats ──────────────────────────────────────────────────────────────
  const unitStats = useMemo(() => {
    return units.map((u, idx) => {
      const items   = equipment.filter((e: any) => e.unit_id === u.id);
      const ok      = items.filter((e: any) => e.serviceability === STATUS_OK).length;
      const partial = items.filter((e: any) => isPartial(e.serviceability)).length;
      const bad     = items.filter((e: any) => e.serviceability === STATUS_BAD).length;
      const faults  = items.filter((e: any) => isFaulty(e.serviceability)).length;
      const pct     = items.length === 0 ? 100 : Math.round((ok / items.length) * 100);
      const total   = items.length;

      // Category breakdown for the secondary summary line
      const catCounts: Record<string, number> = {};
      for (const e of items as any[]) {
        const catName: string = e.category?.name ?? "Other";
        catCounts[catName] = (catCounts[catName] ?? 0) + 1;
      }
      const summaryParts = Object.entries(catCounts).map(([n, c]) => `${n}: ${c}`);
      summaryParts.push(`Total Items: ${total}`);
      const summary = summaryParts.join(" | ");

      // Normalised display label ("Unit A", "Unit B" …)
      const displayName = unitDisplayName(u, idx);

      return { unit: u, items, ok, partial, bad, faults, pct, total, catCounts, summary, displayName };
    });
  }, [units, equipment]);

  const selectedUnit  = units.find((u) => u.id === selectedUnitId) ?? null;
  const unitEquipment = equipment.filter((e: any) => e.unit_id === selectedUnitId);

  return (
    <AppShell title="Serviceability State" subtitle="Operational Readiness">
      {selectedUnitId ? (
        <UnitDetail
          unit={selectedUnit}
          equipment={unitEquipment}
          canEdit={canEdit}
          onBack={() => setSelectedUnitId(null)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["equipment-all"] })}
        />
      ) : (
        <div className="space-y-5">
          {/* ── Category overview ──────────────────────────────────────────── */}
          <section>
            <div className="label-eyebrow mb-3">Equipment Category Readiness</div>
            {catStats.length === 0 ? (
              <Empty title="No equipment categories found" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {catStats.map((stat) => {
                  const { cat, ok, partial, bad, total } = stat;
                  const Icon = catIcon(cat.name);
                  return (
                    <div key={cat.id} className="panel p-4 flex flex-col gap-3">
                      {/* Header */}
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 grid place-items-center rounded-sm border border-border bg-secondary shrink-0">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="mono text-xs font-bold uppercase tracking-tight">{cat.name}</div>
                          <div className="mono text-[10px] text-muted-foreground">{total} total</div>
                        </div>
                      </div>

                      {/* Donut (clickable) + legend */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          title="Click to expand readiness breakdown"
                          onClick={() => setActiveCatStat(stat)}
                          className="shrink-0 rounded-full hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary transition-opacity"
                        >
                          <DonutRing ok={ok} partial={partial} bad={bad} total={total} size={52} />
                        </button>
                        <div className="space-y-1 text-[10px] mono">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="text-muted-foreground">{ok} Serviceable</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                            <span className="text-muted-foreground">{partial} Partially Serviceable</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" />
                            <span className="text-muted-foreground">{bad} Non-Serviceable</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Unit-wise readiness ─────────────────────────────────────────── */}
          <section>
            <div className="label-eyebrow mb-3">Unit-Wise Readiness</div>
            {units.length === 0 ? (
              <Empty title="No units registered" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {unitStats.map(({ unit, ok, partial, bad, pct, displayName }) => (
                  <div key={unit.id} className="relative">
                    {/* Delete X badge (delete mode only) */}
                    {deleteMode && (
                      <button
                        type="button"
                        aria-label={`Delete ${displayName}`}
                        onClick={() => setPendingDelete({ unit: unit as Unit, label: displayName })}
                        className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 rounded-full border border-border
                                   bg-card text-muted-foreground hover:bg-destructive hover:text-destructive-foreground
                                   flex items-center justify-center transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => !deleteMode && setSelectedUnitId(unit.id)}
                      className={`w-full panel text-left transition-all duration-150 focus:outline-none
                                  focus:ring-1 focus:ring-primary p-3 overflow-hidden
                                  ${deleteMode
                                    ? "cursor-default opacity-80"
                                    : "hover:bg-secondary/60 hover:scale-[1.02] hover:shadow-md"}`}
                    >
                      {/* Line 1: Unit Name – Percentage (% value coloured only) */}
                      <div className="mono text-sm font-bold uppercase tracking-tight leading-tight truncate">
                        {displayName}{" "}–{" "}
                        <span style={{ color: pctColor(pct) }}>{pct}%</span>
                      </div>

                      {/* Line 2: Status icon counts — ✔ ok | ⚠ partial | ✖ faulty */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-0.5 mono text-[10px] text-emerald-500 shrink-0">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />{ok}
                        </span>
                        <span className="text-muted-foreground/30 text-[10px] shrink-0">|</span>
                        <span className="inline-flex items-center gap-0.5 mono text-[10px] text-amber-400 shrink-0">
                          <AlertTriangle className="h-3 w-3 shrink-0" />{partial}
                        </span>
                        <span className="text-muted-foreground/30 text-[10px] shrink-0">|</span>
                        <span className="inline-flex items-center gap-0.5 mono text-[10px] text-destructive shrink-0">
                          <XCircle className="h-3 w-3 shrink-0" />{bad}
                        </span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Advanced Features — bottom-right (mirrors Resource Inventory) ── */}
            <div className="mt-4 flex items-center justify-end gap-2">
              {deleteMode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setDeleteMode(false)}
                >
                  Exit delete mode
                </Button>
              )}
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
          </section>
        </div>
      )}

      {/* ── Category readiness detail dialog ───────────────────────────────── */}
      <CategoryReadinessDialog
        stat={activeCatStat}
        onClose={() => setActiveCatStat(null)}
      />

      {/* ── Advanced Features dialog ────────────────────────────────────────── */}
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
              disabled={(units as Unit[]).length === 0}
            >
              <X className="h-4 w-4 mr-2" /> Delete Unit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Unit dialog ─────────────────────────────────────────────────── */}
      <Dialog open={addUnitOpen} onOpenChange={(o) => { setAddUnitOpen(o); if (!o) { setUnitName(""); setUnitLocation(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="svc-unit-name">Unit Name</Label>
              <Input
                id="svc-unit-name"
                required
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="Enter unit name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-unit-location">Location</Label>
              <Input
                id="svc-unit-location"
                required
                value={unitLocation}
                onChange={(e) => setUnitLocation(e.target.value)}
                placeholder="Enter location"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setAddUnitOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddUnit} disabled={submitting || !unitName.trim() || !unitLocation.trim()}>
              {submitting ? "Saving…" : "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Remove ${pendingDelete.label} (${pendingDelete.unit.name}) and all related data? This cannot be undone.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={confirmDeleteUnit}
              disabled={submitting}
              className="bg-muted text-muted-foreground hover:bg-muted/80 border border-border shadow-none"
            >
              YES
            </AlertDialogAction>
            <AlertDialogCancel className="bg-primary text-primary-foreground hover:bg-primary/90 border-0">
              NO
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

// ─── Unit detail view ─────────────────────────────────────────────────────────

function UnitDetail({
  unit,
  equipment,
  canEdit,
  onBack,
  onRefresh,
}: {
  unit: any;
  equipment: any[];
  canEdit: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [statusChangeItem, setStatusChangeItem] = useState<any | null>(null);

  const byCategory: Record<string, any[]> = {};
  for (const e of equipment) {
    const catName = e.category?.name ?? "Uncategorised";
    (byCategory[catName] ??= []).push(e);
  }

  const faultCount = equipment.filter((e) => isFaulty(e.serviceability)).length;

  function statusBadge(s: string) {
    if (s === STATUS_OK)
      return (
        <span className="inline-flex items-center gap-1 mono text-[10px] text-emerald-600">
          <CheckCircle2 className="h-3 w-3 shrink-0" /> Serviceable
        </span>
      );
    if (isPartial(s))
      return (
        <span className="inline-flex items-center gap-1 mono text-[10px] text-amber-500">
          <AlertTriangle className="h-3 w-3 shrink-0" /> Partially Serviceable
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 mono text-[10px] text-destructive">
        <XCircle className="h-3 w-3 shrink-0" /> Faulty
      </span>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          className="mono text-[11px] h-8 uppercase tracking-wider"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> All Units
        </Button>
        <div>
          <div className="mono text-sm font-bold uppercase tracking-widest text-foreground">
            {unit ? unitDisplayName(unit, 0) : "Unit"} — Serviceability Detail
          </div>
          <div className="mono text-[10px] text-muted-foreground">
            {equipment.length} items ·{" "}
            <span className={faultCount > 0 ? "text-destructive" : "text-emerald-600"}>
              {faultCount} fault{faultCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {equipment.length === 0 ? (
        <Empty
          title="No equipment registered for this unit"
          hint="Add equipment from the Resource Inventory module."
        />
      ) : (
        <div className="space-y-3">
          {Object.entries(byCategory).map(([catName, items]) => (
            <div key={catName} className="panel overflow-hidden">
              {/* Category header */}
              <div className="px-4 py-2 border-b border-border bg-secondary/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => { const Icon = catIcon(catName); return <Icon className="h-3.5 w-3.5 text-muted-foreground" />; })()}
                  <span className="mono text-xs font-bold uppercase tracking-wide">{catName}</span>
                </div>
                <span className="mono text-[10px] text-muted-foreground">{items.length} items</span>
              </div>

              {/* Equipment rows: Name | Status | Change Status */}
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2">
                    {/* Status dot */}
                    <StatusDot s={item.serviceability} size={8} />

                    {/* Equipment name (exact, from Resource Inventory) */}
                    <div className="min-w-0 flex-1">
                      <div className="mono text-xs font-semibold truncate text-foreground">
                        {item.name || "—"}
                      </div>
                      <div className="mt-0.5">{statusBadge(item.serviceability)}</div>
                    </div>

                    {/* Change Status — only when editing is permitted */}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setStatusChangeItem(item)}
                        className="shrink-0 h-7 px-2 mono text-[10px] uppercase tracking-wider
                                   border border-border rounded-sm flex items-center gap-1
                                   hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                        title="Change serviceability status"
                      >
                        <RefreshCw className="h-3 w-3" /> Change Status
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Controlled status change modal */}
      <StatusChangeModal
        item={statusChangeItem}
        onClose={() => setStatusChangeItem(null)}
        onSaved={() => { onRefresh(); setStatusChangeItem(null); }}
      />
    </div>
  );
}

// ─── Valid status transitions ──────────────────────────────────────────────────

function validTransitions(current: string): { value: string; label: string }[] {
  if (current === STATUS_OK)
    return [
      { value: STATUS_PARTIAL, label: "Partially Serviceable" },
      { value: STATUS_BAD,     label: "Faulty" },
    ];
  if (current === STATUS_PARTIAL || current === STATUS_REPAIR)
    return [
      { value: STATUS_OK,  label: "Serviceable" },
      { value: STATUS_BAD, label: "Faulty" },
    ];
  // STATUS_BAD / Non-Serviceable
  return [
    { value: STATUS_OK,      label: "Serviceable" },
    { value: STATUS_PARTIAL, label: "Partially Serviceable" },
  ];
}

// ─── Controlled status change modal (audit-governed) ──────────────────────────

const EMPTY_CHANGE_FORM = {
  date:    new Date().toISOString().slice(0, 10),
  person:  "",
  vendor:  "",
  details: "",
};

function StatusChangeModal({
  item,
  onClose,
  onSaved,
}: {
  item: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [newStatus, setNewStatus] = useState("");
  const [form,  setForm]  = useState(EMPTY_CHANGE_FORM);
  const [busy,  setBusy]  = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Reset form when item changes
  useEffect(() => {
    setNewStatus("");
    setForm(EMPTY_CHANGE_FORM);
    setBusy(false);
    setConfirmed(false);
  }, [item?.id]);

  if (!item) return null;

  const targets   = validTransitions(item.serviceability);
  const isUpgrade = newStatus === STATUS_OK;
  const isDegrade = !!newStatus && newStatus !== STATUS_OK;
  const hasNewStatus = isUpgrade || isDegrade;

  const canSubmit =
    hasNewStatus &&
    !!form.date.trim() &&
    !!form.person.trim() &&
    !!form.details.trim() &&
    confirmed;

  function setF(k: keyof typeof EMPTY_CHANGE_FORM, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);

    if (!updateOperationalEquipment(item.id, {
      serviceability: newStatus as OpServiceability,
    })) {
      toast.error("Equipment not found.");
      setBusy(false);
      return;
    }

    const direction = isUpgrade ? "UPGRADE" : "DEGRADE";
    insertFaultDetail({
      equipment_id: item.id,
      date_raised: form.date,
      category: `${direction} — ${isUpgrade ? "Rectified by" : "Reported by"}: ${form.person}`,
      description: form.details,
      maintenance_remarks: form.vendor || "—",
      estimated_restoration: isUpgrade ? form.date : null,
    });
    toast.success(`Status changed to "${newStatus}". Audit record logged.`);

    setBusy(false);
    onSaved();
  }

  const targetButtonClass = (t: { value: string }) => {
    const selected = newStatus === t.value;
    if (!selected) return "border-border hover:bg-secondary text-muted-foreground";
    if (t.value === STATUS_OK)      return "bg-emerald-600 border-emerald-600 text-white";
    if (t.value === STATUS_PARTIAL) return "bg-amber-500 border-amber-500 text-white";
    return "bg-destructive border-destructive text-white";
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4 text-primary" />
            Change Status — {item.name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Current status banner */}
          <div className="grid grid-cols-2 gap-2 text-[11px] mono">
            <InfoPanel label="Equipment" value={item.name ?? "—"} />
            <InfoPanel
              label="Current Status"
              value={item.serviceability}
              valueClass={
                item.serviceability === STATUS_OK ? "text-emerald-600"
                : isPartial(item.serviceability)  ? "text-amber-500"
                : "text-destructive"
              }
            />
          </div>

          {/* Target status selector */}
          <div>
            <div className="label-eyebrow mb-2">New Status *</div>
            <div className="flex gap-2">
              {targets.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setNewStatus(t.value); setConfirmed(false); }}
                  className={`flex-1 px-3 py-2 rounded-sm border mono text-[10px] uppercase
                              tracking-wider text-center transition-colors ${targetButtonClass(t)}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── DEGRADE audit fields ─────────────────────────────────────────── */}
          {isDegrade && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="label-eyebrow flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3 w-3" /> Degradation Record (mandatory)
              </div>
              <SvcField label="Date of Fault Reporting *">
                <Input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setF("date", e.target.value)}
                />
              </SvcField>
              <SvcField label="Reported By (Name / ID) *">
                <Input
                  required
                  value={form.person}
                  onChange={(e) => setF("person", e.target.value)}
                  placeholder="Operator name or personnel ID"
                />
              </SvcField>
              <SvcField label="Vendor / Maintenance Agency">
                <Input
                  value={form.vendor}
                  onChange={(e) => setF("vendor", e.target.value)}
                  placeholder="Vendor name (if applicable)"
                />
              </SvcField>
              <SvcField label="Detailed Fault Description *">
                <Textarea
                  required
                  rows={3}
                  value={form.details}
                  onChange={(e) => setF("details", e.target.value)}
                  placeholder="Describe the fault, affected functions, and impact in detail"
                />
              </SvcField>
            </div>
          )}

          {/* ── UPGRADE audit fields ─────────────────────────────────────────── */}
          {isUpgrade && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="label-eyebrow flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Rectification Record (mandatory)
              </div>
              <SvcField label="Date of Rectification *">
                <Input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setF("date", e.target.value)}
                />
              </SvcField>
              <SvcField label="Rectified By (Name / Vendor Representative) *">
                <Input
                  required
                  value={form.person}
                  onChange={(e) => setF("person", e.target.value)}
                  placeholder="Name of technician or vendor rep"
                />
              </SvcField>
              <SvcField label="Vendor Confirmation / Reference">
                <Input
                  value={form.vendor}
                  onChange={(e) => setF("vendor", e.target.value)}
                  placeholder="Vendor ref / work order number"
                />
              </SvcField>
              <SvcField label="Repair / Resolution Details *">
                <Textarea
                  required
                  rows={3}
                  value={form.details}
                  onChange={(e) => setF("details", e.target.value)}
                  placeholder="Describe what was repaired, replaced, or resolved"
                />
              </SvcField>
            </div>
          )}

          {/* Confirmation checkbox (anti-misuse governance) */}
          {hasNewStatus && (
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
              />
              <span className="mono text-[10px] text-muted-foreground leading-snug">
                I confirm this status change is authorised. This action will be logged as
                an immutable audit record and cannot be silently reversed.
              </span>
            </label>
          )}

          {/* Submit */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 mono uppercase tracking-wider"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit || busy}
              className="flex-1 mono uppercase tracking-wider"
            >
              {busy ? "Saving…" : "Confirm Change"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fault dialog ─────────────────────────────────────────────────────────────

function FaultDialog({
  equipment,
  faults,
  canEdit,
  onClose,
  onSaved,
}: {
  equipment: any;
  faults: any[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isPartialStatus = equipment ? isPartial(equipment.serviceability) : false;
  const isOperational   = equipment?.serviceability === STATUS_OK;

  return (
    <Dialog open={!!equipment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2 text-sm">
            <Wrench className="h-4 w-4 text-primary" />
            {equipment?.name ?? "—"} — Status Record
          </DialogTitle>
        </DialogHeader>

        {equipment && (
          <div className="space-y-4">
            {/* Equipment info banner */}
            <div className="grid grid-cols-3 gap-2 text-[11px] mono">
              <InfoPanel label="Unit"     value={equipment.units?.code ?? "—"} />
              <InfoPanel label="Category" value={equipment.category?.name ?? "—"} />
              <InfoPanel
                label="Status"
                value={equipment.serviceability}
                valueClass={
                  equipment.serviceability === STATUS_OK
                    ? "text-emerald-600"
                    : isPartialStatus
                    ? "text-amber-500"
                    : "text-destructive"
                }
              />
            </div>

            {/* Operational — no fault log needed */}
            {isOperational && (
              <div className="panel px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <div>
                  <div className="mono text-sm font-bold text-emerald-600">Operational</div>
                  <div className="mono text-[10px] text-muted-foreground mt-0.5">
                    No faults outstanding. Equipment is fully serviceable.
                  </div>
                </div>
              </div>
            )}

            {/* Fault records */}
            {!isOperational && (
              <>
                {faults.length === 0 ? (
                  <Empty
                    title="No fault details logged"
                    hint={canEdit ? "Use the form below to log the first record." : "Awaiting maintenance log."}
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="label-eyebrow">Fault History</div>
                    <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {faults.map((f: any) => (
                        <li key={f.id} className="panel p-3 text-[11px] mono space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground">
                              {isPartialStatus ? "Affected Functions" : "Reported To"}: {f.category ?? "—"}
                            </span>
                            <span className="text-muted-foreground">Raised {f.date_raised}</span>
                          </div>
                          {f.description && (
                            <p className="text-foreground/80 leading-snug">{f.description}</p>
                          )}
                          <div className="grid grid-cols-2 gap-1 text-muted-foreground pt-1 border-t border-border">
                            <span>Repair Timeline</span>
                            <span className="text-foreground">{f.estimated_restoration ?? "—"}</span>
                            <span>Remarks</span>
                            <span className="text-foreground truncate">{f.maintenance_remarks ?? "—"}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {canEdit && (
                  <FaultForm
                    equipmentId={equipment.id}
                    isPartial={isPartialStatus}
                    onSaved={onSaved}
                  />
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Fault logging form ───────────────────────────────────────────────────────

function FaultForm({
  equipmentId,
  isPartial,
  onSaved,
}: {
  equipmentId: string;
  isPartial: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    date_raised: new Date().toISOString().slice(0, 10),
    category: "",
    description: "",
    estimated_restoration: "",
    maintenance_remarks: "",
  });
  const [busy, setBusy] = useState(false);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    insertFaultDetail({
      equipment_id: equipmentId,
      date_raised: form.date_raised,
      category: form.category || null,
      description: form.description || null,
      estimated_restoration: form.estimated_restoration || null,
      maintenance_remarks: form.maintenance_remarks || null,
    });
    setBusy(false);
    toast.success("Fault record logged");
    setForm({ date_raised: new Date().toISOString().slice(0, 10), category: "", description: "", estimated_restoration: "", maintenance_remarks: "" });
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-3">
      <div className="label-eyebrow flex items-center gap-1.5">
        <Wrench className="h-3 w-3" /> Log Fault Record
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SvcField label="Date Fault Reported">
          <Input type="date" value={form.date_raised} onChange={(e) => set("date_raised", e.target.value)} />
        </SvcField>
        <SvcField label={isPartial ? "Affected Functions" : "Reported To"}>
          <Input
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder={isPartial ? "e.g. Channel 2 / Tracking" : "e.g. SIGINT Officer"}
          />
        </SvcField>
      </div>

      <SvcField label="Fault Description">
        <Textarea
          rows={2}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Describe the fault in detail"
        />
      </SvcField>

      <div className="grid grid-cols-2 gap-2">
        <SvcField label="Likely Repair Timeline">
          <Input
            type="date"
            value={form.estimated_restoration}
            onChange={(e) => set("estimated_restoration", e.target.value)}
          />
        </SvcField>
        <SvcField label="Remarks">
          <Input
            value={form.maintenance_remarks}
            onChange={(e) => set("maintenance_remarks", e.target.value)}
            placeholder="Additional notes"
          />
        </SvcField>
      </div>

      <Button
        type="submit"
        disabled={busy}
        size="sm"
        className="w-full mono uppercase tracking-wider"
      >
        {busy ? "Saving…" : "Submit Fault Record"}
      </Button>
    </form>
  );
}

// ─── Category readiness detail dialog ────────────────────────────────────────

function CategoryReadinessDialog({
  stat,
  onClose,
}: {
  stat: CatStatEntry | null;
  onClose: () => void;
}) {
  if (!stat) return null;

  const isOther = stat.cat.name.toLowerCase().includes("other");
  const pct = stat.total === 0 ? 0 : Math.round((stat.ok / stat.total) * 100);

  // For "Other Resources": group items by name
  const groupedItems = useMemo(() => {
    if (!isOther) return [];
    const map: Record<string, { ok: number; partial: number; bad: number; total: number }> = {};
    for (const item of stat.items) {
      const name = item.name?.trim() || "Unknown";
      if (!map[name]) map[name] = { ok: 0, partial: 0, bad: 0, total: 0 };
      map[name].total++;
      if (item.serviceability === STATUS_OK)       map[name].ok++;
      else if (isPartial(item.serviceability))     map[name].partial++;
      else                                          map[name].bad++;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [stat, isOther]);

  const Icon = catIcon(stat.cat.name);

  return (
    <Dialog open={!!stat} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4" />
            {stat.cat.name} — Readiness Breakdown
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Enlarged donut + totals */}
          <div className="flex items-center gap-6 justify-center py-2">
            <DonutRing ok={stat.ok} partial={stat.partial} bad={stat.bad} total={stat.total} size={96} />
            <div className="space-y-2 text-[12px] mono">
              <div className="text-muted-foreground mb-1">Total: <span className="text-foreground font-bold">{stat.total}</span></div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span>Serviceable: <strong>{stat.ok}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                <span>Partially Serviceable: <strong>{stat.partial}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                <span>Non-Serviceable: <strong>{stat.bad}</strong></span>
              </div>
              <div className="border-t border-border pt-2 text-primary font-bold">
                Readiness: {pct}%
              </div>
            </div>
          </div>

          {/* Other Resources: item-by-item breakdown */}
          {isOther && groupedItems.length > 0 && (
            <div>
              <div className="label-eyebrow mb-2">Item Breakdown</div>
              <div className="space-y-2">
                {groupedItems.map(([name, counts]) => (
                  <div key={name} className="panel px-3 py-2.5">
                    <div className="mono text-xs font-bold uppercase tracking-tight mb-1.5">{name}</div>
                    <div className="grid grid-cols-4 gap-1 text-[10px] mono">
                      <div className="text-center">
                        <div className="text-muted-foreground">Qty</div>
                        <div className="font-bold">{counts.total}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-emerald-600">Svc</div>
                        <div className="font-bold text-emerald-600">{counts.ok}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-amber-500">Partial</div>
                        <div className="font-bold text-amber-500">{counts.partial}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-destructive">Faulty</div>
                        <div className="font-bold text-destructive">{counts.bad}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state for Other Resources with no items */}
          {isOther && groupedItems.length === 0 && stat.total === 0 && (
            <p className="mono text-[11px] text-muted-foreground text-center py-2">
              No items registered in this category.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function InfoPanel({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="panel px-2 py-1.5">
      <div className="label-eyebrow">{label}</div>
      <div className={`mono text-xs font-semibold truncate mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}

function SvcField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="label-eyebrow">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
