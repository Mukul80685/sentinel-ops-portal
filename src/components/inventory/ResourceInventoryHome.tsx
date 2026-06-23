import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronDown,
  FolderOpen,
  PackagePlus,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { InventoryModuleNav } from "@/components/inventory/InventoryModuleNav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { listCategories, listUnits, type Unit } from "@/lib/queries";

// NATO phonetic names with preset operational locations
const UNIT_SLOTS = [
  { label: "Unit A", location: "New York" },
  { label: "Unit B", location: "London" },
  { label: "Unit C", location: "Melbourne" },
  { label: "Unit D", location: "Sydney" },
  { label: "Unit E", location: "Singapore" },
  { label: "Unit F", location: "Dubai" },
  { label: "Unit G", location: "Tokyo" },
  { label: "Unit H", location: "Frankfurt" },
] as const;

const RESOURCE_OPTIONS = [
  "Antenna", "LNA", "LNB", "Demodulators", "Processing Servers", "Other Resources",
] as const;

type ResourceDraft = { enabled: boolean; value: string };

// ── Add-Equipment dynamic form types ─────────────────────────────────────────
type EqDraft = {
  antennaSize: string;
  lnaType: string;
  lnbType: string;
  band: string;
  demoMode: string;
  make: string;
  model: string;
  specs: string;
  remarks: string;
  otherName: string;
};

const EMPTY_EQ_DRAFT: EqDraft = {
  antennaSize: "", lnaType: "", lnbType: "",
  band: "", demoMode: "", make: "", model: "",
  specs: "", remarks: "", otherName: "",
};

const BAND_OPTIONS = ["C", "Ku", "Ka", "Extended C-band"] as const;
const DEMO_MODES  = ["Narrowband", "Wideband", "DVB-S2", "DVB-S2X"] as const;

function isEqFormValid(cat: string, d: EqDraft): boolean {
  switch (cat) {
    case "Antenna":            return Boolean(d.antennaSize.trim() && d.band);
    case "LNA":                return Boolean(d.lnaType.trim()    && d.band);
    case "LNB":                return Boolean(d.lnbType.trim()    && d.band);
    case "Demodulators":       return Boolean(d.demoMode);
    case "Processing Servers": return Boolean(d.make.trim()       && d.model.trim());
    case "Other Resources":    return Boolean(d.otherName.trim());
    default:                   return false;
  }
}

function slotCode(index: number) {
  return `UNIT-${String.fromCharCode(65 + index)}`;
}

function buildSlots(units: Unit[]) {
  return UNIT_SLOTS.map((slot, index) => ({
    ...slot,
    index,
    unit: units[index] ?? null,
  }));
}

export function ResourceInventoryHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: units = [], isLoading } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const { data: categories = [] } = useQuery({ queryKey: ["cats"], queryFn: listCategories });

  const slots = useMemo(() => buildSlots(units), [units]);

  // ── Unit management ──────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ unit: Unit; label: string } | null>(null);

  const [unitName, setUnitName] = useState("");
  const [location, setLocation] = useState("");
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [resourceDrafts, setResourceDrafts] = useState<Record<string, ResourceDraft>>(() =>
    Object.fromEntries(RESOURCE_OPTIONS.map((n) => [n, { enabled: false, value: "" }])),
  );

  // ── Add equipment ────────────────────────────────────────────
  const [addEqTarget, setAddEqTarget] = useState<{ unit: Unit; label: string } | null>(null);
  const [eqCategory, setEqCategory] = useState("");
  const [eqDraft, setEqDraft] = useState<EqDraft>(EMPTY_EQ_DRAFT);

  const [submitting, setSubmitting] = useState(false);

  function resetAddUnitForm() {
    setUnitName("");
    setLocation("");
    setResourcesOpen(false);
    setResourceDrafts(
      Object.fromEntries(RESOURCE_OPTIONS.map((n) => [n, { enabled: false, value: "" }])),
    );
  }

  function resetAddEqForm() {
    setEqCategory("");
    setEqDraft(EMPTY_EQ_DRAFT);
  }

  function openAddUnit() {
    setAdvancedOpen(false);
    resetAddUnitForm();
    setAddUnitOpen(true);
  }

  function enableDeleteMode() {
    setAdvancedOpen(false);
    setDeleteMode(true);
  }

  async function handleAddUnit() {
    if (!unitName.trim() || !location.trim()) {
      toast.error("Unit Name and Location are required.");
      return;
    }
    if (units.length >= UNIT_SLOTS.length) {
      toast.error("All slots are assigned. Delete a unit first.");
      return;
    }
    const slotIndex = units.length;
    setSubmitting(true);
    try {
      const { data: created, error } = await supabase
        .from("units")
        .insert({ code: slotCode(slotIndex), name: unitName.trim(), description: location.trim() })
        .select("*")
        .single();
      if (error) throw error;

      const selected = RESOURCE_OPTIONS.filter((n) => resourceDrafts[n]?.enabled);
      if (selected.length > 0) {
        const rows = selected
          .map((n) => {
            const cat = categories.find((c) => c.name === n);
            const val = resourceDrafts[n]?.value.trim();
            if (!cat || !val) return null;
            return { unit_id: created.id, category_id: cat.id, name: val };
          })
          .filter(Boolean);
        if (rows.length > 0) {
          const { error: eqErr } = await supabase.from("equipment").insert(rows);
          if (eqErr) throw eqErr;
        }
      }

      await qc.invalidateQueries({ queryKey: ["units"] });
      toast.success(`${UNIT_SLOTS[slotIndex]?.label ?? "Unit"} registered.`);
      setAddUnitOpen(false);
      resetAddUnitForm();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add unit.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("units").delete().eq("id", pendingDelete.unit.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["units"] });
      toast.success(`${pendingDelete.label} removed.`);
      setPendingDelete(null);
      if (units.length <= 1) setDeleteMode(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete unit.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddEquipment() {
    if (!addEqTarget || !eqCategory) {
      toast.error("Please select a category.");
      return;
    }
    if (!isEqFormValid(eqCategory, eqDraft)) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const category = categories.find((c) => c.name === eqCategory);
    if (!category) { toast.error("Category not found."); return; }

    // Derive storable fields from category-specific draft
    let name = "";
    let make: string | null = null;
    let model: string | null = null;
    let specifications: string | null = null;
    let remarks: string | null = null;

    switch (eqCategory) {
      case "Antenna":
        name           = `Antenna ${eqDraft.antennaSize.trim()}`;
        specifications = `Band: ${eqDraft.band}`;
        remarks        = eqDraft.remarks.trim() || null;
        break;
      case "LNA":
        name           = `LNA — ${eqDraft.lnaType.trim()}`;
        specifications = `Band: ${eqDraft.band}`;
        remarks        = eqDraft.remarks.trim() || null;
        break;
      case "LNB":
        name           = `LNB — ${eqDraft.lnbType.trim()}`;
        specifications = `Band: ${eqDraft.band}`;
        remarks        = eqDraft.remarks.trim() || null;
        break;
      case "Demodulators":
        name           = `Demodulator (${eqDraft.demoMode})`;
        specifications = `Mode: ${eqDraft.demoMode}`;
        remarks        = eqDraft.remarks.trim() || null;
        break;
      case "Processing Servers":
        name           = `${eqDraft.make.trim()} ${eqDraft.model.trim()}`;
        make           = eqDraft.make.trim();
        model          = eqDraft.model.trim();
        specifications = eqDraft.specs.trim() || null;
        break;
      case "Other Resources":
        name           = eqDraft.otherName.trim();
        specifications = eqDraft.specs.trim() || null;
        remarks        = eqDraft.remarks.trim() || null;
        break;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("equipment").insert({
        unit_id: addEqTarget.unit.id,
        category_id: category.id,
        name,
        make,
        model,
        specifications,
        remarks,
      });
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["eq-counts", addEqTarget.unit.id] });
      await qc.invalidateQueries({ queryKey: ["eq", addEqTarget.unit.id] });

      toast.success("Equipment added successfully.");
      setAddEqTarget(null);
      resetAddEqForm();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add equipment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Resource Inventory"
      subtitle="Ground Station Equipment Registry"
      headerIcon={<Boxes className="h-4 w-4 shrink-0" />}
      horizontalNav={<InventoryModuleNav />}
    >
      {/* ── Unit tiles: 4 columns × 2 rows = 8 units ── */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading units…</p>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {slots.map((slot) => {
            const hasUnit = Boolean(slot.unit);
            return (
              <div key={slot.label} className="relative panel p-3 flex flex-col gap-2.5">
                {/* Delete X badge */}
                {deleteMode && hasUnit && slot.unit && (
                  <button
                    type="button"
                    aria-label={`Delete ${slot.label}`}
                    onClick={() => setPendingDelete({ unit: slot.unit!, label: slot.label })}
                    className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 rounded-full border border-border bg-card text-muted-foreground hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}

                {/* Unit identity */}
                <div className="flex items-start gap-2">
                  <div className="h-7 w-7 grid place-items-center rounded-sm border border-border bg-secondary text-foreground shrink-0 mt-0.5">
                    <Boxes className="h-3 w-3" />
                  </div>
                  <div className="flex-1">
                    <div className="mono text-xs font-bold uppercase tracking-tight leading-tight">
                      {slot.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {slot.location}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-1 pt-1.5 border-t border-border mt-auto">
                  <button
                    type="button"
                    disabled={!hasUnit}
                    onClick={() =>
                      slot.unit &&
                      navigate({ to: "/inventory/$unitId", params: { unitId: slot.unit.id } })
                    }
                    className="flex w-full items-center gap-1.5 px-2 py-1.5 mono text-[10px] uppercase tracking-wide rounded-sm border border-border bg-transparent hover:bg-secondary/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FolderOpen className="h-2.5 w-2.5 shrink-0" />
                    Open Inventory
                  </button>
                  <button
                    type="button"
                    disabled={!hasUnit}
                    onClick={() => {
                      if (slot.unit) {
                        setAddEqTarget({ unit: slot.unit, label: slot.label });
                        resetAddEqForm();
                      }
                    }}
                    className="flex w-full items-center gap-1.5 px-2 py-1.5 mono text-[10px] uppercase tracking-wide rounded-sm border border-border bg-transparent hover:bg-secondary/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <PackagePlus className="h-2.5 w-2.5 shrink-0" />
                    Add Equipment
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Advanced Features — bottom-right ── */}
      <div className="mt-4 flex items-center justify-end gap-2">
        {deleteMode && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setDeleteMode(false)}
          >
            Exit delete mode
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdvancedOpen(true)}
          className="gap-1.5"
        >
          <Settings2 className="h-4 w-4" />
          Advanced Features
        </Button>
      </div>

      {/* ══ MODALS ══ */}

      {/* Advanced Features */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advanced Features</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="justify-start" onClick={openAddUnit}>
              <Plus className="h-4 w-4 mr-2" /> Add Unit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={enableDeleteMode}
              disabled={units.length === 0}
            >
              <X className="h-4 w-4 mr-2" /> Delete Unit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Unit */}
      <Dialog
        open={addUnitOpen}
        onOpenChange={(open) => {
          setAddUnitOpen(open);
          if (!open) resetAddUnitForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unit-name">Unit Name</Label>
              <Input
                id="unit-name"
                required
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="Enter unit name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-location">Location</Label>
              <Input
                id="unit-location"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter location"
              />
            </div>
            <Collapsible open={resourcesOpen} onOpenChange={setResourcesOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between">
                  Add Resources
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${resourcesOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3 rounded-sm border border-border p-3">
                {RESOURCE_OPTIONS.map((name) => (
                  <div key={name} className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={resourceDrafts[name]?.enabled ?? false}
                        onChange={(e) =>
                          setResourceDrafts((p) => ({
                            ...p,
                            [name]: { ...p[name], enabled: e.target.checked },
                          }))
                        }
                        className="rounded border-border"
                      />
                      {name}
                    </label>
                    {resourceDrafts[name]?.enabled && (
                      <Input
                        value={resourceDrafts[name]?.value ?? ""}
                        onChange={(e) =>
                          setResourceDrafts((p) => ({
                            ...p,
                            [name]: { ...p[name], value: e.target.value },
                          }))
                        }
                        placeholder={`Assign ${name.toLowerCase()} value`}
                      />
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddUnitOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAddUnit} disabled={submitting}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Equipment — category-driven dynamic form */}
      <Dialog
        open={Boolean(addEqTarget)}
        onOpenChange={(open) => {
          if (!open) { setAddEqTarget(null); resetAddEqForm(); }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-baseline gap-2">
              Add Equipment
              {addEqTarget && (
                <span className="text-sm font-normal text-muted-foreground">
                  — {addEqTarget.label}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Step 1 — always visible: category picker */}
            <div className="space-y-2">
              <Label htmlFor="eq-category">Category</Label>
              <Select
                value={eqCategory}
                onValueChange={(v) => {
                  setEqCategory(v);
                  setEqDraft(EMPTY_EQ_DRAFT); // clear draft on category change
                }}
              >
                <SelectTrigger id="eq-category">
                  <SelectValue placeholder="Select equipment category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2 — dynamic fields based on selected category */}
            {eqCategory === "Antenna" && (
              <>
                <div className="space-y-2">
                  <Label>Antenna Size</Label>
                  <Input
                    value={eqDraft.antennaSize}
                    onChange={(e) => setEqDraft((p) => ({ ...p, antennaSize: e.target.value }))}
                    placeholder="e.g. 3.7 m, 4.5 m"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Band</Label>
                  <Select value={eqDraft.band} onValueChange={(v) => setEqDraft((p) => ({ ...p, band: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select band" /></SelectTrigger>
                    <SelectContent>
                      {BAND_OPTIONS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Remarks <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={eqDraft.remarks}
                    onChange={(e) => setEqDraft((p) => ({ ...p, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>
              </>
            )}

            {eqCategory === "LNA" && (
              <>
                <div className="space-y-2">
                  <Label>Type of LNA</Label>
                  <Input
                    value={eqDraft.lnaType}
                    onChange={(e) => setEqDraft((p) => ({ ...p, lnaType: e.target.value }))}
                    placeholder="e.g. Low Noise, High Gain"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Band</Label>
                  <Select value={eqDraft.band} onValueChange={(v) => setEqDraft((p) => ({ ...p, band: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select band" /></SelectTrigger>
                    <SelectContent>
                      {BAND_OPTIONS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Remarks <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={eqDraft.remarks}
                    onChange={(e) => setEqDraft((p) => ({ ...p, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>
              </>
            )}

            {eqCategory === "LNB" && (
              <>
                <div className="space-y-2">
                  <Label>Type of LNB</Label>
                  <Input
                    value={eqDraft.lnbType}
                    onChange={(e) => setEqDraft((p) => ({ ...p, lnbType: e.target.value }))}
                    placeholder="e.g. Universal LNB, Quad LNB"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Band</Label>
                  <Select value={eqDraft.band} onValueChange={(v) => setEqDraft((p) => ({ ...p, band: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select band" /></SelectTrigger>
                    <SelectContent>
                      {BAND_OPTIONS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Remarks <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={eqDraft.remarks}
                    onChange={(e) => setEqDraft((p) => ({ ...p, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>
              </>
            )}

            {eqCategory === "Demodulators" && (
              <>
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={eqDraft.demoMode} onValueChange={(v) => setEqDraft((p) => ({ ...p, demoMode: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                    <SelectContent>
                      {DEMO_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Remarks <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={eqDraft.remarks}
                    onChange={(e) => setEqDraft((p) => ({ ...p, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>
              </>
            )}

            {eqCategory === "Processing Servers" && (
              <>
                <div className="space-y-2">
                  <Label>Make</Label>
                  <Input
                    value={eqDraft.make}
                    onChange={(e) => setEqDraft((p) => ({ ...p, make: e.target.value }))}
                    placeholder="e.g. Dell, HP, Cisco"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input
                    value={eqDraft.model}
                    onChange={(e) => setEqDraft((p) => ({ ...p, model: e.target.value }))}
                    placeholder="e.g. PowerEdge R750"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Basic Technical Specifications <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Textarea
                    value={eqDraft.specs}
                    onChange={(e) => setEqDraft((p) => ({ ...p, specs: e.target.value }))}
                    placeholder="CPU, RAM, storage, NIC specs…"
                    rows={3}
                  />
                </div>
              </>
            )}

            {eqCategory === "Other Resources" && (
              <>
                <div className="space-y-2">
                  <Label>Equipment Name</Label>
                  <Input
                    value={eqDraft.otherName}
                    onChange={(e) => setEqDraft((p) => ({ ...p, otherName: e.target.value }))}
                    placeholder="Enter equipment name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Basic Technical Specifications <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Textarea
                    value={eqDraft.specs}
                    onChange={(e) => setEqDraft((p) => ({ ...p, specs: e.target.value }))}
                    placeholder="Technical specifications and details…"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Remarks <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={eqDraft.remarks}
                    onChange={(e) => setEqDraft((p) => ({ ...p, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setAddEqTarget(null); resetAddEqForm(); }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddEquipment}
              disabled={submitting || !eqCategory || !isEqFormValid(eqCategory, eqDraft)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Remove ${pendingDelete.label} (${pendingDelete.unit.name}) and all related inventory data? This cannot be undone.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={submitting}
              className="bg-muted text-muted-foreground hover:bg-muted/80 border border-border shadow-none"
            >
              YES
            </AlertDialogAction>
            <AlertDialogCancel className="bg-primary text-primary-foreground hover:bg-primary/90 border-0">
              NO
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
