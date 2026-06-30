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

/** Minimum fleet equipment rows — stale cached datasets below this are regenerated. */
const MIN_FLEET_EQUIPMENT = 300;

let _cache: OperationalDataset | null = null;

function isValidCachedDataset(parsed: OperationalDataset): boolean {
  return (
    parsed.version === OPERATIONAL_DATASET_VERSION &&
    parsed.units.length > 0 &&
    (parsed.equipment?.length ?? 0) >= MIN_FLEET_EQUIPMENT
  );
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
  persistOperationalDataset(ds);
  return true;
}

export function removeOperationalEquipment(equipmentId: string): boolean {
  const ds = getOperationalDataset();
  const before = ds.equipment.length;
  ds.equipment = ds.equipment.filter((e) => e.id !== equipmentId);
  if (ds.equipment.length === before) return false;
  persistOperationalDataset(ds);
  clearEquipmentAttachments(equipmentId);
  clearFaultDetailsForEquipment(equipmentId);
  return true;
}

function nextAvailableUnitSlot(units: OpUnit[]): UnitSlot {
  const used = new Set(units.map((u) => u.slot));
  return UNIT_SLOTS.find((slot) => !used.has(slot)) ?? "hotel";
}

export function addOperationalUnit(input: {
  code: string;
  name: string;
  description: string;
}): OpUnit {
  const ds = getOperationalDataset();
  const slot = nextAvailableUnitSlot(ds.units);
  const unit: OpUnit = {
    id: `op-unit-${Date.now()}`,
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description.trim() || null,
    slot,
  };
  ds.units.push(unit);
  persistOperationalDataset(ds);
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
  persistOperationalDataset(ds);
  for (const eqId of removedEqIds) {
    clearEquipmentAttachments(eqId);
    clearFaultDetailsForEquipment(eqId);
  }
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

  persistOperationalDataset(ds);
  return true;
}

export function removeOperationalEngagement(engagementId: string): boolean {
  const ds = getOperationalDataset();
  const before = ds.engagements.length;
  ds.engagements = ds.engagements.filter((e) => e.id !== engagementId);
  if (ds.engagements.length === before) return false;
  persistOperationalDataset(ds);
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
  persistOperationalDataset(ds);
  return eng;
}

export function getOperationalIntelRows(): OpIntelRow[] {
  return getOperationalDataset().intelRows ?? [];
}

export function removeOperationalIntelRows(ids: string[]): number {
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  const ds = getOperationalDataset();
  const before = (ds.intelRows ?? []).length;
  ds.intelRows = (ds.intelRows ?? []).filter((r) => !idSet.has(r.id));
  const removed = before - ds.intelRows.length;
  if (removed > 0) persistOperationalDataset(ds);
  return removed;
}

export { OPERATIONAL_STORE_EVENT };
