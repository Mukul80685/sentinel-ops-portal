import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listSatellites, exportCsv } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/satellites")({ component: SatellitesAdmin });

function SatellitesAdmin() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  if (!isAdmin) return <AppShell title="Satellites" subtitle="Admin" showBack><div className="panel p-6 mono text-muted-foreground">Admin access required.</div></AppShell>;

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("satellites").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sats"] });
  }
  async function remove(id: string) {
    if (!confirm("Delete satellite?")) return;
    const { error } = await supabase.from("satellites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sats"] });
  }

  return (
    <AppShell title="Satellites" subtitle="Administration" showBack actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => exportCsv(sats, "satellites.csv")} className="mono text-[11px] uppercase tracking-wider h-8">CSV</Button><AddSat /></div>}>
      <div className="panel overflow-auto">
        <table className="min-w-full text-sm mono">
          <thead className="bg-secondary"><tr>{["Name","Orbital Position","Notes",""].map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider border-r border-border">{h}</th>)}</tr></thead>
          <tbody>
            {sats.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2"><input defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && update(s.id, { name: e.target.value })} className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm font-bold" /></td>
                <td className="px-3 py-2"><input type="number" step="0.1" defaultValue={s.orbital_position} onBlur={(e) => Number(e.target.value) !== Number(s.orbital_position) && update(s.id, { orbital_position: Number(e.target.value) })} className="w-24 bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm" /></td>
                <td className="px-3 py-2"><input defaultValue={s.notes ?? ""} onBlur={(e) => e.target.value !== (s.notes ?? "") && update(s.id, { notes: e.target.value })} className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm w-72" /></td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function AddSat() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", orbital_position: 0, notes: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("satellites").insert({ ...form, orbital_position: Number(form.orbital_position) });
    if (error) return toast.error(error.message);
    toast.success("Satellite added");
    setOpen(false); setForm({ name: "", orbital_position: 0, notes: "" });
    qc.invalidateQueries({ queryKey: ["sats"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8"><Plus className="h-3.5 w-3.5 mr-1" /> Add Satellite</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="mono uppercase tracking-wider">Register Satellite</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label className="label-eyebrow">Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SAT-1" /></div>
          <div><Label className="label-eyebrow">Orbital Position (°E) *</Label><Input required type="number" step="0.1" value={form.orbital_position} onChange={(e) => setForm({ ...form, orbital_position: Number(e.target.value) })} /></div>
          <div><Label className="label-eyebrow">Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <Button type="submit" className="w-full mono uppercase tracking-wider">Register</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}