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
import { listUnits, exportCsv } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/units")({ component: UnitsAdmin });

function UnitsAdmin() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  if (!isAdmin) return <AppShell title="Units" subtitle="Admin" showBack><div className="panel p-6 mono text-muted-foreground">Admin access required.</div></AppShell>;

  async function update(id: string, patch: any) {
    const { error } = await supabase.from("units").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["units"] });
  }
  async function remove(id: string) {
    if (!confirm("Delete unit and all related data?")) return;
    const { error } = await supabase.from("units").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["units"] });
  }

  return (
    <AppShell title="Units / Agencies" subtitle="Administration" showBack actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => exportCsv(units, "units.csv")} className="mono text-[11px] uppercase tracking-wider h-8">CSV</Button><AddUnit /></div>}>
      <div className="panel overflow-auto">
        <table className="min-w-full text-sm mono">
          <thead className="bg-secondary"><tr>{["Code","Name","Description",""].map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider border-r border-border">{h}</th>)}</tr></thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-3 py-2"><input defaultValue={u.code} onBlur={(e) => e.target.value !== u.code && update(u.id, { code: e.target.value })} className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm font-bold uppercase" /></td>
                <td className="px-3 py-2"><input defaultValue={u.name} onBlur={(e) => e.target.value !== u.name && update(u.id, { name: e.target.value })} className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm w-64" /></td>
                <td className="px-3 py-2"><input defaultValue={u.description ?? ""} onBlur={(e) => e.target.value !== (u.description ?? "") && update(u.id, { description: e.target.value })} className="bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm w-72" /></td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => remove(u.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function AddUnit() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("units").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Unit registered");
    setOpen(false); setForm({ code: "", name: "", description: "" });
    qc.invalidateQueries({ queryKey: ["units"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8"><Plus className="h-3.5 w-3.5 mr-1" /> Add Unit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="mono uppercase tracking-wider">Register Unit / Agency</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label className="label-eyebrow">Code *</Label><Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. 61 WEU" /></div>
          <div><Label className="label-eyebrow">Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label className="label-eyebrow">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <Button type="submit" className="w-full mono uppercase tracking-wider">Register</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}