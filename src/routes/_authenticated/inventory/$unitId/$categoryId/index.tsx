import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, ImageOff } from "lucide-react";
import { fileUrl, uploadFile } from "@/lib/storage";
import { statusClass } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/inventory/$unitId/$categoryId/")({
  component: EquipmentList,
});

function EquipmentList() {
  const { unitId, categoryId } = Route.useParams();
  const canEdit = useCanEdit();
  const qc = useQueryClient();

  const { data: meta } = useQuery({
    queryKey: ["meta", unitId, categoryId],
    queryFn: async () => {
      const [u, c] = await Promise.all([
        supabase.from("units").select("code,name").eq("id", unitId).maybeSingle(),
        supabase.from("equipment_categories").select("name").eq("id", categoryId).maybeSingle(),
      ]);
      return { unit: u.data, cat: c.data };
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["eq", unitId, categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("*")
        .eq("unit_id", unitId)
        .eq("category_id", categoryId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell
      title={meta ? `${meta.unit?.code ?? ""} • ${meta.cat?.name ?? ""}` : "Equipment"}
      subtitle="Resource Inventory // Equipment"
      showBack
      actions={canEdit ? <AddEquipmentDialog unitId={unitId} categoryId={categoryId} onSaved={() => qc.invalidateQueries({ queryKey: ["eq", unitId, categoryId] })} /> : null}
    >
      {items.length === 0 ? (
        <Empty title="No equipment registered" hint={canEdit ? "Use ADD EQUIPMENT to register a unit." : "Awaiting registration by an operator."} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((eq: any) => (
            <Link
              key={eq.id}
              to="/inventory/$unitId/$categoryId/$equipmentId"
              params={{ unitId, categoryId, equipmentId: eq.id }}
              className="panel overflow-hidden group hover:border-primary transition"
            >
              <div className="aspect-video bg-secondary grid place-items-center overflow-hidden">
                {eq.photo_url ? (
                  <img src={fileUrl(eq.photo_url)} alt={eq.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageOff className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <span className={`status-dot ${statusClass(eq.serviceability)}`} />
                  <span className="label-eyebrow truncate">{eq.serviceability}</span>
                </div>
                <div className="mono text-sm font-bold uppercase mt-1 truncate">{eq.name}</div>
                <div className="text-[11px] text-muted-foreground mono truncate">{eq.make} {eq.model}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function AddEquipmentDialog({ unitId, categoryId, onSaved }: { unitId: string; categoryId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    make: "",
    model: "",
    serial_number: "",
    serviceability: "Operational" as const,
    specifications: "",
    remarks: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let photo_url: string | null = null;
      if (photo) photo_url = await uploadFile(photo, `equipment/${unitId}`);
      const { error } = await supabase.from("equipment").insert({
        unit_id: unitId,
        category_id: categoryId,
        ...form,
        photo_url,
      });
      if (error) throw error;
      toast.success("Equipment registered");
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Equipment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider">Register Equipment</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name *">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make">
              <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </Field>
            <Field label="Model">
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </Field>
          </div>
          <Field label="Serial Number">
            <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
          </Field>
          <Field label="Serviceability">
            <Select value={form.serviceability} onValueChange={(v) => setForm({ ...form, serviceability: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Operational", "Partially Serviceable", "Under Repair", "Non-Serviceable"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Photograph">
            <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Remarks">
            <Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full mono uppercase tracking-wider">
            {busy ? "Saving…" : "Register"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="label-eyebrow">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}