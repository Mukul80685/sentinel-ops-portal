import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits, listCategories } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [activeEqId, setActiveEqId]         = useState<string | null>(null);
  const [activeCatStat, setActiveCatStat]   = useState<CatStatEntry | null>(null);

  const { data: units = [] }      = useQuery({ queryKey: ["units"],      queryFn: listUnits });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("id,name,unit_id,serviceability,category_id, units:unit_id(code,name), category:category_id(id,name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
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
    return units.map((u) => {
      const items = equipment.filter((e: any) => e.unit_id === u.id);
      const ok      = items.filter((e: any) => e.serviceability === STATUS_OK).length;
      const partial = items.filter((e: any) => isPartial(e.serviceability)).length;
      const bad     = items.filter((e: any) => e.serviceability === STATUS_BAD).length;
      const faults  = items.filter((e: any) => isFaulty(e.serviceability)).length;
      const pct     = items.length === 0 ? 100 : Math.round((ok / items.length) * 100);
      return { unit: u, items, ok, partial, bad, faults, pct, total: items.length };
    });
  }, [units, equipment]);

  const selectedUnit      = units.find((u) => u.id === selectedUnitId) ?? null;
  const unitEquipment     = equipment.filter((e: any) => e.unit_id === selectedUnitId);
  const activeEq: any     = equipment.find((e: any) => e.id === activeEqId) ?? null;

  // ── Fault records for active equipment ─────────────────────────────────────
  const { data: faults = [] } = useQuery({
    queryKey: ["faults", activeEqId],
    queryFn: async () => {
      if (!activeEqId) return [];
      const { data } = await supabase
        .from("fault_details")
        .select("*")
        .eq("equipment_id", activeEqId)
        .order("date_raised", { ascending: false });
      return data ?? [];
    },
    enabled: !!activeEqId,
  });

  return (
    <AppShell title="Serviceability State" subtitle="Operational Readiness">
      {selectedUnitId ? (
        <UnitDetail
          unit={selectedUnit}
          equipment={unitEquipment}
          onBack={() => setSelectedUnitId(null)}
          onSelectEq={setActiveEqId}
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
                {unitStats.map(({ unit, ok, partial, bad, faults, pct, total }) => {
                  const urgency = bad > 0 ? "border-destructive/40" : faults > 0 ? "border-amber-400/40" : "";
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => setSelectedUnitId(unit.id)}
                      className={`panel text-left group hover:bg-secondary/60 transition-all duration-150
                                  hover:scale-[1.02] hover:shadow-md focus:outline-none focus:ring-1 focus:ring-primary
                                  ${urgency}`}
                    >
                      {/* Unit code + name */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="mono text-base font-bold uppercase tracking-tight leading-none">
                            {unit.code}
                          </div>
                          <div className="mono text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">
                            {unit.name}
                          </div>
                        </div>
                        <DonutRing ok={ok} partial={partial} bad={bad} total={total} size={44} />
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-2 mt-3 text-[10px] mono">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />{ok}
                        </span>
                        {partial > 0 && (
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-amber-400" />{partial}
                          </span>
                        )}
                        {bad > 0 && (
                          <span className="flex items-center gap-1">
                            <XCircle className="h-3 w-3 text-destructive" />{bad}
                          </span>
                        )}
                        <span className="ml-auto text-muted-foreground">{total} items</span>
                      </div>

                      {/* Readiness bar */}
                      <div className="mt-2 h-1 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444",
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Fault / status dialog ──────────────────────────────────────────── */}
      <FaultDialog
        equipment={activeEq}
        faults={faults}
        canEdit={canEdit}
        onClose={() => setActiveEqId(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["faults", activeEqId] })}
      />

      {/* ── Category readiness detail dialog ───────────────────────────────── */}
      <CategoryReadinessDialog
        stat={activeCatStat}
        onClose={() => setActiveCatStat(null)}
      />
    </AppShell>
  );
}

// ─── Unit detail view ─────────────────────────────────────────────────────────

function UnitDetail({
  unit,
  equipment,
  onBack,
  onSelectEq,
}: {
  unit: any;
  equipment: any[];
  onBack: () => void;
  onSelectEq: (id: string) => void;
}) {
  const byCategory: Record<string, any[]> = {};
  for (const e of equipment) {
    const catName = e.category?.name ?? "Uncategorised";
    (byCategory[catName] ??= []).push(e);
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
          {/* "Unit Alpha" — strip any leading "Gate" prefix from the name */}
          <div className="mono text-sm font-bold uppercase tracking-widest text-foreground">
            Unit {unit?.name?.replace(/^\bGate\b\s*/i, "") ?? unit?.code}
          </div>
          <div className="mono text-[10px] text-muted-foreground mt-0.5">
            Detailed Serviceability State
          </div>
          <div className="mono text-[10px] text-muted-foreground">
            {equipment.length} items ·{" "}
            <span className={equipment.filter((e) => isFaulty(e.serviceability)).length > 0 ? "text-destructive" : ""}>
              {equipment.filter((e) => isFaulty(e.serviceability)).length} faults
            </span>
          </div>
        </div>
      </div>

      {equipment.length === 0 ? (
        <Empty
          title="No equipment registered for this unit"
          hint="Add equipment from the Resource Inventory module to see items here."
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

              {/* Equipment rows */}
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const faulty = isFaulty(item.serviceability);
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                      <StatusDot s={item.serviceability} size={9} />
                      <div className="min-w-0 flex-1">
                        <div className="mono text-xs font-semibold truncate">{item.name || "—"}</div>
                        <div className="mono text-[10px] text-muted-foreground">{item.serviceability}</div>
                      </div>
                      {faulty ? (
                        <button
                          type="button"
                          onClick={() => onSelectEq(item.id)}
                          className="shrink-0 mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm
                                     border transition-colors inline-flex items-center gap-1
                                     border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
                        >
                          {isPartial(item.serviceability) ? (
                            <><AlertTriangle className="h-3 w-3" /> Partially Serviceable</>
                          ) : (
                            <><XCircle className="h-3 w-3" /> Faulty</>
                          )}
                        </button>
                      ) : (
                        <span className="shrink-0 mono text-[10px] uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Serviceable
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
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
    const { error } = await supabase.from("fault_details").insert({
      equipment_id: equipmentId,
      date_raised: form.date_raised,
      category: form.category || null,
      description: form.description || null,
      estimated_restoration: form.estimated_restoration || null,
      maintenance_remarks: form.maintenance_remarks || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
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
