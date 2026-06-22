import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { engStatusClass, listSatellites } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES    = ["Planned", "In Progress", "Completed", "Paused", "Failed"] as const;
// When resources are incomplete, "In Progress" is not a valid choice
const STATUSES_NO_PROGRESS = STATUSES.filter(s => s !== "In Progress") as unknown as readonly string[];
const ACTIVE_ENG  = new Set(["In Progress", "Paused"]);
const QUEUED_ENG  = "Planned";
const DEMOD_TYPES = ["Narrowband", "Wideband", "DVB-S2", "DVB-S2X"] as const;
const NON_OPERATIONAL = new Set(["Non-Serviceable", "Under Repair", "Partially Serviceable"]);

// Category match strings — used to assign equipment to rings
// Order matters: each item is checked in order; an item can only belong to ONE category
const CATEGORY_DEFS = [
  { label: "Antennas",      match: "antenna"    },
  { label: "LNA / LNB",    match: "lna"         },
  { label: "Demodulators",  match: "demodulat"  },
  { label: "Proc. Servers", match: "processing" },
  // "Other" is the remainder — computed separately, never double-counted
] as const;

export const Route = createFileRoute("/_authenticated/engagement/$unitId")({
  component: EngagementUnit,
});

// ─── Naming normalization ─────────────────────────────────────────────────────

function unitDisplayCode(code: string): string {
  return code.replace(/^GATE[-\s]?/i, "").trim() || code;
}

// ─── Remark helpers ───────────────────────────────────────────────────────────

function parseLnaType(remarks: string | null): string {
  const m = remarks?.match(/LNA\/LNB:(LNA|LNB)/);
  return m ? m[1] : "—";
}
function parseDemodType(remarks: string | null): string {
  const m = remarks?.match(/DEMOD_TYPE:([\w-]+)/);
  return m ? m[1] : "—";
}

// ─── Resource completeness ────────────────────────────────────────────────────

function resourceCompleteness(r: any): { isPending: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!r.antenna_id)           missing.push("Antenna");
  if (!r.demodulator_id)       missing.push("Demodulator");
  if (!r.processing_server_id) missing.push("Processor");
  return { isPending: r.status === "In Progress" && missing.length > 0, missing };
}

// ─── Color helper ─────────────────────────────────────────────────────────────

function engColor(pct: number) {
  return pct >= 80 ? "#ef4444" : pct >= 50 ? "#f59e0b" : "#10b981";
}

// ─── Small resource ring ──────────────────────────────────────────────────────

function SmallRing({
  pct, label, engaged, faulty, total,
}: { pct: number; label: string; engaged: number; faulty: number; total: number }) {
  const sz = 58, sw = 5.5, r = (sz - sw) / 2, c = 2 * Math.PI * r;
  const color = total === 0 ? "#6b7280" : engColor(pct);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: sz, height: sz }}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="-rotate-90">
          <circle cx={sz/2} cy={sz/2} r={r} stroke="currentColor" strokeWidth={sw} fill="none" className="text-secondary" />
          {total > 0 && (
            <circle cx={sz/2} cy={sz/2} r={r} stroke={color} strokeWidth={sw} fill="none"
              strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="mono font-bold leading-none" style={{ fontSize: 10, color: total === 0 ? "#6b7280" : color }}>
            {total === 0 ? "—" : `${pct}%`}
          </span>
        </div>
      </div>
      <div className="text-center space-y-0.5">
        <div className="mono text-[8px] font-bold uppercase tracking-wide text-foreground leading-none">{label}</div>
        {total === 0
          ? <div className="mono text-[6.5px] text-muted-foreground/35 leading-none">No inventory</div>
          : <div className="mono text-[6.5px] text-muted-foreground/55 leading-none">{engaged}/{total} engaged</div>
        }
        {faulty > 0 && (
          <div className="mono text-[6px] leading-none" style={{ color: "#ef444488" }}>{faulty} unserviceable</div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function EngagementUnit() {
  const { unitId } = Route.useParams();
  const canEdit    = useCanEdit();
  const qc         = useQueryClient();
  const navigate   = useNavigate();

  const { data: unit } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: async () => (await supabase.from("units").select("*").eq("id", unitId).maybeSingle()).data,
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["eng", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engagements")
        .select("*, satellites:satellite_id(name), antenna:antenna_id(name,id), demodulator:demodulator_id(name,id), server:processing_server_id(name,id)")
        .eq("unit_id", unitId)
        .order("observation_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: equipmentRaw = [] } = useQuery({
    queryKey: ["unit-equipment-detail", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment")
        .select("id, name, serviceability, category:category_id(name)")
        .eq("unit_id", unitId);
      return data ?? [];
    },
  });

  // ── Row separation ────────────────────────────────────────────────────────
  const inProgressRows = useMemo(() => rows.filter((r: any) => ACTIVE_ENG.has(r.status)), [rows]);
  const plannedRows    = useMemo(() => rows.filter((r: any) => r.status === QUEUED_ENG), [rows]);

  // ── Allocated IDs (from active engagements only) ──────────────────────────
  const allocatedIds = useMemo(() => new Set(
    [
      ...inProgressRows.map((r: any) => r.antenna_id),
      ...inProgressRows.map((r: any) => r.demodulator_id),
      ...inProgressRows.map((r: any) => r.processing_server_id),
    ].filter(Boolean),
  ), [inProgressRows]);

  // ── Per-category resource stats (NO double-counting) ─────────────────────
  // Each equipment item belongs to EXACTLY ONE bucket.
  // "Other" = everything not matched by the 4 main categories.
  const resourceStats = useMemo(() => {
    const claimed = new Set<string>(); // equipment IDs already assigned to a named category

    const named = CATEGORY_DEFS.map(({ label, match }) => {
      const catEq = equipmentRaw.filter((e: any) => {
        const name = (e.category?.name ?? "").toLowerCase();
        return name.includes(match) && !claimed.has(e.id);
      });
      catEq.forEach((e: any) => claimed.add(e.id));

      const total   = catEq.length;
      const faulty  = catEq.filter((e: any) => NON_OPERATIONAL.has(e.serviceability)).length;
      const active  = catEq.filter((e: any) => e.serviceability === "Operational" && allocatedIds.has(e.id)).length;
      const engaged = faulty + active;
      const pct     = total === 0 ? 0 : Math.min(100, Math.round((engaged / total) * 100));
      return { label, total, faulty, allocated: active, engaged, pct };
    });

    // "Other" = everything not claimed above
    const otherEq   = equipmentRaw.filter((e: any) => !claimed.has(e.id));
    const otherTotal   = otherEq.length;
    const otherFaulty  = otherEq.filter((e: any) => NON_OPERATIONAL.has(e.serviceability)).length;
    const otherActive  = otherEq.filter((e: any) => e.serviceability === "Operational" && allocatedIds.has(e.id)).length;
    const otherEngaged = otherFaulty + otherActive;
    const otherPct     = otherTotal === 0 ? 0 : Math.min(100, Math.round((otherEngaged / otherTotal) * 100));
    named.push({ label: "Other", total: otherTotal, faulty: otherFaulty, allocated: otherActive, engaged: otherEngaged, pct: otherPct });

    return named;
  }, [equipmentRaw, allocatedIds]);

  // ── Overall engagement % ──────────────────────────────────────────────────
  // = (total faulty across ALL equipment + total actively allocated operational) / total pool
  // This MUST equal: sum of per-category engaged / total pool  ← now guaranteed since Other fills the gap
  const { utilPct, totalPool, faultyCount, activeAllocated } = useMemo(() => {
    const totalPool       = equipmentRaw.length;
    const faultyCount     = equipmentRaw.filter((e: any) => NON_OPERATIONAL.has(e.serviceability)).length;
    const activeAllocated = equipmentRaw.filter((e: any) => e.serviceability === "Operational" && allocatedIds.has(e.id)).length;
    const engaged  = faultyCount + activeAllocated;
    const utilPct  = totalPool === 0 ? 0 : Math.min(100, Math.round((engaged / totalPool) * 100));
    return { utilPct, totalPool, faultyCount, activeAllocated };
  }, [equipmentRaw, allocatedIds]);

  const serviceableAntennaCount = useMemo(
    () => equipmentRaw.filter((e: any) =>
      (e.category?.name ?? "").toLowerCase().includes("antenna") && e.serviceability === "Operational",
    ).length,
    [equipmentRaw],
  );

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("engagements").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["eng", unitId] });
  }
  async function remove(id: string) {
    if (!confirm("Remove engagement?")) return;
    const { error } = await supabase.from("engagements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["eng", unitId] });
  }

  const displayCode = unitDisplayCode(unit?.code ?? "—");
  const unitLabel   = `Unit ${displayCode}`;

  return (
    <AppShell
      title="Live Engagement Status"
      subtitle={unitLabel}
      showBack
      actions={
        <div className="flex items-center gap-2">
          {canEdit && (
            <AddEngagement unitId={unitId} activeRows={inProgressRows} equipment={equipmentRaw} />
          )}
          <button
            onClick={() => navigate({ to: "/engagement/" })}
            title="Close"
            className="h-7 w-7 flex items-center justify-center rounded-sm border border-border
                       hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    >

      {/* ═══════════════════════════════════════════════════════════════════
          COMBINED PANEL: Overall Ring + Unit Info + Resource Rings
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="panel overflow-hidden mb-3">

        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/20">
          <span className="mono text-[10.5px] font-bold uppercase tracking-wider text-foreground">
            Resource Engagement Architecture
          </span>
          <span className="mono text-[7.5px] uppercase tracking-[0.15em] text-muted-foreground/40">
            (Faulty + Active) / Total Pool
          </span>
        </div>

        {/* Top row: overall ring + unit identity + stats */}
        <div className="px-4 py-3 flex items-center gap-5 border-b border-border/50">
          {/* Overall ring — bigger than resource rings */}
          {(() => {
            const sz = 84, sw = 8, rad = (sz-sw)/2, circ = 2*Math.PI*rad, col = engColor(utilPct);
            return (
              <div className="relative shrink-0" style={{ width: sz, height: sz }}>
                <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="-rotate-90">
                  <circle cx={sz/2} cy={sz/2} r={rad} stroke="currentColor" strokeWidth={sw} fill="none" className="text-secondary" />
                  <circle cx={sz/2} cy={sz/2} r={rad} stroke={col} strokeWidth={sw} fill="none"
                    strokeDasharray={`${(utilPct/100)*circ} ${circ}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="mono text-[16px] font-bold leading-none" style={{ color: col }}>{utilPct}%</span>
                  <span className="mono text-[6px] uppercase tracking-wide text-muted-foreground/40 mt-0.5">overall</span>
                </div>
              </div>
            );
          })()}

          {/* Unit info + formula */}
          <div className="min-w-0 flex-1">
            <div className="mono text-[13px] font-bold uppercase tracking-tight text-foreground">{unitLabel}</div>
            {(unit as any)?.location && (
              <div className="mono text-[8.5px] text-muted-foreground/50 mt-0.5">{(unit as any).location}</div>
            )}
            <div className="mt-2 flex items-center gap-4 flex-wrap">
              <EngStat label="Active Scans"  value={inProgressRows.length}        color="primary" />
              <EngStat label="Planned"       value={plannedRows.length}                           />
              <EngStat label="Faulty Eq."   value={faultyCount}                   color={faultyCount > 0 ? "warn" : undefined} />
              <EngStat label="Svc Antennas" value={serviceableAntennaCount || "—"}                />
              <EngStat label="Pool"         value={totalPool}                                     />
            </div>
            {/* Live formula */}
            <div className="mt-2 px-2 py-1 rounded-sm border border-border/40 bg-secondary/15 mono text-[7.5px] text-muted-foreground/55 flex flex-wrap items-center gap-1">
              <span className="uppercase tracking-wider font-semibold text-foreground/50">Engagement</span>
              <span>=</span>
              <span style={{ color: "#ef444488" }}>({faultyCount} faulty</span>
              <span>+</span>
              <span className="text-primary">{activeAllocated} active)</span>
              <span>/</span>
              <span className="text-foreground/60">{totalPool} pool</span>
              <span>=</span>
              <span className="font-bold" style={{ color: engColor(utilPct) }}>{utilPct}%</span>
              <span className="text-muted-foreground/30">· Faulty ≠ free</span>
            </div>
          </div>
        </div>

        {/* Bottom row: per-category rings (smaller) */}
        <div className="px-4 py-3 flex flex-wrap items-start gap-5 justify-around">
          {resourceStats.map((rs) => (
            <SmallRing key={rs.label} {...rs} />
          ))}
        </div>
      </div>

      {/* ── Section 3: Satellite Scanning – Under Progress ───────────────── */}
      <div className="panel overflow-hidden mb-3">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/20">
          <span className="mono text-[10.5px] font-bold uppercase tracking-wider text-foreground">
            Satellite Scanning – Under Progress
          </span>
          <span className="mono text-[7.5px] uppercase tracking-[0.15em] text-muted-foreground/40">
            {inProgressRows.length} sessions
          </span>
        </div>

        {inProgressRows.length === 0 ? (
          <div className="px-4 py-5 text-center mono text-[9px] text-muted-foreground/40 uppercase tracking-wider">
            No active scanning sessions
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="min-w-full mono text-[11px]">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  {["#", "Satellite", "Antenna", "LNA/LNB", "Demodulator", "Processor", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[8.5px] uppercase tracking-wider text-foreground font-bold whitespace-nowrap border-r border-border/50 last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inProgressRows.map((r: any, idx: number) => {
                  const { isPending, missing } = resourceCompleteness(r);
                  return (
                    <tr key={r.id} className={`transition-colors ${
                      isPending ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-secondary/20"
                    }`}>
                      <td className="px-3 py-2.5 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">{r.satellites?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.antenna?.name
                          ? <span className="text-foreground">{r.antenna.name}</span>
                          : <span className="text-destructive/50 italic text-[9px]">missing</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.antenna_id
                          ? <span className="px-1.5 py-0.5 rounded-sm bg-secondary/60 text-foreground text-[8px] uppercase">{parseLnaType(r.remarks)}</span>
                          : <span className="text-muted-foreground/35">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.demodulator?.name ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-foreground">{r.demodulator.name}</span>
                            {parseDemodType(r.remarks) !== "—" && (
                              <span className="text-[8px] text-muted-foreground/55 uppercase">{parseDemodType(r.remarks)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-destructive/50 italic text-[9px]">missing</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {r.server?.name
                          ? r.server.name
                          : <span className="text-destructive/50 italic text-[9px]">missing</span>}
                      </td>
                      {/* Status — ONLY shows "Pending Allocation" when resources are incomplete */}
                      <td className="px-3 py-2.5">
                        {isPending ? (
                          /* Resources incomplete → Pending Allocation only, no "In Progress" ever shown */
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex text-[7.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm
                                             text-amber-700 bg-amber-400/12 border border-amber-400/30 whitespace-nowrap">
                              Pending Allocation
                            </span>
                            <div className="flex items-start gap-1">
                              <AlertTriangle className="h-2.5 w-2.5 text-amber-500/70 shrink-0 mt-px" />
                              <span className="mono text-[6.5px] text-amber-600/70 leading-snug">
                                Need: {missing.join(", ")}
                              </span>
                            </div>
                            {canEdit && (
                              /* Allow changing to Paused / Failed / Completed — NOT "In Progress" */
                              <select value={r.status}
                                onChange={(e) => update(r.id, { status: e.target.value })}
                                className="mt-0.5 px-1.5 py-0.5 rounded-sm text-[7.5px] uppercase tracking-wider border border-border/50 bg-card text-muted-foreground">
                                {STATUSES_NO_PROGRESS.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          canEdit ? (
                            <select value={r.status} onChange={(e) => update(r.id, { status: e.target.value })}
                              className={`px-1.5 py-0.5 rounded-sm text-[8.5px] uppercase tracking-wider border border-border/50 bg-card ${engStatusClass(r.status)}`}>
                              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded-sm text-[8.5px] uppercase tracking-wider ${engStatusClass(r.status)}`}>
                              {r.status}
                            </span>
                          )
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {canEdit && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => remove(r.id)}>
                            <Trash2 className="h-3 w-3 text-destructive/60" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 4: Planned Satellites ─────────────────────────────────── */}
      <div className="panel overflow-hidden mb-3">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/20">
          <span className="mono text-[10.5px] font-bold uppercase tracking-wider text-foreground">
            Planned Satellites
          </span>
          <span className="mono text-[7.5px] uppercase tracking-[0.15em] text-muted-foreground/40">
            Queued · Awaiting resource assignment
          </span>
        </div>

        {plannedRows.length === 0 ? (
          <div className="px-4 py-5 text-center mono text-[9px] text-muted-foreground/40 uppercase tracking-wider">
            No missions queued
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full mono text-[11px]">
              <thead className="bg-card border-b border-border">
                <tr>
                  {["#", "Satellite", "Scheduled Start", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[8.5px] uppercase tracking-wider text-foreground font-bold whitespace-nowrap border-r border-border/50 last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plannedRows.slice(0, 4).map((r: any, idx: number) => (
                  <tr key={r.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">{r.satellites?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {r.observation_start ? new Date(r.observation_start).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded-sm text-[8.5px] uppercase tracking-wider ${engStatusClass(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => remove(r.id)}>
                          <Trash2 className="h-3 w-3 text-destructive/60" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rows.length === 0 && <Empty title="No engagements recorded" />}
    </AppShell>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function EngStat({
  label, value, color,
}: { label: string; value: number | string; color?: "primary" | "warn" }) {
  const cls = color === "primary" ? "text-primary" : color === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`mono text-[12px] font-bold leading-none ${cls}`}>{value}</span>
      <span className="mono text-[6.5px] uppercase tracking-[0.15em] text-muted-foreground/45 leading-none">{label}</span>
    </div>
  );
}

// ─── Add Engagement dialog ─────────────────────────────────────────────────────

interface AddEngagementProps {
  unitId: string;
  activeRows: any[];
  equipment: any[];
}

function AddEngagement({ unitId, activeRows, equipment }: AddEngagementProps) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });

  const allocatedAntennaIds = useMemo(
    () => new Set(activeRows.map((r: any) => r.antenna_id).filter(Boolean)), [activeRows],
  );
  const allocatedDemodIds = useMemo(
    () => new Set(activeRows.map((r: any) => r.demodulator_id).filter(Boolean)), [activeRows],
  );
  const allocatedServerIds = useMemo(
    () => new Set(activeRows.map((r: any) => r.processing_server_id).filter(Boolean)), [activeRows],
  );

  const serviceable = (matchStr: string) =>
    equipment.filter((e: any) =>
      (e.category?.name ?? "").toLowerCase().includes(matchStr) && e.serviceability === "Operational",
    );

  const availableAntennas = serviceable("antenna").filter((e: any) => !allocatedAntennaIds.has(e.id));
  const availableLNA      = serviceable("lna").filter((e: any) => !allocatedAntennaIds.has(e.id));
  const availableLNB      = serviceable("lnb").filter((e: any) => !allocatedAntennaIds.has(e.id));
  const availableDemod    = serviceable("demodulat").filter((e: any) => !allocatedDemodIds.has(e.id));
  const availableServers  = serviceable("processing").filter((e: any) => !allocatedServerIds.has(e.id));

  const noAntenna = availableAntennas.length === 0;

  const [form, setForm] = useState({
    satellite_id: "",
    antenna_id: "",
    lna_type: "LNA" as "LNA" | "LNB",
    lna_id: "",
    demodulator_type: "DVB-S2",
    demodulator_id: "",
    processing_server_id: "",
    observation_start: "",
    status: "Planned",
    remarks: "",
  });

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  const inProgressMissingResources =
    form.status === "In Progress" &&
    (!form.antenna_id || !form.demodulator_id || !form.processing_server_id);

  const canSubmit = !noAntenna && !!form.satellite_id && !inProgressMissingResources;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const metaParts = [
      `LNA/LNB:${form.lna_type}`,
      `DEMOD_TYPE:${form.demodulator_type}`,
      form.remarks,
    ].filter(Boolean).join(" | ");
    const { error } = await supabase.from("engagements").insert({
      unit_id: unitId,
      satellite_id: form.satellite_id,
      antenna_id: form.antenna_id || null,
      demodulator_id: form.demodulator_id || null,
      processing_server_id: form.processing_server_id || null,
      observation_start: form.observation_start || null,
      status: form.status as any,
      remarks: metaParts || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Engagement created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["eng", unitId] });
  }

  const lnaDevices = form.lna_type === "LNA" ? availableLNA : availableLNB;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="mono text-[11px] uppercase tracking-wider h-7 px-3">
          <Plus className="h-3.5 w-3.5 mr-1" /> New Engagement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider text-[12px]">New Engagement</DialogTitle>
        </DialogHeader>

        {noAntenna && (
          <div className="flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="mono text-[10px] font-bold text-destructive uppercase tracking-wide">No Antennas Available</p>
              <p className="mono text-[9px] text-muted-foreground mt-0.5">
                All serviceable antennas are currently allocated.
              </p>
            </div>
          </div>
        )}

        {!noAntenna && (
          <div className="mono text-[8.5px] text-muted-foreground/60 border border-border/50 rounded-sm px-2 py-1.5 bg-secondary/10">
            Antenna capacity: <span className="font-bold text-foreground">{availableAntennas.length}</span> of{" "}
            <span className="font-bold text-foreground">{serviceable("antenna").length}</span> serviceable unallocated
            &nbsp;·&nbsp; Max concurrent = {serviceable("antenna").length}
          </div>
        )}

        {inProgressMissingResources && (
          <div className="flex items-start gap-2 rounded-sm border border-amber-400/30 bg-amber-400/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="mono text-[9px] text-amber-700">
              "In Progress" requires all of: Antenna, Demodulator, Processor.
              Missing: {[!form.antenna_id && "Antenna", !form.demodulator_id && "Demodulator", !form.processing_server_id && "Processor"].filter(Boolean).join(", ")}
            </p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3 mt-1">
          <F label="Satellite">
            <Select value={form.satellite_id} onValueChange={(v) => set("satellite_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select satellite" /></SelectTrigger>
              <SelectContent>{sats.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>

          <F label={`Antenna * — ${availableAntennas.length} available`}>
            <Select value={form.antenna_id} onValueChange={(v) => set("antenna_id", v)} disabled={noAntenna}>
              <SelectTrigger><SelectValue placeholder={noAntenna ? "None available" : "Select antenna *"} /></SelectTrigger>
              <SelectContent>
                {availableAntennas.length === 0
                  ? <SelectItem value="_none" disabled>No serviceable antennas</SelectItem>
                  : availableAntennas.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <F label="LNA / LNB">
            <div className="flex gap-2 items-center">
              <div className="flex rounded-sm border border-border overflow-hidden shrink-0">
                {(["LNA", "LNB"] as const).map((t) => (
                  <button type="button" key={t} onClick={() => set("lna_type", t)}
                    className={`px-3 py-1.5 mono text-[9px] uppercase tracking-wider transition-colors ${
                      form.lna_type === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary/50"
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
              {lnaDevices.length > 0 ? (
                <Select value={form.lna_id} onValueChange={(v) => set("lna_id", v)}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={`Select ${form.lna_type}`} /></SelectTrigger>
                  <SelectContent>{lnaDevices.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <span className="mono text-[8.5px] text-muted-foreground/50 flex-1 px-2">
                  {form.lna_type} auto-paired with antenna
                </span>
              )}
            </div>
          </F>

          <div className="grid grid-cols-2 gap-2">
            <F label="Demodulator Type *">
              <Select value={form.demodulator_type} onValueChange={(v) => set("demodulator_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DEMOD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label={`Device * — ${availableDemod.length} available`}>
              <Select value={form.demodulator_id} onValueChange={(v) => set("demodulator_id", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {availableDemod.length === 0
                    ? <SelectItem value="_none" disabled>None available</SelectItem>
                    : availableDemod.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>

          <F label={`Processing Server * — ${availableServers.length} available`}>
            <Select value={form.processing_server_id} onValueChange={(v) => set("processing_server_id", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {availableServers.length === 0
                  ? <SelectItem value="_none" disabled>None available</SelectItem>
                  : availableServers.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <F label="Scheduled Start">
            <Input type="datetime-local" value={form.observation_start} onChange={(e) => set("observation_start", e.target.value)} />
          </F>

          <F label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </F>

          <F label="Remarks (optional)">
            <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </F>

          <Button type="submit" disabled={!canSubmit} className="w-full mono uppercase tracking-wider text-[10px]">
            {noAntenna
              ? "Blocked — No Antenna Available"
              : inProgressMissingResources
                ? "Assign Required Resources First"
                : "Create Engagement"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="label-eyebrow">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
