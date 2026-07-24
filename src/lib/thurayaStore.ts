/**
 * Standalone Thuraya module — localStorage only, isolated from operational/admin units.
 */

export type ThurayaEquipmentProfile = "standard" | "dual";

export type ThurayaPanelPosition = {
  x: number;
  y: number;
};

export type ThurayaUnit = {
  id: string;
  name: string;
  imageDataUrl: string | null;
  equipmentProfile: ThurayaEquipmentProfile;
  tilePanelPosition: ThurayaPanelPosition;
  lightboxPanelPosition: ThurayaPanelPosition;
};

const STORAGE_KEY = "ssacc_thuraya_units_v1";
export const THURAYA_DATA_EVENT = "ssacc_thuraya_data_change";
export const THURAYA_MAX_IMAGE_BYTES = 100 * 1024;

const DEFAULT_PANEL: ThurayaPanelPosition = { x: 8, y: 32 };
const DEFAULT_LIGHTBOX_PANEL: ThurayaPanelPosition = { x: 10, y: 38 };

function dispatchChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(THURAYA_DATA_EVENT));
}

function isValidUnit(value: unknown): value is ThurayaUnit {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const tilePos = row.tilePanelPosition as ThurayaPanelPosition | undefined;
  const lightPos = row.lightboxPanelPosition as ThurayaPanelPosition | undefined;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    (row.imageDataUrl === null || typeof row.imageDataUrl === "string") &&
    (row.equipmentProfile === "standard" || row.equipmentProfile === "dual") &&
    !!tilePos &&
    typeof tilePos.x === "number" &&
    typeof tilePos.y === "number" &&
    !!lightPos &&
    typeof lightPos.x === "number" &&
    typeof lightPos.y === "number"
  );
}

function seedDefaultUnits(): ThurayaUnit[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `thuraya-unit-${index + 1}`,
    name: `Unit ${index + 1}`,
    imageDataUrl: null,
    equipmentProfile: index === 7 ? "dual" : "standard",
    tilePanelPosition: { ...DEFAULT_PANEL },
    lightboxPanelPosition: { ...DEFAULT_LIGHTBOX_PANEL },
  }));
}

export function listThurayaUnits(): ThurayaUnit[] {
  if (typeof window === "undefined") return seedDefaultUnits();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedDefaultUnits();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = seedDefaultUnits();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return parsed.filter(isValidUnit);
  } catch {
    return seedDefaultUnits();
  }
}

function saveUnits(units: ThurayaUnit[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(units));
  dispatchChange();
}

export function addThurayaUnit(name: string): ThurayaUnit | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const created: ThurayaUnit = {
    id: crypto.randomUUID(),
    name: trimmed,
    imageDataUrl: null,
    equipmentProfile: "standard",
    tilePanelPosition: { ...DEFAULT_PANEL },
    lightboxPanelPosition: { ...DEFAULT_LIGHTBOX_PANEL },
  };
  saveUnits([...listThurayaUnits(), created]);
  return created;
}

export function renameThurayaUnit(id: string, name: string): ThurayaUnit | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const units = listThurayaUnits();
  const index = units.findIndex((u) => u.id === id);
  if (index < 0) return null;
  const updated = { ...units[index], name: trimmed };
  const next = [...units];
  next[index] = updated;
  saveUnits(next);
  return updated;
}

export function deleteThurayaUnit(id: string): boolean {
  const units = listThurayaUnits();
  const next = units.filter((u) => u.id !== id);
  if (next.length === units.length) return false;
  saveUnits(next);
  return true;
}

export function setThurayaUnitImage(id: string, imageDataUrl: string | null): ThurayaUnit | null {
  const units = listThurayaUnits();
  const index = units.findIndex((u) => u.id === id);
  if (index < 0) return null;
  const updated = { ...units[index], imageDataUrl };
  const next = [...units];
  next[index] = updated;
  saveUnits(next);
  return updated;
}

export function setThurayaTilePanelPosition(
  id: string,
  position: ThurayaPanelPosition,
): ThurayaUnit | null {
  const units = listThurayaUnits();
  const index = units.findIndex((u) => u.id === id);
  if (index < 0) return null;
  const updated = { ...units[index], tilePanelPosition: clampPosition(position) };
  const next = [...units];
  next[index] = updated;
  saveUnits(next);
  return updated;
}

export function setThurayaLightboxPanelPosition(
  id: string,
  position: ThurayaPanelPosition,
): ThurayaUnit | null {
  const units = listThurayaUnits();
  const index = units.findIndex((u) => u.id === id);
  if (index < 0) return null;
  const updated = { ...units[index], lightboxPanelPosition: clampPosition(position) };
  const next = [...units];
  next[index] = updated;
  saveUnits(next);
  return updated;
}

function clampPosition(position: ThurayaPanelPosition): ThurayaPanelPosition {
  return {
    x: Math.min(85, Math.max(0, position.x)),
    y: Math.min(85, Math.max(0, position.y)),
  };
}

export async function readThurayaImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file (PNG, JPEG, or WebP).");
  }
  if (file.size > THURAYA_MAX_IMAGE_BYTES) {
    throw new Error("Image size should be less than 100 KB. Please reduce the size of the image.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the image file."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

export function getThurayaUnitById(id: string): ThurayaUnit | undefined {
  return listThurayaUnits().find((u) => u.id === id);
}
