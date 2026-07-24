import type { ThurayaEquipmentProfile } from "@/lib/thurayaStore";

export type ThurayaEquipmentItem = {
  label: string;
  quantity: number;
};

const STANDARD_EQUIPMENT: ThurayaEquipmentItem[] = [
  { label: "L-band antenna", quantity: 1 },
  { label: "L-band demodulator", quantity: 1 },
  { label: "Decryption unit", quantity: 1 },
  { label: "Wideband receiver", quantity: 1 },
];

const DUAL_EQUIPMENT: ThurayaEquipmentItem[] = [
  { label: "L-band antenna", quantity: 2 },
  { label: "L-band demodulator", quantity: 2 },
  { label: "Decryption unit", quantity: 1 },
  { label: "Wideband receiver", quantity: 2 },
];

export function getThurayaEquipment(profile: ThurayaEquipmentProfile): ThurayaEquipmentItem[] {
  return profile === "dual" ? DUAL_EQUIPMENT : STANDARD_EQUIPMENT;
}

export function formatThurayaEquipmentLine(item: ThurayaEquipmentItem): string {
  return `${item.quantity}× ${item.label}`;
}
