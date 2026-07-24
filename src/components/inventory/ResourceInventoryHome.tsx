import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  FolderOpen,
  PackagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { UnitAdvancedFeatures } from "@/components/UnitAdvancedFeatures";
import { BackupRestore } from "@/components/BackupRestore";
import { useModuleUnits } from "@/hooks/useModuleUnits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { listAllEquipment, listCategories, type Unit } from "@/lib/queries";
import { insertOperationalEquipment } from "@/lib/operationalStore";
import {
  canAddAntennaEquipment,
  antennaEquipmentLimitMessage,
} from "@/lib/inventoryAntennaLimits";

// ── Add-Equipment dynamic form types ─────────────────────────────────────────
type EqDraft = {
  antennaSize: string;
  band: string;
  demoMode: string;
  specs: string;
  remarks: string;
  otherName: string;
};

const EMPTY_EQ_DRAFT: EqDraft = {
  antennaSize: "",
  band: "",
  demoMode: "",
  specs: "",
  remarks: "",
  otherName: "",
};

const BAND_OPTIONS = ["C", "Ku", "Ka", "Extended C-band"] as const;
const DEMO_MODES  = ["Narrowband", "Wideband", "DVB-S2", "DVB-S2X"] as const;

function isEqFormValid(cat: string, d: EqDraft): boolean {
  switch (cat) {
    case "Antenna":            return Boolean(d.antennaSize.trim() && d.band);
    case "Demodulators":       return Boolean(d.demoMode);
    case "Other Resources":    return Boolean(d.otherName.trim());
    default:                   return false;
  }
}

export function ResourceInventoryHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { units = [], isLoading } = useModuleUnits("inventory");
  const { data: categories = [] } = useQuery({ queryKey: ["cats"], queryFn: listCategories });
  const { data: allEquipment = [] } = useQuery({
    queryKey: ["inv-all-equipment"],
    queryFn: listAllEquipment,
  });

  const equipmentCountByUnit = new Map<string, number>();
  for (const eq of allEquipment as any[]) {
    equipmentCountByUnit.set(eq.unit_id, (equipmentCountByUnit.get(eq.unit_id) ?? 0) + 1);
  }

  // ── Add equipment ────────────────────────────────────────────
  const [addEqTarget, setAddEqTarget] = useState<{ unit: Unit; label: string } | null>(null);
  const [eqCategory, setEqCategory] = useState("");
  const [eqDraft, setEqDraft] = useState<EqDraft>(EMPTY_EQ_DRAFT);

  const [submitting, setSubmitting] = useState(false);

  function resetAddEqForm() {
    setEqCategory("");
    setEqDraft(EMPTY_EQ_DRAFT);
  }

  function handleAddEquipment() {
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

    if (eqCategory === "Antenna" && !canAddAntennaEquipment(addEqTarget.unit.id)) {
      toast.error(antennaEquipmentLimitMessage(addEqTarget.unit.id));
      return;
    }

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
      case "Demodulators":
        name           = `Demodulator (${eqDraft.demoMode})`;
        specifications = `Mode: ${eqDraft.demoMode}`;
        remarks        = eqDraft.remarks.trim() || null;
        break;
      case "Other Resources":
        name           = eqDraft.otherName.trim();
        specifications = eqDraft.specs.trim() || null;
        remarks        = eqDraft.remarks.trim() || null;
        break;
    }

    setSubmitting(true);
    try {
      const created = insertOperationalEquipment({
        unit_id: addEqTarget.unit.id,
        category_id: category.id,
        name,
        make,
        model,
        specifications,
        remarks,
      });
      if (!created) {
        toast.error("Failed to add equipment.");
        return;
      }

      void qc.invalidateQueries({ queryKey: ["eq-counts", addEqTarget.unit.id] });
      void qc.invalidateQueries({ queryKey: ["eq", addEqTarget.unit.id] });
      void qc.invalidateQueries({ queryKey: ["inv-all-equipment"] });

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
      headerIcon={<HomeNavIconBadge icon={Boxes} theme="inventory" size="md" />}
      horizontalNav={null}
      fillMain
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* ── Unit tiles — fill viewport; scroll when many units ── */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading units…</p>
          </div>
        ) : units.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              No units registered. Use Advanced Features → Add Unit to create one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 flex-1 min-h-0 auto-rows-fr overflow-y-auto">
            {units.map((unit) => {
            const eqCount = equipmentCountByUnit.get(unit.id) ?? 0;
            const hasEquipment = eqCount > 0;
            return (
              <div key={unit.id} className="relative panel p-3 flex flex-col gap-2.5 h-full min-h-[9rem]">
                {/* Unit identity — name + location only */}
                <div className="flex items-start gap-2">
                  <div className="h-7 w-7 grid place-items-center rounded-sm border border-border bg-muted text-foreground shrink-0 mt-0.5">
                    <Boxes className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="mono text-xs font-bold uppercase tracking-tight leading-tight truncate">
                      {unit.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {unit.description ?? "—"}
                    </div>
                  </div>
                </div>

                {/* Actions — new units show only Add Equipment; populated units show both */}
                <div className="flex flex-col gap-1 pt-1.5 border-t border-border mt-auto">
                  {hasEquipment && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ to: "/inventory/$unitId", params: { unitId: unit.id } })
                      }
                      className="flex w-full items-center gap-1.5 px-2 py-1.5 mono text-[10px] uppercase tracking-wide rounded-sm border border-border bg-transparent hover:bg-secondary/60 hover:text-secondary-foreground transition-colors"
                    >
                      <FolderOpen className="h-2.5 w-2.5 shrink-0" />
                      Open Inventory
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAddEqTarget({ unit, label: unit.name });
                      resetAddEqForm();
                    }}
                    className="flex w-full items-center gap-1.5 px-2 py-1.5 mono text-[10px] uppercase tracking-wide rounded-sm border border-border bg-transparent hover:bg-secondary/60 hover:text-secondary-foreground transition-colors"
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

        {/* ── Advanced Features — shared across all modules ── */}
        <div className="shrink-0">
          <UnitAdvancedFeatures scope="inventory" />
          <BackupRestore module="inventory" />
        </div>
      </div>

      {/* ══ MODALS ══ */}

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

    </AppShell>
  );
}
