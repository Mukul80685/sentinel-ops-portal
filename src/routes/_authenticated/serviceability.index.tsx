import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits, statusClass } from "@/lib/queries";
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
import { AlertTriangle, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/serviceability/")({
  component: ServiceabilityPage,
});

function ServiceabilityPage() {
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [activeEqId, setActiveEqId] = useState<string | null>(null);

  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("id,name,unit_id,serviceability, units:unit_id(code,name), category:category_id(name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const filterFn = (r: any) => {
      if (!q) return true;
      const hay = `${r.name} ${r.units?.code ?? ""} ${r.category?.name ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    };
    return units.map((u) => ({
      unit: u,
      items: equipment.filter((e: any) => e.unit_id === u.id && filterFn(e)),
    }));
  }, [units, equipment, q]);

  const activeEq: any = equipment.find((e: any) => e.id === activeEqId) ?? null;

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

  const isFaulty = (s: string) => s !== "Operational";

  const summary = useMemo(() => {
    const counts = { Operational: 0, "Partially Serviceable": 0, "Under Repair": 0, "Non-Serviceable": 0 } as Record<string, number>;
    equipment.forEach((e: any) => { counts[e.serviceability] = (counts[e.serviceability] ?? 0) + 1; });
    const total = equipment.length || 1;
    return {
      total: equipment.length,
      op: counts["Operational"] ?? 0,
      partial: counts["Partially Serviceable"] ?? 0,
      repair: counts["Under Repair"] ?? 0,
      down: counts["Non-Serviceable"] ?? 0,
      readiness: Math.round(((counts["Operational"] ?? 0) / total) * 100),
      pie: [
        { name: "Operational",      value: counts["Operational"] ?? 0,            color: "hsl(142 70% 45%)" },
        { name: "Partially Svc",    value: counts["Partially Serviceable"] ?? 0,  color: "hsl(38 92% 50%)" },
        { name: "Under Repair",     value: counts["Under Repair"] ?? 0,           color: "hsl(25 95% 53%)" },
        { name: "Non-Serviceable",  value: counts["Non-Serviceable"] ?? 0,        color: "hsl(0 84% 60%)" },
      ],
    };
  }, [equipment]);

  return (
    <AppShell title="Serviceability State" subtitle="Operational Readiness // All Units">
      {equipment.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
          <SumCard label="Total Equipment" value={summary.total} tone="" />
          <SumCard label="Operational"     value={summary.op}    tone="text-emerald-400" />
          <SumCard label="Partial / Repair" value={summary.partial + summary.repair} tone="text-amber-400" />
          <SumCard label="Non-Serviceable" value={summary.down}  tone="text-destructive" />
          <SumCard label="Readiness"       value={`${summary.readiness}%`} tone="text-primary" />
        </div>
      )}
      {equipment.length > 0 && (
        <div className="panel p-3 mb-3">
          <div className="label-eyebrow mb-1">Operational Readiness</div>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={summary.pie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {summary.pie.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="panel p-3 mb-3">
        <div className="relative max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search equipment, unit, resource type" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7 mono" />
        </div>
      </div>

      {units.length === 0 ? (
        <Empty title="No units registered" />
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {grouped.map(({ unit, items }) => {
            const faultyCount = items.filter((i: any) => isFaulty(i.serviceability)).length;
            return (
              <div key={unit.id} className="panel p-3">
                <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                  <div>
                    <div className="label-eyebrow">{unit.name}</div>
                    <div className="mono text-sm font-bold uppercase">{unit.code}</div>
                  </div>
                  <div className="text-[11px] mono">
                    <span className="text-muted-foreground">Faults: </span>
                    <span className={faultyCount ? "text-destructive font-bold" : "text-foreground"}>{faultyCount}</span>
                    <span className="text-muted-foreground"> / {items.length}</span>
                  </div>
                </div>
                {items.length === 0 ? (
                  <div className="text-[12px] mono text-muted-foreground py-4 text-center">No equipment registered</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {items.map((r: any) => {
                      const faulty = isFaulty(r.serviceability);
                      return (
                        <li key={r.id} className="py-2 flex items-center gap-2">
                          <span className={`status-dot ${statusClass(r.serviceability)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="mono text-sm truncate">{r.name}</div>
                            <div className="text-[11px] mono text-muted-foreground truncate">{r.category?.name}</div>
                          </div>
                          {faulty ? (
                            <button
                              onClick={() => setActiveEqId(r.id)}
                              className="text-[10px] mono uppercase tracking-wider px-2 py-1 rounded-sm bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30 inline-flex items-center gap-1"
                            >
                              <AlertTriangle className="h-3 w-3" /> {r.serviceability}
                            </button>
                          ) : (
                            <span className="text-[10px] mono uppercase text-muted-foreground">OK</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!activeEq} onOpenChange={(o) => !o && setActiveEqId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider flex items-center gap-2">
              <Wrench className="h-4 w-4 text-accent" /> {activeEq?.name} — Fault Record
            </DialogTitle>
          </DialogHeader>
          {activeEq && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-[11px] mono">
                <Info label="Unit" value={activeEq.units?.code ?? "—"} />
                <Info label="Resource" value={activeEq.category?.name ?? "—"} />
                <Info label="Status" value={activeEq.serviceability} />
              </div>
              {faults.length === 0 ? (
                <Empty title="No fault details logged" hint={canEdit ? "Use the form below to log the first entry." : "Awaiting maintenance log."} />
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {faults.map((f: any) => (
                    <li key={f.id} className="panel p-3">
                      <div className="flex items-center justify-between">
                        <div className="label-eyebrow">{f.category ?? "Uncategorised"}</div>
                        <div className="text-[11px] mono text-muted-foreground">Raised {f.date_raised}</div>
                      </div>
                      {f.description && <p className="text-[12px] mt-1">{f.description}</p>}
                      <div className="grid grid-cols-2 gap-1 mt-2 text-[11px] mono">
                        <span className="text-muted-foreground">ETA Restoration</span>
                        <span>{f.estimated_restoration ?? "—"}</span>
                        <span className="text-muted-foreground">Remarks</span>
                        <span className="truncate">{f.maintenance_remarks ?? "—"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <FaultForm
                  equipmentId={activeEq.id}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["faults", activeEq.id] })}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-2 py-1.5">
      <div className="label-eyebrow">{label}</div>
      <div className="text-foreground truncate">{value}</div>
    </div>
  );
}

function SumCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="panel p-3">
      <div className="label-eyebrow">{label}</div>
      <div className={`mono text-2xl font-bold mt-1 ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function FaultForm({ equipmentId, onSaved }: { equipmentId: string; onSaved: () => void }) {
  const [form, setForm] = useState({
    date_raised: new Date().toISOString().slice(0, 10),
    category: "",
    description: "",
    estimated_restoration: "",
    maintenance_remarks: "",
  });
  const [busy, setBusy] = useState(false);
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
    if (error) return toast.error(error.message);
    toast.success("Fault logged");
    setForm({ ...form, category: "", description: "", maintenance_remarks: "" });
    onSaved();
  }
  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border pt-3">
      <div className="label-eyebrow">Log new fault</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="label-eyebrow">Date</Label>
          <Input type="date" value={form.date_raised} onChange={(e) => setForm({ ...form, date_raised: e.target.value })} />
        </div>
        <div>
          <Label className="label-eyebrow">Category</Label>
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Electrical / RF / Software" />
        </div>
      </div>
      <div>
        <Label className="label-eyebrow">Description</Label>
        <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="label-eyebrow">ETA Restoration</Label>
          <Input type="date" value={form.estimated_restoration} onChange={(e) => setForm({ ...form, estimated_restoration: e.target.value })} />
        </div>
        <div>
          <Label className="label-eyebrow">Maintenance Remarks</Label>
          <Input value={form.maintenance_remarks} onChange={(e) => setForm({ ...form, maintenance_remarks: e.target.value })} />
        </div>
      </div>
      <Button type="submit" disabled={busy} size="sm" className="mono uppercase tracking-wider">
        {busy ? "Saving…" : "Log Fault"}
      </Button>
    </form>
  );
}