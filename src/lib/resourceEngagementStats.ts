/**
 * Resource inventory ring stats for Resource Engagement unit detail view.
 */

import { buildAllocatedIds, NON_OPERATIONAL, ACTIVE_SCAN_STATUSES } from "@/lib/engagementEngine";

export type ResourceRingStat = {
  label: string;
  total: number;
  faulty: number;
  engaged: number;
  pct: number;
};

/** Six inventory categories shown as engagement rings (Resource Inventory SSOT). */
export const RESOURCE_RING_CATEGORIES = [
  {
    label: "Antennas",
    matches: (name: string) => name.includes("antenna"),
  },
  {
    label: "LNA",
    matches: (name: string) => name === "lna" || (name.includes("lna") && !name.includes("lnb")),
  },
  {
    label: "LNB",
    matches: (name: string) => name.includes("lnb"),
  },
  {
    label: "Demodulators",
    matches: (name: string) => name.includes("demodulat"),
  },
  {
    label: "Processors",
    matches: (name: string) => name.includes("processing"),
  },
] as const;

function parseEquipmentIdFromRemarks(remarks: string | null | undefined, key: string): string | null {
  if (!remarks) return null;
  const m = remarks.match(new RegExp(`${key}:([^\\s|]+)`));
  return m?.[1]?.trim() || null;
}

function parseRemarkIdList(remarks: string | null | undefined, key: string): string[] {
  if (!remarks) return [];
  const m = remarks.match(new RegExp(`${key}:([^|]+)`));
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Include all equipment ids stored in engagement remarks (multi-select lists + legacy singles). */
export function buildInventoryAllocatedIds(activeEngagements: any[]): Set<string> {
  const ids = buildAllocatedIds(activeEngagements);
  for (const e of activeEngagements) {
    for (const id of parseRemarkIdList(e.remarks, "LNA_IDS")) ids.add(id);
    for (const id of parseRemarkIdList(e.remarks, "LNB_IDS")) ids.add(id);
    for (const id of parseRemarkIdList(e.remarks, "DEMOD_IDS")) ids.add(id);
    for (const id of parseRemarkIdList(e.remarks, "PROC_IDS")) ids.add(id);
    const lnaId = parseEquipmentIdFromRemarks(e.remarks, "LNA_ID");
    const lnbId = parseEquipmentIdFromRemarks(e.remarks, "LNB_ID");
    if (lnaId) ids.add(lnaId);
    if (lnbId) ids.add(lnbId);
  }
  return ids;
}

export function buildResourceRingStats(
  equipment: any[],
  allocatedIds: Set<string>,
): ResourceRingStat[] {
  const claimed = new Set<string>();
  const named: ResourceRingStat[] = RESOURCE_RING_CATEGORIES.map(({ label, matches }) => {
    const catEq = equipment.filter((e: any) => {
      if (claimed.has(e.id)) return false;
      const catName = (e.category?.name ?? "").toLowerCase();
      return matches(catName);
    });
    catEq.forEach((e: any) => claimed.add(e.id));

    const total = catEq.length;
    const faulty = catEq.filter((e: any) => NON_OPERATIONAL.has(e.serviceability)).length;
    const engaged = catEq.filter(
      (e: any) => e.serviceability === "Operational" && allocatedIds.has(e.id),
    ).length;
    const pct = total === 0 ? 0 : Math.min(100, Math.round((engaged / total) * 100));
    return { label, total, faulty, engaged, pct };
  });

  const otherEq = equipment.filter((e: any) => !claimed.has(e.id));
  const otherTotal = otherEq.length;
  const otherFaulty = otherEq.filter((e: any) => NON_OPERATIONAL.has(e.serviceability)).length;
  const otherEngaged = otherEq.filter(
    (e: any) => e.serviceability === "Operational" && allocatedIds.has(e.id),
  ).length;
  const otherPct =
    otherTotal === 0 ? 0 : Math.min(100, Math.round((otherEngaged / otherTotal) * 100));

  named.push({
    label: "Other Resources",
    total: otherTotal,
    faulty: otherFaulty,
    engaged: otherEngaged,
    pct: otherPct,
  });

  return named;
}

/** Large engagement ring = average of the six category rings (inventory with stock only). */
export function averageResourceEngagementPct(stats: ResourceRingStat[]): number {
  const withInventory = stats.filter((s) => s.total > 0);
  if (withInventory.length === 0) return 0;
  return Math.round(
    withInventory.reduce((sum, s) => sum + s.pct, 0) / withInventory.length,
  );
}

/** Same formula as Resource Engagement unit detail — inventory ring average per unit. */
export function computeUnitResourceEngagementPct(
  unitId: string,
  equipment: any[],
  engagements: any[],
): number {
  const unitEquipment = equipment.filter((e: any) => e.unit_id === unitId);
  const activeEngagements = engagements.filter(
    (e: any) => e.unit_id === unitId && ACTIVE_SCAN_STATUSES.has(e.status),
  );
  const allocatedIds = buildInventoryAllocatedIds(activeEngagements);
  return averageResourceEngagementPct(buildResourceRingStats(unitEquipment, allocatedIds));
}

export function equipmentNameById(equipment: any[], id: string | null | undefined): string {
  if (!id) return "—";
  const eq = equipment.find((e) => e.id === id);
  return eq?.name ?? "—";
}

export function resolveLnaLnbFromRow(
  row: any,
  equipment: any[],
): { lna: string; lnb: string } {
  const lnaId = parseEquipmentIdFromRemarks(row.remarks, "LNA_ID");
  const lnbId = parseEquipmentIdFromRemarks(row.remarks, "LNB_ID");

  if (lnaId || lnbId) {
    return {
      lna: equipmentNameById(equipment, lnaId),
      lnb: equipmentNameById(equipment, lnbId),
    };
  }

  const typeMatch = row.remarks?.match(/LNA\/LNB:(LNA|LNB)/);
  const type = typeMatch?.[1];
  if (type === "LNA") {
    const lnaEq = equipment.find(
      (e: any) =>
        (e.category?.name ?? "").toLowerCase() === "lna" &&
        e.serviceability === "Operational",
    );
    return { lna: lnaEq?.name ?? "LNA", lnb: "—" };
  }
  if (type === "LNB") {
    const lnbEq = equipment.find(
      (e: any) =>
        (e.category?.name ?? "").toLowerCase().includes("lnb") &&
        e.serviceability === "Operational",
    );
    return { lna: "—", lnb: lnbEq?.name ?? "LNB" };
  }

  return { lna: "—", lnb: "—" };
}

export function appendEquipmentMetaToRemarks(
  baseRemarks: string,
  lnaType: "LNA" | "LNB",
  demodType: string,
  lnaId?: string,
  lnbId?: string,
): string {
  const parts = [
    `LNA/LNB:${lnaType}`,
    lnaId ? `LNA_ID:${lnaId}` : null,
    lnbId ? `LNB_ID:${lnbId}` : null,
    `DEMOD_TYPE:${demodType}`,
    baseRemarks.trim(),
  ].filter(Boolean);
  return parts.join(" | ");
}

export { parseEquipmentIdFromRemarks };
