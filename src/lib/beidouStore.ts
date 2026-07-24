/**
 * Standalone BeiDou monitoring registry — localStorage only, no links to other modules.
 */

export const BEIDOU_EQUIPMENT_COLUMNS = ["Equipment", "Serial Number", "Serviceability"] as const;

export type BeidouEquipmentColumn = (typeof BEIDOU_EQUIPMENT_COLUMNS)[number];

export type BeidouEquipmentRow = {
  id: string;
  equipmentName: string;
  serialNumber: string;
  serviceability: string;
};

export type BeidouEquipmentDraft = Omit<BeidouEquipmentRow, "id">;

export type BeidouMessageType = {
  id: string;
  label: string;
};

const EQUIPMENT_KEY = "ssacc_beidou_equipment_v2";
const MESSAGES_KEY = "ssacc_beidou_message_types_v1";
export const BEIDOU_DATA_EVENT = "ssacc_beidou_data_change";

const DEFAULT_MESSAGE_LABELS = ["Type 6", "Type 16", "Type 24", "Type 31", "Type 48"];

function dispatchChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BEIDOU_DATA_EVENT));
}

function normalizeEquipmentRow(value: unknown): BeidouEquipmentRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;

  const equipmentName =
    typeof row.equipmentName === "string"
      ? row.equipmentName.trim()
      : typeof row.equipment === "string"
        ? row.equipment.trim()
        : "";
  if (!equipmentName) return null;

  const serialNumber =
    typeof row.serialNumber === "string" ? row.serialNumber.trim() : "";

  let serviceability = "";
  if (typeof row.serviceability === "string") {
    serviceability = row.serviceability.trim();
  } else if (typeof row.status === "string") {
    serviceability = row.status.trim();
  }

  return { id: row.id, equipmentName, serialNumber, serviceability };
}

function isValidMessageType(value: unknown): value is BeidouMessageType {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.label === "string";
}

export function isBeidouEquipmentServiceable(serviceability: string): boolean {
  const value = serviceability.trim().toLowerCase();
  if (!value) return false;
  if (value.includes("non") || value.includes("un") || value === "no" || value === "false") {
    return false;
  }
  return (
    value === "serviceable" ||
    value === "operational" ||
    value === "yes" ||
    value === "ok" ||
    value === "active"
  );
}

export function formatBeidouMessageTypeLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function listBeidouEquipment(): BeidouEquipmentRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EQUIPMENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEquipmentRow)
      .filter((row): row is BeidouEquipmentRow => row !== null);
  } catch {
    return [];
  }
}

function saveEquipment(rows: BeidouEquipmentRow[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(rows));
  dispatchChange();
}

export function replaceBeidouEquipment(rows: BeidouEquipmentRow[]): void {
  saveEquipment(rows);
}

export function updateBeidouEquipment(
  id: string,
  draft: BeidouEquipmentDraft,
): BeidouEquipmentRow | null {
  const name = draft.equipmentName.trim();
  if (!name) return null;

  const rows = listBeidouEquipment();
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) return null;

  const updated: BeidouEquipmentRow = {
    id,
    equipmentName: name,
    serialNumber: draft.serialNumber.trim(),
    serviceability: draft.serviceability.trim(),
  };
  const next = [...rows];
  next[index] = updated;
  saveEquipment(next);
  return updated;
}

export function deleteBeidouEquipment(id: string): boolean {
  const rows = listBeidouEquipment();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  saveEquipment(next);
  return true;
}

function seedDefaultMessageTypes(): BeidouMessageType[] {
  return DEFAULT_MESSAGE_LABELS.map((label) => ({
    id: crypto.randomUUID(),
    label,
  }));
}

export function listBeidouMessageTypes(): BeidouMessageType[] {
  if (typeof window === "undefined") return seedDefaultMessageTypes();
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) {
      const seeded = seedDefaultMessageTypes();
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = seedDefaultMessageTypes();
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return parsed.filter(isValidMessageType);
  } catch {
    return seedDefaultMessageTypes();
  }
}

function saveMessageTypes(rows: BeidouMessageType[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(rows));
  dispatchChange();
}

export function addBeidouMessageType(label: string): BeidouMessageType | null {
  const trimmed = formatBeidouMessageTypeLabel(label);
  if (!trimmed) return null;
  const created: BeidouMessageType = { id: crypto.randomUUID(), label: trimmed };
  saveMessageTypes([...listBeidouMessageTypes(), created]);
  return created;
}

export function updateBeidouMessageType(id: string, label: string): BeidouMessageType | null {
  const trimmed = formatBeidouMessageTypeLabel(label);
  if (!trimmed) return null;
  const rows = listBeidouMessageTypes();
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) return null;
  const updated = { ...rows[index], label: trimmed };
  const next = [...rows];
  next[index] = updated;
  saveMessageTypes(next);
  return updated;
}

export function deleteBeidouMessageType(id: string): boolean {
  const rows = listBeidouMessageTypes();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  saveMessageTypes(next);
  return true;
}
