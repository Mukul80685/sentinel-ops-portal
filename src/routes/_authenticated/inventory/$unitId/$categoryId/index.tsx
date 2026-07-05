import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { useCanEdit } from "@/lib/auth";
import { removeOperationalEquipment, updateOperationalEquipment } from "@/lib/operationalStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, ImageOff, Trash2 } from "lucide-react";
import { fileUrl, uploadFile } from "@/lib/storage";
import { getUnitById, listCategories, listEquipmentForUnit, statusClass } from "@/lib/queries";
import { toggleSelection, allSelected } from "@/lib/dataTableUtils";

export const Route = createFileRoute("/_authenticated/inventory/$unitId/$categoryId/")({
  component: EquipmentList,
});

const SERVICEABILITY_OPTIONS = [
  "Operational",
  "Partially Serviceable",
  "Under Repair",
  "Non-Serviceable",
] as const;

function EquipmentList() {
  const { unitId, categoryId } = Route.useParams();
  const canEdit = useCanEdit();
  const qc = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data: meta } = useQuery({
    queryKey: ["meta", unitId, categoryId],
    queryFn: async () => {
      const [unit, cats] = await Promise.all([getUnitById(unitId), listCategories()]);
      const cat = cats.find((c) => c.id === categoryId) ?? null;
      return {
        unit: unit ? { code: unit.code, name: unit.name } : null,
        cat: cat ? { name: cat.name } : null,
      };
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["eq", unitId, categoryId],
    queryFn: async () => {
      const all = await listEquipmentForUnit(unitId);
      return all.filter((e) => e.category_id === categoryId).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["eq", unitId, categoryId] });

  const visibleIds = items.map((e: any) => e.id);
  const selectAll = allSelected(visibleIds, selectedIds);

  function handleSelectAll() {
    setSelectedIds(selectAll ? new Set() : new Set(visibleIds));
  }

  function confirmBulkDelete() {
    const count = selectedIds.size;
    for (const id of selectedIds) {
      removeOperationalEquipment(id);
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    qc.invalidateQueries({ queryKey: ["eq", unitId, categoryId] });
    toast.success(`${count} item(s) deleted.`);
  }

  const unitLetter = meta?.unit?.code?.split("-").pop() ?? "";
  const headerTitle = meta
    ? `Unit ${unitLetter} \u2014 ${meta.cat?.name ?? "Equipment"}`
    : "Equipment";

  return (
    <AppShell
      title={headerTitle}
      showBack
      horizontalNav={null}
      actions={
        canEdit ? (
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer mono text-[11px] text-muted-foreground select-none">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="cursor-pointer accent-primary"
                />
                All
              </label>
            )}
            <AddDetailsDialog items={items} unitId={unitId} onSaved={refresh} />
          </div>
        ) : null
      }
    >
      {selectedIds.size > 0 && (
        <div className="mb-3 px-3 py-2 rounded-md border border-border bg-primary/5 flex items-center gap-3 mono text-[11px]">
          <span className="text-primary font-bold">
            {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="mono text-[11px] uppercase tracking-wider h-7"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <Empty
          title="No equipment registered"
          hint="Add equipment from the unit overview to see items here."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((eq: any) => (
            <div key={eq.id} className="relative group">
              {canEdit && (
                <div
                  className={`absolute top-2 right-2 z-10 transition-opacity ${
                    selectedIds.has(eq.id) || selectedIds.size > 0
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(eq.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedIds((prev) => toggleSelection(prev, eq.id));
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer accent-primary h-4 w-4 rounded shadow"
                  />
                </div>
              )}
              <Link
                to="/inventory/$unitId/$categoryId/$equipmentId"
                params={{ unitId, categoryId, equipmentId: eq.id }}
                className={`panel overflow-hidden block hover:border-primary transition ${
                  selectedIds.has(eq.id) ? "border-primary bg-primary/5" : ""
                }`}
                onClick={(e) => {
                  if (selectedIds.size > 0) e.preventDefault();
                }}
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
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              Delete Equipment
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              Delete {selectedIds.size} equipment item{selectedIds.size !== 1 ? "s" : ""} and all
              their related data? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="mono text-[11px] uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmBulkDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

// ── Add Details dialog — enriches an existing equipment record ────────────────

type EqItem = { id: string; name: string; make?: string | null; model?: string | null; serial_number?: string | null; serviceability?: string; remarks?: string | null };

const EMPTY_FORM = {
  name: "",
  make: "",
  model: "",
  serial_number: "",
  serviceability: "Operational" as string,
  remarks: "",
};

function AddDetailsDialog({
  items,
  unitId,
  onSaved,
}: {
  items: EqItem[];
  unitId: string;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function handleSelectItem(id: string) {
    setSelectedId(id);
    setPhoto(null);
    const item = items.find((i) => i.id === id);
    if (item) {
      setForm({
        name: item.name ?? "",
        make: item.make ?? "",
        model: item.model ?? "",
        serial_number: item.serial_number ?? "",
        serviceability: item.serviceability ?? "Operational",
        remarks: item.remarks ?? "",
      });
    }
  }

  function reset() {
    setSelectedId("");
    setPhoto(null);
    setForm(EMPTY_FORM);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) { toast.error("Please choose a resource."); return; }
    if (!form.make.trim()) { toast.error("Make is required."); return; }
    if (!form.model.trim()) { toast.error("Model is required."); return; }
    if (!form.serial_number.trim()) { toast.error("Serial number is required."); return; }
    if (!photo) { toast.error("Photograph is required."); return; }

    setBusy(true);
    try {
      const photo_url = await uploadFile(photo, `equipment/${unitId}`);
      const ok = updateOperationalEquipment(selectedId, {
        name: form.name.trim() || undefined,
        make: form.make.trim(),
        model: form.model.trim(),
        serial_number: form.serial_number.trim(),
        serviceability: form.serviceability as EqItem["serviceability"],
        remarks: form.remarks.trim() || null,
        photo_url,
      });
      if (!ok) throw new Error("Equipment not found.");
      toast.success("Details submitted.");
      setOpen(false);
      reset();
      onSaved();
      qc.invalidateQueries({ queryKey: ["eq-detail", selectedId] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="mono text-[11px] uppercase tracking-wider h-8">
          <ClipboardList className="h-3.5 w-3.5 mr-1" /> Add Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider">Add Details</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Choose Resource">
            <Select value={selectedId} onValueChange={handleSelectItem}>
              <SelectTrigger>
                <SelectValue placeholder="Select existing resource" />
              </SelectTrigger>
              <SelectContent>
                {items.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-muted-foreground mono">No resources available</div>
                ) : (
                  items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>

          {selectedId && (
            <>
              <div className="border-t border-border pt-3">
                <div className="label-eyebrow mb-3">Equipment Details</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Make *">
                  <Input
                    required
                    value={form.make}
                    onChange={(e) => setForm({ ...form, make: e.target.value })}
                    placeholder="e.g. Hughes"
                  />
                </Field>
                <Field label="Model *">
                  <Input
                    required
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="e.g. HX100"
                  />
                </Field>
              </div>

              <Field label="Serial Number *">
                <Input
                  required
                  value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  placeholder="e.g. SN-XXXXXXXX"
                />
              </Field>

              <Field label="Serviceability *">
                <Select
                  value={form.serviceability}
                  onValueChange={(v) => setForm({ ...form, serviceability: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICEABILITY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Photograph *">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
                {!photo && (
                  <p className="mono text-[11px] text-muted-foreground mt-1">
                    An image is required before submitting.
                  </p>
                )}
              </Field>

              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Optional display name"
                />
              </Field>

              <Field label="Remarks">
                <Input
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="Optional remarks"
                />
              </Field>
            </>
          )}

          <Button
            type="submit"
            disabled={busy || !selectedId || !photo}
            className="w-full mono uppercase tracking-wider"
          >
            {busy ? "Submitting…" : "Submit"}
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
