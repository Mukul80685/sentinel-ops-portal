import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listSatellites, listUnits, exportCsv } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Search, Download, FileText, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { signedUrl, uploadFile } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/intel/$unitId")({ component: IntelRepository });

function IntelRepository() {
  const { unitId } = Route.useParams();
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [satFilter, setSatFilter] = useState("");
  const unitFilter = unitId;
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const scopedUnit = units.find((u) => u.id === unitId);
  const { data: rows = [] } = useQuery({
    queryKey: ["intel", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intel_records")
        .select("*, satellites:satellite_id(name), units:unit_id(code)")
        .eq("unit_id", unitId)
        .order("observation_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => rows.filter((r: any) => {
    if (satFilter && r.satellite_id !== satFilter) return false;
    if (unitFilter && r.unit_id !== unitFilter) return false;
    if (dateFrom && r.observation_date < dateFrom) return false;
    if (dateTo && r.observation_date > dateTo) return false;
    if (q) {
      const hay = `${r.satellites?.name ?? ""} ${r.units?.code ?? ""} ${r.frequency ?? ""} ${r.band ?? ""} ${r.summary ?? ""} ${r.analysis_report ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, satFilter, unitFilter, dateFrom, dateTo]);

  async function remove(id: string) {
    if (!confirm("Delete record?")) return;
    const { error } = await supabase.from("intel_records").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["intel"] });
  }

  function exportData() {
    exportCsv(filtered.map((r: any) => ({
      Date: r.observation_date,
      Satellite: r.satellites?.name,
      Agency: r.units?.code,
      Frequency: r.frequency,
      Band: r.band,
      Summary: r.summary,
      Analysis: r.analysis_report,
    })), "intel-records.csv");
  }

  if (units.length > 0 && !scopedUnit) {
    return (
      <AppShell title="INT Repository" subtitle="Module 05" showBack>
        <Empty title="No agent registered for this unit" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={scopedUnit ? `INT Repository — ${scopedUnit.code}` : "INT Repository"}
      subtitle="Module 05 // Historical Archive"
      showBack
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportData} className="mono text-[11px] uppercase tracking-wider h-8"><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
          {canEdit && <NewIntelDialog onSaved={() => qc.invalidateQueries({ queryKey: ["intel"] })} />}
        </div>
      }
    >
      <div className="panel p-3 mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <div className="relative lg:col-span-2">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search keyword, frequency, summary…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7 mono" />
        </div>
        <select className="bg-input border border-border rounded-sm px-2 py-1.5 text-sm mono" value={satFilter} onChange={(e) => setSatFilter(e.target.value)}>
          <option value="">All satellites</option>
          {sats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="mono text-xs px-2 py-1.5 border border-border rounded-sm bg-secondary/40 truncate flex items-center">
          Unit: <span className="text-primary font-bold ml-1">{scopedUnit?.code ?? "—"}</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mono text-xs" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mono text-xs" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty title="No records match" hint={rows.length === 0 ? "No intelligence records archived yet." : "Try adjusting your filters."} />
      ) : (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          {filtered.map((r: any) => (
            <IntelCard key={r.id} record={r} canEdit={canEdit} onDelete={() => remove(r.id)} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function IntelCard({ record, canEdit, onDelete }: { record: any; canEdit: boolean; onDelete: () => void }) {
  const { data: attachments = [] } = useQuery({
    queryKey: ["intel-att", record.id],
    queryFn: async () => (await supabase.from("attachments").select("*").eq("entity_type", "intel").eq("entity_id", record.id)).data ?? [],
  });
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label-eyebrow">{record.observation_date} • {record.units?.code ?? "—"}</div>
          <div className="mono text-base font-bold uppercase truncate">{record.satellites?.name ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground mono mt-1">{record.frequency} {record.band && `• ${record.band}`}</div>
        </div>
        {canEdit && <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
      </div>
      {record.summary && <p className="text-sm mt-3 text-foreground/90">{record.summary}</p>}
      {record.analysis_report && <p className="text-xs mt-2 text-muted-foreground whitespace-pre-wrap">{record.analysis_report}</p>}
      {attachments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="label-eyebrow flex items-center gap-1"><Paperclip className="h-3 w-3" /> Attachments</div>
          <ul className="mt-1 space-y-1">
            {attachments.map((a: any) => (
              <li key={a.id}>
                <button onClick={async () => window.open(await signedUrl(a.file_url), "_blank")} className="text-xs mono text-primary hover:underline flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {a.file_name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NewIntelDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const [form, setForm] = useState({ satellite_id: "", unit_id: "", observation_date: new Date().toISOString().slice(0, 10), frequency: "", band: "", summary: "", analysis_report: "" });
  const [files, setFiles] = useState<FileList | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data, error } = await supabase.from("intel_records").insert({ ...form, satellite_id: form.satellite_id || null, unit_id: form.unit_id || null }).select().single();
      if (error) throw error;
      if (files && data) {
        for (const f of Array.from(files)) {
          const path = await uploadFile(f, `intel/${data.id}`);
          await supabase.from("attachments").insert({ entity_type: "intel", entity_id: data.id, file_name: f.name, file_url: path, mime_type: f.type, size_bytes: f.size });
        }
      }
      toast.success("Record archived");
      setOpen(false);
      onSaved();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8"><Plus className="h-3.5 w-3.5 mr-1" /> New Record</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="mono uppercase tracking-wider">Archive INT Record</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="label-eyebrow">Satellite</Label>
              <Select value={form.satellite_id} onValueChange={(v) => setForm({ ...form, satellite_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{sats.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="label-eyebrow">Agency</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.code}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="label-eyebrow">Date</Label><Input type="date" value={form.observation_date} onChange={(e) => setForm({ ...form, observation_date: e.target.value })} /></div>
            <div><Label className="label-eyebrow">Frequency</Label><Input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} /></div>
            <div><Label className="label-eyebrow">Band</Label><Input value={form.band} onChange={(e) => setForm({ ...form, band: e.target.value })} /></div>
          </div>
          <div><Label className="label-eyebrow">Summary</Label><Textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
          <div><Label className="label-eyebrow">Analysis Report</Label><Textarea rows={4} value={form.analysis_report} onChange={(e) => setForm({ ...form, analysis_report: e.target.value })} /></div>
          <div><Label className="label-eyebrow">Attachments</Label><Input type="file" multiple onChange={(e) => setFiles(e.target.files)} /></div>
          <Button type="submit" className="w-full mono uppercase tracking-wider">Archive</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}