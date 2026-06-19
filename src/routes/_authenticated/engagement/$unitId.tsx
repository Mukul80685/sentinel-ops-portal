import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { engStatusClass, listSatellites } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STATUSES = ["Planned", "In Progress", "Completed", "Paused", "Failed"] as const;

export const Route = createFileRoute("/_authenticated/engagement/$unitId")({
  component: EngagementUnit,
});

function EngagementUnit() {
  const { unitId } = Route.useParams();
  const canEdit = useCanEdit();
  const qc = useQueryClient();

  const { data: unit } = useQuery({ queryKey: ["unit", unitId], queryFn: async () => (await supabase.from("units").select("*").eq("id", unitId).maybeSingle()).data });

  const { data: rows = [] } = useQuery({
    queryKey: ["eng", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engagements")
        .select("*, satellites:satellite_id(name), antenna:antenna_id(name), demodulator:demodulator_id(name), server:processing_server_id(name)")
        .eq("unit_id", unitId)
        .order("observation_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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

  return (
    <AppShell
      title={unit ? `${unit.code} — Engagements` : "Engagements"}
      subtitle="Present Engagement Status"
      showBack
      actions={canEdit ? <AddEngagement unitId={unitId} /> : null}
    >
      {rows.length === 0 ? (
        <Empty title="No active engagements" />
      ) : (
        <div className="panel overflow-auto">
          <table className="min-w-full text-sm mono">
            <thead className="bg-secondary">
              <tr>
                {["Satellite","Antenna","Demodulator","Processing Server","Start Time","Status","Remarks",""].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider border-r border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-3 py-2 font-bold">{r.satellites?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.antenna?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.demodulator?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.server?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.observation_start ? new Date(r.observation_start).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select value={r.status} onChange={(e) => update(r.id, { status: e.target.value })}
                        className={`px-2 py-1 rounded-sm text-[11px] uppercase tracking-wider ${engStatusClass(r.status)}`}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded-sm text-[11px] uppercase tracking-wider ${engStatusClass(r.status)}`}>{r.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input disabled={!canEdit} defaultValue={r.remarks ?? ""}
                      onBlur={(e) => e.target.value !== (r.remarks ?? "") && update(r.id, { remarks: e.target.value })}
                      className="w-48 bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm" />
                  </td>
                  <td className="px-3 py-2">
                    {canEdit && <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
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

function AddEngagement({ unitId }: { unitId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const { data: equipment = [] } = useQuery({
    queryKey: ["unit-equipment", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment")
        .select("id,name, category:category_id(name)")
        .eq("unit_id", unitId);
      return data ?? [];
    },
  });

  const byCat = (n: string) => equipment.filter((e: any) => e.category?.name === n);
  const [form, setForm] = useState({
    satellite_id: "",
    antenna_id: "",
    demodulator_id: "",
    processing_server_id: "",
    observation_start: "",
    status: "Planned",
    remarks: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.satellite_id) return;
    const { error } = await supabase.from("engagements").insert({
      unit_id: unitId,
      satellite_id: form.satellite_id,
      antenna_id: form.antenna_id || null,
      demodulator_id: form.demodulator_id || null,
      processing_server_id: form.processing_server_id || null,
      observation_start: form.observation_start || null,
      status: form.status as any,
      remarks: form.remarks || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Engagement created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["eng", unitId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8"><Plus className="h-3.5 w-3.5 mr-1" /> New Engagement</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="mono uppercase tracking-wider">New Engagement</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <F label="Satellite">
            <Select value={form.satellite_id} onValueChange={(v) => setForm({ ...form, satellite_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select satellite" /></SelectTrigger>
              <SelectContent>{sats.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Antenna">
              <Select value={form.antenna_id} onValueChange={(v) => setForm({ ...form, antenna_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{byCat("Antenna").map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Demodulator">
              <Select value={form.demodulator_id} onValueChange={(v) => setForm({ ...form, demodulator_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{byCat("Demodulators").map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </F>
          </div>
          <F label="Processing Server">
            <Select value={form.processing_server_id} onValueChange={(v) => setForm({ ...form, processing_server_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{byCat("Processing Servers").map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Observation Start"><Input type="datetime-local" value={form.observation_start} onChange={(e) => setForm({ ...form, observation_start: e.target.value })} /></F>
          <F label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Remarks"><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></F>
          <Button type="submit" className="w-full mono uppercase tracking-wider">Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="label-eyebrow">{label}</Label><div className="mt-1">{children}</div></div>;
}