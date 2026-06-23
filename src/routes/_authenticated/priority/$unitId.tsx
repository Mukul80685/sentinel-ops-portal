import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ccModuleBackLink } from "@/lib/controlCenter";
import { Empty } from "@/components/Empty";
import { listSatellites, priorityClass, exportCsv } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/priority/$unitId")({
  component: PriorityUnit,
});

const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

function PriorityUnit() {
  const { unitId } = Route.useParams();
  const canEdit = useCanEdit();
  const qc = useQueryClient();

  const { data: unit } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: async () => (await supabase.from("units").select("*").eq("id", unitId).maybeSingle()).data,
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["alloc", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select("*, satellites:satellite_id(id,name,orbital_position)")
        .eq("unit_id", unitId);
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) => a.satellites.orbital_position - b.satellites.orbital_position);
    },
  });

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("allocations").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["alloc", unitId] });
  }

  async function remove(id: string) {
    if (!confirm("Remove allocation?")) return;
    const { error } = await supabase.from("allocations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["alloc", unitId] });
  }

  function exportData() {
    exportCsv(
      rows.map((r: any) => ({
        Satellite: r.satellites.name,
        "Orbital Position": r.satellites.orbital_position,
        Priority: r.priority,
        EIRP: r.eirp ?? "",
        "Observation Requirement": r.observation_requirement ?? "",
        "Allocation Date": r.allocation_date,
        Remarks: r.remarks ?? "",
      })),
      `priority-${unit?.code ?? unitId}.csv`,
    );
  }

  return (
    <AppShell
      title={unit ? `${unit.code} — Allocations` : "Allocations"}
      subtitle="Priority & Allocation"
      showBack
      backLink={ccModuleBackLink("priority")}
      horizontalNav={null}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportData} className="mono text-[11px] uppercase tracking-wider h-8">
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
          {canEdit && <AddAllocation unitId={unitId} existingIds={rows.map((r: any) => r.satellite_id)} />}
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty title="No satellites allocated" hint={canEdit ? "Use ADD SATELLITE to allocate." : ""} />
      ) : (
        <div className="panel overflow-auto">
          <table className="min-w-full text-sm mono">
            <thead className="bg-secondary">
              <tr>
                <Th>Satellite</Th><Th>Orbit</Th><Th>Priority</Th><Th>EIRP</Th>
                <Th>Observation Requirement</Th><Th>Allocation Date</Th><Th>Remarks</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-3 py-2 font-bold">{r.satellites.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{Number(r.satellites.orbital_position).toFixed(1)}°E</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select value={r.priority} onChange={(e) => update(r.id, { priority: e.target.value })}
                        className={`px-2 py-1 rounded-sm text-[11px] uppercase tracking-wider ${priorityClass(r.priority)}`}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded-sm text-[11px] uppercase tracking-wider ${priorityClass(r.priority)}`}>{r.priority}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input disabled={!canEdit} type="number" defaultValue={r.eirp ?? ""}
                      onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.eirp) update(r.id, { eirp: v }); }}
                      className="w-20 bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm" />
                  </td>
                  <td className="px-3 py-2">
                    <input disabled={!canEdit} defaultValue={r.observation_requirement ?? ""}
                      onBlur={(e) => e.target.value !== (r.observation_requirement ?? "") && update(r.id, { observation_requirement: e.target.value })}
                      className="w-64 bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm" />
                  </td>
                  <td className="px-3 py-2">
                    <input disabled={!canEdit} type="date" defaultValue={r.allocation_date}
                      onBlur={(e) => e.target.value !== r.allocation_date && update(r.id, { allocation_date: e.target.value })}
                      className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm" />
                  </td>
                  <td className="px-3 py-2">
                    <input disabled={!canEdit} defaultValue={r.remarks ?? ""}
                      onBlur={(e) => e.target.value !== (r.remarks ?? "") && update(r.id, { remarks: e.target.value })}
                      className="w-48 bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm" />
                  </td>
                  <td className="px-3 py-2">
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => remove(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider border-r border-border">{children}</th>;
}

function AddAllocation({ unitId, existingIds }: { unitId: string; existingIds: string[] }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const [form, setForm] = useState({ satellite_id: "", priority: "Medium", eirp: "", observation_requirement: "", remarks: "" });
  const available = sats.filter((s) => !existingIds.includes(s.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.satellite_id) return;
    const { error } = await supabase.from("allocations").insert({
      unit_id: unitId,
      satellite_id: form.satellite_id,
      priority: form.priority as any,
      eirp: form.eirp === "" ? null : Number(form.eirp),
      observation_requirement: form.observation_requirement || null,
      remarks: form.remarks || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Allocated");
    setOpen(false);
    setForm({ satellite_id: "", priority: "Medium", eirp: "", observation_requirement: "", remarks: "" });
    qc.invalidateQueries({ queryKey: ["alloc", unitId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8"><Plus className="h-3.5 w-3.5 mr-1" /> Add Satellite</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="mono uppercase tracking-wider">Allocate Satellite</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label className="label-eyebrow">Satellite</Label>
            <Select value={form.satellite_id} onValueChange={(v) => setForm({ ...form, satellite_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select satellite" /></SelectTrigger>
              <SelectContent>{available.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {Number(s.orbital_position).toFixed(1)}°E</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="label-eyebrow">Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="label-eyebrow">EIRP (dBW)</Label><Input type="number" value={form.eirp} onChange={(e) => setForm({ ...form, eirp: e.target.value })} /></div>
          <div><Label className="label-eyebrow">Observation Requirement</Label><Input value={form.observation_requirement} onChange={(e) => setForm({ ...form, observation_requirement: e.target.value })} /></div>
          <div><Label className="label-eyebrow">Remarks</Label><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
          <Button type="submit" className="w-full mono uppercase tracking-wider">Allocate</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}