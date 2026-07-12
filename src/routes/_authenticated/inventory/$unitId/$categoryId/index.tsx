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
import { Boxes, ClipboardList, FileOutput, Trash2 } from "lucide-react";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { getUnitById, listCategories, listEquipmentForUnit, statusClass } from "@/lib/queries";
import { unitDisplayLabel } from "@/lib/operationalDataset";
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

const ANTENNA_BAND_OPTIONS = [
  "Unit modified",
  "C",
  "Ku",
  "Ka",
  "Ext C",
  "L",
  "S",
  "Composite",
] as const;

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
    const isAntenna = isAntennaCategory(categoryId, meta?.cat?.name);
    const specHeader = isAntenna ? "Band" : "Specifications";
    const headers = [
      "Name",
      "Make",
      "Model",
      "Serial Number",
      specHeader,
      "Serviceability",
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
      eq.specifications ?? "",
      eq.serviceability,
      eq.remarks ?? "",
    ]);
    downloadCsv(adminExportFilename("inventory"), buildCsv(headers, rows));
    toast.success(`${list.length} record${list.length !== 1 ? "s" : ""} exported.`);
  }

  const unitLabel = meta?.unit ? unitDisplayLabel(meta.unit) : "";
  const headerPageTitle = meta
    ? `${unitLabel} \u2014 ${meta.cat?.name ?? "Equipment"}`
    : "Equipment";
  const isAntenna = isAntennaCategory(categoryId, meta?.cat?.name);

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
              <FileOutput className="h-3.5 w-3.5 mr-1" />
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
            <AddDetailsDialog items={items} onSaved={refresh} />
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
      ) : (
        <EquipmentTable
          items={items}
          unitId={unitId}
          categoryId={categoryId}
          isAntenna={isAntenna}
          canEdit={canEdit}
          selectedIds={selectedIds}
          onToggleSelect={(id) => setSelectedIds((prev) => toggleSelection(prev, id))}
          onBandUpdated={refresh}
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
  isAntenna,
  canEdit,
  selectedIds,
  onToggleSelect,
  onBandUpdated,
}: {
  items: EqItem[];
  unitId: string;
  categoryId: string;
  isAntenna: boolean;
  canEdit: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onBandUpdated: () => void;
}) {
  const specColumnLabel = isAntenna ? "Band" : "Specifications";

  function updateBand(equipmentId: string, band: string) {
    if (!updateOperationalEquipment(equipmentId, { specifications: band })) {
      toast.error("Equipment not found.");
      return;
    }
    onBandUpdated();
  }

  return (
    <div className="panel flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-secondary border-b border-border text-secondary-foreground">
            <tr className="mono text-[9px] uppercase tracking-wide font-bold">
              {canEdit && <th className="px-2 py-2 w-8 bg-secondary" />}
              <th className="px-2 py-2 w-10 text-center bg-secondary">#</th>
              <th className="px-2 py-2 text-left bg-secondary">Name</th>
              <th className="px-2 py-2 text-left bg-secondary">Make</th>
              <th className="px-2 py-2 text-left bg-secondary">Model</th>
              <th className="px-2 py-2 text-left bg-secondary">Serial</th>
              <th className="px-2 py-2 text-left bg-secondary">{specColumnLabel}</th>
              <th className="px-2 py-2 text-center bg-secondary">Serviceability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {items.map((eq, idx) => {
              const checked = selectedIds.has(eq.id);
              const bandValue =
                eq.specifications &&
                (ANTENNA_BAND_OPTIONS as readonly string[]).includes(eq.specifications)
                  ? eq.specifications
                  : "";
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
                  <td className="px-2 py-2 max-w-[11rem]">
                    {isAntenna ? (
                      canEdit ? (
                        <Select
                          value={bandValue || undefined}
                          onValueChange={(v) => updateBand(eq.id, v)}
                        >
                          <SelectTrigger className="h-7 mono text-[10px] uppercase border-border bg-background">
                            <SelectValue placeholder="Select band" />
                          </SelectTrigger>
                          <SelectContent>
                            {ANTENNA_BAND_OPTIONS.map((band) => (
                              <SelectItem key={band} value={band} className="mono text-[11px]">
                                {band}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="mono text-[10px] text-foreground/85 uppercase">
                          {bandValue || eq.specifications || "—"}
                        </span>
                      )
                    ) : (
                      <span className="mono text-[10px] text-muted-foreground max-w-[200px] truncate block">
                        {eq.specifications || "—"}
                      </span>
                    )}
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
  onSaved,
}: {
  items: EqItem[];
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  function handleSelectItem(id: string) {
    setSelectedId(id);
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
    setForm(EMPTY_FORM);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) { toast.error("Please choose a resource."); return; }
    if (!form.make.trim()) { toast.error("Make is required."); return; }
    if (!form.model.trim()) { toast.error("Model is required."); return; }
    if (!form.serial_number.trim()) { toast.error("Serial number is required."); return; }

    setBusy(true);
    try {
      const ok = updateOperationalEquipment(selectedId, {
        name: form.name.trim() || undefined,
        make: form.make.trim(),
        model: form.model.trim(),
        serial_number: form.serial_number.trim(),
        serviceability: form.serviceability as EqItem["serviceability"],
        remarks: form.remarks.trim() || null,
      });
      if (!ok) throw new Error("Equipment not found.");
      toast.success("Details submitted.");
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
              <SelectContent className="max-h-64">
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
            disabled={busy || !selectedId}
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
