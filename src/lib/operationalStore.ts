/**
 * Operational store — persisted SSOT used when Supabase has no seeded data.
 */

import {
  generateOperationalDataset,
  type OperationalDataset,
  type OpEngagement,
  type OpEquipment,
  type OpIntelRow,
  type OpUnit,
} from "@/lib/operationalDataset";
import { OPERATIONAL_DATASET_VERSION, OPERATIONAL_STORE_EVENT, OPERATIONAL_STORE_KEY } from "@/lib/operationalConstants";
import { UNIT_SLOTS, type UnitSlot } from "@/lib/priorityAllocation";
import { rebindUnitEngagementHardware } from "@/lib/engagementEngine";
import { deleteStoredFile } from "@/lib/storage";
import {
  antennaEquipmentLimitMessage,
  canAddAntennaEquipment,
} from "@/lib/inventoryAntennaLimits";

/** Minimum fleet equipment rows — stale cached datasets below this are regenerated. */
const MIN_FLEET_EQUIPMENT = 300;

let _cache: OperationalDataset | null = null;

function isValidCachedDataset(parsed: OperationalDataset): boolean {
  if (parsed.version !== OPERATIONAL_DATASET_VERSION) return false;
  // User-managed datasets are never auto-regenerated — regeneration would
  // resurrect units/equipment the user deliberately deleted.
  if (parsed.userManaged) return true;
  return parsed.units.length > 0 && (parsed.equipment?.length ?? 0) >= MIN_FLEET_EQUIPMENT;
}

export function getOperationalDataset(): OperationalDataset {
  if (_cache && isValidCachedDataset(_cache)) return _cache;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(OPERATIONAL_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OperationalDataset;
        if (isValidCachedDataset(parsed)) {
          _cache = parsed;
          return _cache;
        }
      }
    } catch { /* regenerate */ }
  }
  _cache = generateOperationalDataset();
  persistOperationalDataset(_cache);
  return _cache;
}

export function persistOperationalDataset(dataset: OperationalDataset): void {
  _cache = dataset;
  if (typeof window === "undefined") return;
  localStorage.setItem(OPERATIONAL_STORE_KEY, JSON.stringify(dataset));
  window.dispatchEvent(new Event(OPERATIONAL_STORE_EVENT));
}

/** Persist after a user-driven mutation — flags the dataset so it is never auto-regenerated. */
function persistUserMutation(dataset: OperationalDataset): void {
  dataset.userManaged = true;
  persistOperationalDataset(dataset);
}

export function resetOperationalDataset(): OperationalDataset {
  _cache = generateOperationalDataset();
  persistOperationalDataset(_cache);
  return _cache;
}

export function ensureOperationalDataset(): OperationalDataset {
  return getOperationalDataset();
}

export function isUsingOperationalStore(): boolean {
  return _cache !== null || (typeof window !== "undefined" && localStorage.getItem(OPERATIONAL_STORE_KEY) !== null);
}

export type OperationalEquipmentPatch = Partial<
  Pick<
    OpEquipment,
    | "name"
    | "make"
    | "model"
    | "serial_number"
    | "date_of_procurement"
    | "specifications"
    | "serviceability"
    | "remarks"
    | "photo_url"
  >
>;

export type NewOperationalEquipment = {
  unit_id: string;
  category_id: string;
  name: string;
  make?: string | null;
  model?: string | null;
  specifications?: string | null;
  remarks?: string | null;
  serviceability?: OpEquipment["serviceability"];
};

export function insertOperationalEquipment(input: NewOperationalEquipment): OpEquipment | null {
  const ds = getOperationalDataset();
  const unit = ds.units.find((u) => u.id === input.unit_id);
  const cat = ds.categories.find((c) => c.id === input.category_id);
  if (!unit || !cat) return null;

  if (cat.id === "op-cat-antenna" && !canAddAntennaEquipment(input.unit_id)) {
    throw new Error(antennaEquipmentLimitMessage(input.unit_id));
  }

  const seq =
    ds.equipment.filter((e) => e.unit_id === input.unit_id && e.category_id === input.category_id).length + 1;

  const eq: OpEquipment = {
    id: `op-eq-${unit.slot}-${cat.id}-${Date.now()}`,
    unit_id: input.unit_id,
    category_id: input.category_id,
    name: input.name.trim(),
    make: input.make?.trim() ?? "",
    model: input.model?.trim() ?? "",
    serial_number: `SN-${unit.code}-${cat.id.slice(-3)}-${String(seq).padStart(3, "0")}`,
    date_of_procurement: new Date().toISOString().slice(0, 10),
    specifications: input.specifications?.trim() ?? "",
    serviceability: input.serviceability ?? "Operational",
    remarks: input.remarks?.trim() ?? null,
    category: { id: cat.id, name: cat.name },
    units: { code: unit.code, name: unit.name },
  };

  ds.equipment.push(eq);
  persistUserMutation(ds);
  return eq;
}

export function getOperationalEquipmentById(equipmentId: string): OpEquipment | null {
  return getOperationalDataset().equipment.find((e) => e.id === equipmentId) ?? null;
}

export function updateOperationalEquipment(
  equipmentId: string,
  patch: OperationalEquipmentPatch,
): boolean {
  const ds = getOperationalDataset();
  const eq = ds.equipment.find((e) => e.id === equipmentId);
  if (!eq) return false;
  Object.assign(eq, patch);
  persistUserMutation(ds);
  return true;
}

export function removeOperationalEquipment(equipmentId: string): boolean {
  const ds = getOperationalDataset();
  const eq = ds.equipment.find((e) => e.id === equipmentId);
  const before = ds.equipment.length;
  ds.equipment = ds.equipment.filter((e) => e.id !== equipmentId);
  if (ds.equipment.length === before) return false;

  for (const engagement of ds.engagements) {
    if (engagement.antenna_id === equipmentId) engagement.antenna_id = null;
    if (engagement.demodulator_id === equipmentId) engagement.demodulator_id = null;
    if (engagement.processing_server_id === equipmentId) engagement.processing_server_id = null;
  }

  if (eq?.photo_url) deleteStoredFile(eq.photo_url);
  persistUserMutation(ds);
  clearEquipmentAttachments(equipmentId);
  clearFaultDetailsForEquipment(equipmentId);
  return true;
}

/**
 * Always generate a fresh unique slot for user-created units. Seed slots
 * (alpha…hotel) are NEVER reused: a new unit landing on a freed seed slot
 * would inherit the deleted seed unit's identity and seeded allocations.
 */
function nextAvailableUnitSlot(units: OpUnit[]): UnitSlot {
  const used = new Set<string>([...units.map((u) => u.slot), ...UNIT_SLOTS]);
  let slot: string;
  do {
    slot = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  } while (used.has(slot));
  return slot;
}

export function addOperationalUnit(input: {
  code?: string;
  name: string;
  description: string;
}): OpUnit {
  const ds = getOperationalDataset();
  const slot = nextAvailableUnitSlot(ds.units);
  const autoCode = `UNIT-${String(ds.units.length + 1).padStart(2, "0")}`;
  const unit: OpUnit = {
    // id embeds the slot so cross-module slug resolution (op-unit-<slot>) works.
    id: `op-unit-${slot}`,
    code: input.code?.trim() || autoCode,
    name: input.name.trim(),
    description: input.description.trim() || null,
    slot,
  };
  ds.units.push(unit);
  persistUserMutation(ds);
  return unit;
}

export function updateOperationalUnit(
  unitId: string,
  patch: { name?: string; description?: string | null },
): OpUnit | null {
  const ds = getOperationalDataset();
  const unit = ds.units.find((u) => u.id === unitId);
  if (!unit) return null;
  if (patch.name !== undefined) unit.name = patch.name.trim();
  if (patch.description !== undefined) {
    unit.description = patch.description?.trim() || null;
  }
  if (patch.name !== undefined) {
    for (const eq of ds.equipment) {
      if (eq.unit_id === unitId && eq.units) {
        eq.units.name = unit.name;
      }
    }
  }
  persistUserMutation(ds);
  return unit;
}

export function removeOperationalUnit(unitId: string): boolean {
  const ds = getOperationalDataset();
  const before = ds.units.length;
  const removedEqIds = ds.equipment.filter((e) => e.unit_id === unitId).map((e) => e.id);
  ds.units = ds.units.filter((u) => u.id !== unitId);
  ds.equipment = ds.equipment.filter((e) => e.unit_id !== unitId);
  ds.engagements = ds.engagements.filter((e) => e.unit_id !== unitId);
  ds.intelRows = (ds.intelRows ?? []).filter((r) => r.unit_id !== unitId);
  if (ds.units.length === before) return false;
  persistUserMutation(ds);
  for (const eqId of removedEqIds) {
    clearEquipmentAttachments(eqId);
    clearFaultDetailsForEquipment(eqId);
  }
  return true;
}

/**
 * @deprecated Prefer purgeUnitFromModule for feature-scoped deletes.
 * Full cascading delete — removes the unit from the global store AND every module.
 */
export function purgeUnitCompletely(unitId: string): boolean {
  const ds = getOperationalDataset();
  const unit = ds.units.find((u) => u.id === unitId);
  if (!unit) return false;
  const slot = unit.slot;

  // 1. Operational store: unit + equipment + engagements + intel rows + attachments/faults
  removeOperationalUnit(unitId);

  if (typeof window === "undefined") return true;

  // 2. Priority allocations + suppressed seed rows (keyed by slot)
  try {
    for (const key of ["ssacc_priority_user_allocations", "ssacc_priority_suppressed_sats", "ssacc_priority_p_overrides"]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (slot in parsed) {
        delete parsed[slot];
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    }
    window.dispatchEvent(new Event("ssacc_priority_allocation_change"));
  } catch { /* ignore */ }

  // 3. Visibility overlay — unit-scoped keys `${slot}::…` inside the overlay object
  try {
    const raw = localStorage.getItem("ssacc_visibility_overlay");
    if (raw) {
      const overlay = JSON.parse(raw) as {
        addedSats?: Record<string, unknown>;
        editedSats?: Record<string, unknown>;
      };
      let changed = false;
      for (const bucket of [overlay.addedSats, overlay.editedSats]) {
        if (!bucket) continue;
        for (const k of Object.keys(bucket)) {
          if (k.startsWith(`${slot}::`) || k.startsWith(`${unitId}::`)) {
            delete bucket[k];
            changed = true;
          }
        }
      }
      if (changed) {
        localStorage.setItem("ssacc_visibility_overlay", JSON.stringify(overlay));
        window.dispatchEvent(new Event("ssacc-visibility-overlay"));
      }
    }
  } catch { /* ignore */ }

  // 4. Intel module keys — prefixed by the unit slug (= slot)
  try {
    const prefixes = [
      `intel-repo-imports-${slot}`,
      `intel-sat-meta-${slot}-`,
      `intel-scan-overrides-${slot}`,
      `intel-setup-${slot}-`,
    ];
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefixes.some((p) => k === p || k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }

  // 5. Intel cell edits — report ids embed the unit slug
  try {
    const raw = localStorage.getItem("ssacc_intel_cell_edits");
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      let changed = false;
      for (const k of Object.keys(parsed)) {
        if (k.includes(slot)) {
          delete parsed[k];
          changed = true;
        }
      }
      if (changed) localStorage.setItem("ssacc_intel_cell_edits", JSON.stringify(parsed));
    }
  } catch { /* ignore */ }

  // 6. Intel frequency-action stores — arrays of entries referencing unitId/slug
  try {
    const freqKeys = [
      "ssacc_intel_freq_actions",
      "ssacc_intel_important_refs",
      "ssacc_intel_discarded_refs",
      "ssacc_intel_analysis_queue",
      "ssacc_intel_allocations",
      "ssacc_intel_integrity_overrides",
    ];
    for (const key of freqKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const next = parsed.filter(
          (e: any) => e?.unitId !== slot && e?.unitId !== unitId && e?.unit_id !== unitId,
        );
        if (next.length !== parsed.length) localStorage.setItem(key, JSON.stringify(next));
      }
    }
  } catch { /* ignore */ }

  return true;
}

const FAULT_DETAILS_KEY = "ssacc_fault_details";

export type FaultDetail = {
  id: string;
  equipment_id: string;
  date_raised: string;
  category: string | null;
  description: string | null;
  maintenance_remarks: string | null;
  estimated_restoration: string | null;
};

function loadFaultDetails(): FaultDetail[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAULT_DETAILS_KEY);
    return raw ? (JSON.parse(raw) as FaultDetail[]) : [];
  } catch {
    return [];
  }
}

function saveFaultDetails(rows: FaultDetail[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FAULT_DETAILS_KEY, JSON.stringify(rows));
}

export function listFaultDetailsForEquipment(equipmentId: string): FaultDetail[] {
  return loadFaultDetails()
    .filter((f) => f.equipment_id === equipmentId)
    .sort((a, b) => b.date_raised.localeCompare(a.date_raised));
}

export function insertFaultDetail(
  input: Omit<FaultDetail, "id">,
): FaultDetail {
  const row: FaultDetail = {
    id: `fault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...input,
  };
  saveFaultDetails([...loadFaultDetails(), row]);
  return row;
}

function clearFaultDetailsForEquipment(equipmentId: string): void {
  saveFaultDetails(loadFaultDetails().filter((f) => f.equipment_id !== equipmentId));
}

const EQUIPMENT_ATTACHMENTS_KEY = "ssacc_equipment_attachments";

export type EquipmentAttachment = {
  id: string;
  entity_type: "equipment";
  entity_id: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

function loadEquipmentAttachments(): EquipmentAttachment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EQUIPMENT_ATTACHMENTS_KEY);
    return raw ? (JSON.parse(raw) as EquipmentAttachment[]) : [];
  } catch {
    return [];
  }
}

function saveEquipmentAttachments(rows: EquipmentAttachment[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(EQUIPMENT_ATTACHMENTS_KEY, JSON.stringify(rows));
}

export function listEquipmentAttachments(equipmentId: string): EquipmentAttachment[] {
  return loadEquipmentAttachments()
    .filter((a) => a.entity_id === equipmentId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function insertEquipmentAttachment(
  input: Omit<EquipmentAttachment, "id" | "created_at" | "entity_type">,
): EquipmentAttachment {
  const row: EquipmentAttachment = {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entity_type: "equipment",
    created_at: new Date().toISOString(),
    ...input,
  };
  saveEquipmentAttachments([...loadEquipmentAttachments(), row]);
  return row;
}

export function removeEquipmentAttachment(attachmentId: string): boolean {
  const all = loadEquipmentAttachments();
  const next = all.filter((a) => a.id !== attachmentId);
  if (next.length === all.length) return false;
  saveEquipmentAttachments(next);
  return true;
}

function clearEquipmentAttachments(equipmentId: string): void {
  saveEquipmentAttachments(loadEquipmentAttachments().filter((a) => a.entity_id !== equipmentId));
}

export function getOperationalEngagements(): OpEngagement[] {
  return getOperationalDataset().engagements;
}

export type OperationalEngagementPatch = Partial<
  Pick<
    OpEngagement,
    | "satellite_id"
    | "status"
    | "observation_start"
    | "antenna_id"
    | "demodulator_id"
    | "processing_server_id"
    | "remarks"
  >
>;

export type NewOperationalEngagement = {
  unit_id: string;
  satellite_id: string;
  status: OpEngagement["status"];
  observation_start?: string | null;
  antenna_id?: string | null;
  demodulator_id?: string | null;
  processing_server_id?: string | null;
  remarks?: string | null;
};

export function updateOperationalEngagement(
  engagementId: string,
  patch: OperationalEngagementPatch,
): boolean {
  const ds = getOperationalDataset();
  const eng = ds.engagements.find((e) => e.id === engagementId);
  if (!eng) return false;

  if (patch.satellite_id !== undefined) {
    const sat = ds.satellites.find((s) => s.id === patch.satellite_id);
    if (!sat) return false;
    eng.satellite_id = patch.satellite_id;
    eng.satellites = { name: sat.name };
  }
  if (patch.status !== undefined) eng.status = patch.status;
  if (patch.observation_start !== undefined) {
    eng.observation_start = patch.observation_start ?? new Date().toISOString();
  }
  if (patch.antenna_id !== undefined) eng.antenna_id = patch.antenna_id;
  if (patch.demodulator_id !== undefined) eng.demodulator_id = patch.demodulator_id;
  if (patch.processing_server_id !== undefined) {
    eng.processing_server_id = patch.processing_server_id;
  }
  if (patch.remarks !== undefined) eng.remarks = patch.remarks ?? "";
  eng.updated_at = new Date().toISOString();

  persistUserMutation(ds);
  return true;
}

export function removeOperationalEngagement(engagementId: string): boolean {
  const ds = getOperationalDataset();
  const before = ds.engagements.length;
  ds.engagements = ds.engagements.filter((e) => e.id !== engagementId);
  if (ds.engagements.length === before) return false;
  persistUserMutation(ds);
  return true;
}

export function insertOperationalEngagement(input: NewOperationalEngagement): OpEngagement | null {
  const ds = getOperationalDataset();
  const sat = ds.satellites.find((s) => s.id === input.satellite_id);
  if (!sat) return null;

  const eng: OpEngagement = {
    id: `op-eng-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    unit_id: input.unit_id,
    satellite_id: input.satellite_id,
    status: input.status,
    observation_start: input.observation_start ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    antenna_id: input.antenna_id ?? null,
    demodulator_id: input.demodulator_id ?? null,
    processing_server_id: input.processing_server_id ?? null,
    remarks: input.remarks ?? "",
    satellites: { name: sat.name },
  };
  ds.engagements.push(eng);
  persistUserMutation(ds);
  return eng;
}

export function getOperationalIntelRows(): OpIntelRow[] {
  return getOperationalDataset().intelRows ?? [];
}

/** Rebind engagement hardware IDs to current unit inventory and persist when changed. */
export function rebindAndPersistUnitEngagements(unitDbId: string): number {
  const ds = getOperationalDataset();
  const rebound = rebindUnitEngagementHardware(
    unitDbId,
    ds.equipment,
    ds.engagements,
  );
  if (rebound > 0) persistUserMutation(ds);
  return rebound;
}

export function removeOperationalIntelRows(ids: string[]): number {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  const ds = getOperationalDataset();
  const before = (ds.intelRows ?? []).length;
  ds.intelRows = (ds.intelRows ?? []).filter((r) => !idSet.has(r.id));
  const removed = before - ds.intelRows.length;
  if (removed > 0) persistUserMutation(ds);
  return removed;
}

export { OPERATIONAL_STORE_EVENT };
