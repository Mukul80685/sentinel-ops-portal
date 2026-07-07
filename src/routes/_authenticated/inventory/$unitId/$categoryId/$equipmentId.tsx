import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { fileUrl, signedUrl, uploadFile } from "@/lib/storage";
import { getEquipmentById, statusClass } from "@/lib/queries";
import {
  getOperationalEquipmentById,
  insertEquipmentAttachment,
  listEquipmentAttachments,
  removeEquipmentAttachment,
  removeOperationalEquipment,
  updateOperationalEquipment,
} from "@/lib/operationalStore";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boxes, FileText, Paperclip, Trash2, ImageOff, Save, Download } from "lucide-react";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";

export const Route = createFileRoute("/_authenticated/inventory/$unitId/$categoryId/$equipmentId")({
  component: EquipmentDetail,
});

function EquipmentDetail() {
  const { unitId, categoryId, equipmentId } = Route.useParams();
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: eq } = useQuery({
    queryKey: ["eq-detail", equipmentId],
    queryFn: () => getEquipmentById(equipmentId),
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["att", equipmentId],
    queryFn: () => listEquipmentAttachments(equipmentId),
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (eq) setForm(eq);
  }, [eq]);

  async function save() {
    if (!updateOperationalEquipment(equipmentId, {
      name: form.name,
      make: form.make,
      model: form.model,
      serial_number: form.serial_number,
      date_of_procurement: form.date_of_procurement || null,
      specifications: form.specifications,
      remarks: form.remarks,
      serviceability: form.serviceability,
    })) {
      return toast.error("Equipment not found.");
    }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["eq-detail", equipmentId] });
    qc.invalidateQueries({ queryKey: ["eq", unitId, categoryId] });
  }

  async function changePhoto(file: File) {
    const path = await uploadFile(file, `equipment/${unitId}`);
    if (!updateOperationalEquipment(equipmentId, { photo_url: path })) {
      return toast.error("Equipment not found.");
    }
    toast.success("Photo updated");
    qc.invalidateQueries({ queryKey: ["eq-detail", equipmentId] });
    qc.invalidateQueries({ queryKey: ["eq", unitId, categoryId] });
  }

  async function addAttachment(file: File) {
    try {
      if (!getOperationalEquipmentById(equipmentId)) {
        toast.error("Equipment not found.");
        return;
      }
      const path = await uploadFile(file, `equipment/${equipmentId}/docs`);
      insertEquipmentAttachment({
        entity_id: equipmentId,
        file_name: file.name,
        file_url: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      toast.success("Attachment uploaded");
      qc.invalidateQueries({ queryKey: ["att", equipmentId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeAttachment(id: string) {
    if (!removeEquipmentAttachment(id)) {
      return toast.error("Attachment not found.");
    }
    qc.invalidateQueries({ queryKey: ["att", equipmentId] });
  }

  async function deleteEquipment() {
    if (!confirm("Delete this equipment record?")) return;
    if (!removeOperationalEquipment(equipmentId)) {
      return toast.error("Equipment not found.");
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["eq", unitId, categoryId] });
    navigate({ to: "/inventory/$unitId/$categoryId", params: { unitId, categoryId } });
  }

  async function openAttachment(path: string) {
    const url = await signedUrl(path);
    window.open(url, "_blank");
  }

  if (!form)
    return (
      <AppShell
        title="Resource Inventory"
        pageTitle="Loading"
        headerIcon={<HomeNavIconBadge icon={Boxes} theme="inventory" size="md" />}
        showBack
        horizontalNav={null}
      >
        <div className="text-muted-foreground">Loading…</div>
      </AppShell>
    );

  return (
    <AppShell
      title="Resource Inventory"
      pageTitle={`${form.name} — Equipment Record`}
      headerIcon={<HomeNavIconBadge icon={Boxes} theme="inventory" size="md" />}
      showBack
      horizontalNav={null}
      actions={
        canEdit ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={save} className="mono text-[11px] uppercase tracking-wider h-8">
              <Save className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
            <Button size="sm" variant="destructive" onClick={deleteEquipment} className="mono text-[11px] uppercase tracking-wider h-8">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-3">
          <div className="panel overflow-hidden">
            <div className="aspect-video bg-secondary grid place-items-center">
              {form.photo_url ? (
                <img src={fileUrl(form.photo_url)} alt={form.name} className="w-full h-full object-cover" />
              ) : (
                <ImageOff className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            {canEdit && (
              <div className="p-3 border-t border-border">
                <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && changePhoto(e.target.files[0])} />
              </div>
            )}
          </div>
          <div className="panel p-3">
            <div className="flex items-center gap-2">
              <span className={`status-dot ${statusClass(form.serviceability)}`} />
              <span className="mono text-sm uppercase font-bold">{form.serviceability}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 panel p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <F label="Name"><Input disabled={!canEdit} value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
            <F label="Serviceability">
              <Select disabled={!canEdit} value={form.serviceability} onValueChange={(v) => setForm({ ...form, serviceability: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Operational", "Partially Serviceable", "Under Repair", "Non-Serviceable"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <F label="Make"><Input disabled={!canEdit} value={form.make ?? ""} onChange={(e) => setForm({ ...form, make: e.target.value })} /></F>
            <F label="Model"><Input disabled={!canEdit} value={form.model ?? ""} onChange={(e) => setForm({ ...form, model: e.target.value })} /></F>
            <F label="Serial Number"><Input disabled={!canEdit} value={form.serial_number ?? ""} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></F>
            <F label="Date of Procurement"><Input type="date" disabled={!canEdit} value={form.date_of_procurement ?? ""} onChange={(e) => setForm({ ...form, date_of_procurement: e.target.value })} /></F>
          </div>
          <F label="Specifications">
            <Textarea disabled={!canEdit} rows={4} value={form.specifications ?? ""} onChange={(e) => setForm({ ...form, specifications: e.target.value })} />
          </F>
          <F label="Remarks">
            <Textarea disabled={!canEdit} rows={2} value={form.remarks ?? ""} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </F>
        </div>
      </div>

      <div className="panel p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="mono text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Attached Documents
          </div>
          {canEdit && (
            <Input
              type="file"
              className="max-w-xs"
              onChange={(e) => e.target.files?.[0] && addAttachment(e.target.files[0])}
            />
          )}
        </div>
        {attachments.length === 0 ? (
          <div className="text-xs text-muted-foreground mono">NO ATTACHMENTS</div>
        ) : (
          <ul className="divide-y divide-border">
            {attachments.map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                <span className="flex-1 truncate mono">{a.file_name}</span>
                <span className="text-[11px] text-muted-foreground mono">{(a.size_bytes / 1024).toFixed(0)} KB</span>
                <Button variant="ghost" size="sm" onClick={() => openAttachment(a.file_url)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => removeAttachment(a.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
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