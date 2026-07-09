import { getOperationalDataset } from "@/lib/operationalStore";

export const ANTENNA_CATEGORY_ID = "op-cat-antenna";
export const MAX_ANTENNA_IMAGES_PER_UNIT = 20;

export function isAntennaEquipment(
  equipment: { category_id?: string; category?: { name?: string } } | null | undefined,
): boolean {
  if (!equipment) return false;
  return (
    equipment.category_id === ANTENNA_CATEGORY_ID ||
    equipment.category?.name === "Antenna"
  );
}

export function countAntennaEquipmentForUnit(unitId: string): number {
  return getOperationalDataset().equipment.filter(
    (item) => item.unit_id === unitId && isAntennaEquipment(item),
  ).length;
}

export function countAntennaPhotosForUnit(unitId: string): number {
  return getOperationalDataset().equipment.filter(
    (item) =>
      item.unit_id === unitId &&
      isAntennaEquipment(item) &&
      Boolean(item.photo_url?.trim()),
  ).length;
}

export function getAntennaPhotoQuota(unitId: string): {
  used: number;
  max: number;
  remaining: number;
} {
  const used = countAntennaPhotosForUnit(unitId);
  return {
    used,
    max: MAX_ANTENNA_IMAGES_PER_UNIT,
    remaining: Math.max(0, MAX_ANTENNA_IMAGES_PER_UNIT - used),
  };
}

export function canAddAntennaEquipment(unitId: string): boolean {
  return countAntennaEquipmentForUnit(unitId) < MAX_ANTENNA_IMAGES_PER_UNIT;
}

export function canAddAntennaPhoto(unitId: string, replacingExisting: boolean): boolean {
  if (replacingExisting) return true;
  return countAntennaPhotosForUnit(unitId) < MAX_ANTENNA_IMAGES_PER_UNIT;
}

export function antennaPhotoLimitMessage(unitId: string): string {
  const { used, max } = getAntennaPhotoQuota(unitId);
  return `This unit already has ${used} of ${max} antenna photographs. Remove or replace an existing photo before adding another.`;
}

export function antennaEquipmentLimitMessage(unitId: string): string {
  const count = countAntennaEquipmentForUnit(unitId);
  return `This unit already has ${count} of ${MAX_ANTENNA_IMAGES_PER_UNIT} antennas. Delete an existing antenna before adding another.`;
}
