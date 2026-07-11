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
import { Boxes, ClipboardList, Download, ImageOff, Trash2 } from "lucide-react";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { fileUrl, uploadFile, deleteStoredFile } from "@/lib/storage";
import {
  antennaPhotoLimitMessage,
  canAddAntennaPhoto,
  getAntennaPhotoQuota,
  MAX_ANTENNA_IMAGES_PER_UNIT,
} from "@/lib/inventoryAntennaLimits";
import { getUnitById, listCategories, listEquipmentForUnit, statusClass } from "@/lib/queries";
import { unitDisplayFromRecord } from "@/lib/unitDisplay";
import { buildCsv, downloadCsv, toggleSelection, allSelected } from "@/lib/dataTableUtils";
import { adminExportFilename } from "@/lib/adminExportNaming";

export const Route = createFileRoute("/_authenticated/inventory/$unitId/$categoryId/")({
  component: EquipmentList,
});

const SERVICEABILITY_OPTIONS = [
  "Operational",
  "Partially Serviceable",
  "Under Repair",
  "Non-Serviceable",
] as const;

const ANTENNA_CATEGORY_ID = "op-cat-antenna";

function isAntennaCategory(categoryId: string, categoryName?: string | null): boolean {
  return categoryId === ANTENNA_CATEGORY_ID || categoryName === "Antenna";
}

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

  function exportEquipment(list: typeof items) {
    if (list.length === 0) {
      toast.error("No records to export.");
      return;
    }
    const headers = [
      "Name",
      "Make",
      "Model",
      "Serial Number",
      "Serviceability",
      "Specifications",
      "Remarks",
    ];
    const rows = list.map((eq: {
      name: string;
      make: string;
      model: string;
      serial_number: string;
      serviceability: string;
      specifications?: string | null;
      remarks?: string | null;
    }) => [
      eq.name,
      eq.make,
      eq.model,
      eq.serial_number,
      eq.serviceability,
      eq.specifications ?? "",
      eq.remarks ?? "",
    ]);
    downloadCsv(adminExportFilename("inventory"), buildCsv(headers, rows));
    toast.success(`${list.length} record${list.length !== 1 ? "s" : ""} exported.`);
  }

  const unitLabel = meta?.unit ? unitDisplayFromRecord(meta.unit).name : "";
  const headerPageTitle = meta
    ? `${unitLabel} \u2014 ${meta.cat?.name ?? "Equipment"}`
    : "Equipment";
  const showAntennaGallery = isAntennaCategory(categoryId, meta?.cat?.name);

  return (
    <AppShell
      title="Resource Inventory"
      pageTitle={headerPageTitle}
      headerIcon={<HomeNavIconBadge icon={Boxes} theme="inventory" size="md" />}
      showBack
      horizontalNav={null}
      actions={
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mono h-7 text-[10px] uppercase tracking-wider"
              onClick={() =>
                exportEquipment(
                  selectedIds.size > 0
                    ? items.filter((eq: { id: string }) => selectedIds.has(eq.id))
                    : items,
                )
              }
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Export
            </Button>
          )}
          {canEdit ? (
            <>
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
            <AddDetailsDialog
              items={items}
              unitId={unitId}
              onSaved={refresh}
              requirePhoto={showAntennaGallery}
            />
            </>
          ) : null}
        </div>
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
      ) : showAntennaGallery ? (
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
                    <ImageOff className="h-8 w-8 text-secondary-foreground" />
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
      ) : (
        <EquipmentTable
          items={items}
          unitId={unitId}
          categoryId={categoryId}
          canEdit={canEdit}
          selectedIds={selectedIds}
          onToggleSelect={(id) => setSelectedIds((prev) => toggleSelection(prev, id))}
        />
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

type EqItem = {
  id: string;
  name: string;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  serviceability?: string;
  remarks?: string | null;
  photo_url?: string | null;
  specifications?: string | null;
};

const EMPTY_FORM = {
  name: "",
  make: "",
  model: "",
  serial_number: "",
  serviceability: "Operational" as string,
  remarks: "",
};

function EquipmentTable({
  items,
  unitId,
  categoryId,
  canEdit,
  selectedIds,
  onToggleSelect,
}: {
  items: EqItem[];
  unitId: string;
  categoryId: string;
  canEdit: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="panel flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-secondary/40 backdrop-blur-sm border-b border-border text-secondary-foreground">
            <tr className="mono text-[9px] uppercase tracking-wide font-bold">
              {canEdit && <th className="px-2 py-2 w-8" />}
              <th className="px-2 py-2 w-10 text-center">#</th>
              <th className="px-2 py-2 text-left">Name</th>
              <th className="px-2 py-2 text-left">Make</th>
              <th className="px-2 py-2 text-left">Model</th>
              <th className="px-2 py-2 text-left">Serial</th>
              <th className="px-2 py-2 text-left">Specifications</th>
              <th className="px-2 py-2 text-center">Serviceability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {items.map((eq, idx) => {
              const checked = selectedIds.has(eq.id);
              return (
                <tr
                  key={eq.id}
                  className={`transition-colors hover:bg-primary/5 ${checked ? "bg-primary/5" : ""}`}
                >
                  {canEdit && (
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleSelect(eq.id)}
                        className="cursor-pointer accent-primary"
                      />
                    </td>
                  )}
                  <td className="px-2 py-2 mono text-[11px] text-center tabular-nums text-muted-foreground">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      to="/inventory/$unitId/$categoryId/$equipmentId"
                      params={{ unitId, categoryId, equipmentId: eq.id }}
                      className="mono text-[12px] font-bold uppercase text-foreground hover:text-primary transition-colors"
                    >
                      {eq.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 mono text-[11px] text-foreground/85">{eq.make || "—"}</td>
                  <td className="px-2 py-2 mono text-[11px] text-foreground/85">{eq.model || "—"}</td>
                  <td className="px-2 py-2 mono text-[11px] text-foreground/85">{eq.serial_number || "—"}</td>
                  <td className="px-2 py-2 mono text-[10px] text-muted-foreground max-w-[200px] truncate">
                    {eq.specifications || "—"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="inline-flex items-center gap-1.5 mono text-[10px] uppercase">
                      <span className={`status-dot ${statusClass(eq.serviceability)}`} />
                      {eq.serviceability ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 px-2.5 py-1 border-t border-border bg-secondary/10">
        <span className="mono text-[9px] uppercase tracking-wider text-foreground/80">
          {items.length} resource{items.length !== 1 ? "s" : ""} registered
        </span>
      </div>
    </div>
  );
}

function AddDetailsDialog({
  items,
  unitId,
  onSaved,
  requirePhoto = false,
}: {
  items: EqItem[];
  unitId: string;
  onSaved: () => void;
  requirePhoto?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const pendingItems = items.filter((i) => !i.photo_url);
  const completedCount = items.length - pendingItems.length;
  const photoQuota = requirePhoto ? getAntennaPhotoQuota(unitId) : null;

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
    if (requirePhoto && !photo) { toast.error("Photograph is required."); return; }

    setBusy(true);
    try {
      const itemHadPhoto = Boolean(items.find((i) => i.id === selectedId)?.photo_url);
      if (requirePhoto && photo && !canAddAntennaPhoto(unitId, itemHadPhoto)) {
        toast.error(antennaPhotoLimitMessage(unitId));
        return;
      }

      let photo_url: string | undefined;
      if (photo) {
        const previousPhoto = items.find((i) => i.id === selectedId)?.photo_url;
        photo_url = await uploadFile(photo, `equipment/${unitId}`);
        if (previousPhoto && previousPhoto !== photo_url) {
          deleteStoredFile(previousPhoto);
        }
      }
      const ok = updateOperationalEquipment(selectedId, {
        name: form.name.trim() || undefined,
        make: form.make.trim(),
        model: form.model.trim(),
        serial_number: form.serial_number.trim(),
        serviceability: form.serviceability as EqItem["serviceability"],
        remarks: form.remarks.trim() || null,
        ...(photo_url ? { photo_url } : {}),
      });
      if (!ok) throw new Error("Equipment not found.");
      const remaining = requirePhoto && !itemHadPhoto
        ? Math.max(0, pendingItems.length - 1)
        : pendingItems.length;
      toast.success(
        requirePhoto
          ? remaining > 0
            ? `Photo saved. ${remaining} antenna${remaining !== 1 ? "s" : ""} still need photographs.`
            : "All antenna photographs have been submitted."
          : "Details submitted.",
      );
      reset();
      onSaved();
      qc.invalidateQueries({ queryKey: ["eq-detail", selectedId] });
      if (remaining === 0 && requirePhoto) setOpen(false);
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
          {requirePhoto && photoQuota && (
            <p className="mono text-[10px] text-muted-foreground">
              {photoQuota.used} of {MAX_ANTENNA_IMAGES_PER_UNIT} antenna photographs saved for this unit.
            </p>
          )}
          {requirePhoto && completedCount > 0 && (
            <p className="mono text-[10px] text-muted-foreground">
              {completedCount} of {items.length} resource{items.length !== 1 ? "s" : ""} already have photographs.
            </p>
          )}

          <Field label="Choose Resource">
            <Select value={selectedId} onValueChange={handleSelectItem}>
              <SelectTrigger>
                <SelectValue placeholder={requirePhoto ? "Select antenna needing photograph" : "Select existing resource"} />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {items.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-muted-foreground mono">No resources available</div>
                ) : requirePhoto ? (
                  <>
                    {pendingItems.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          Needs photograph ({pendingItems.length})
                        </div>
                        {pendingItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                        ))}
                      </>
                    )}
                    {items.filter((i) => i.photo_url).length > 0 && (
                      <>
                        <div className="px-3 py-1.5 mono text-[9px] uppercase tracking-wider text-muted-foreground border-t border-border mt-1">
                          Already photographed
                        </div>
                        {items.filter((i) => i.photo_url).map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.name} (update)</SelectItem>
                        ))}
                      </>
                    )}
                  </>
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

              <Field label={requirePhoto ? "Photograph *" : "Photograph (optional)"}>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
                {requirePhoto && !photo && (
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
            disabled={busy || !selectedId || (requirePhoto && !photo)}
            className="w-full mono uppercase tracking-wider"
          >
            {busy
              ? "Submitting…"
              : requirePhoto && pendingItems.length > 1
                ? "Save & Next Antenna"
                : "Submit"}
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
