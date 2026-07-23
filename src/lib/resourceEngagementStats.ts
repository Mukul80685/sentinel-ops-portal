/**
 * Resource inventory ring stats for Resource Engagement unit detail view.
 * Engaged Resources table rows are the SSOT for allocation + ring percentages.
 */

import { NON_OPERATIONAL } from "@/lib/engagementEngine";
import {
  engagementTableRowKey,
  filterEngagementVisibleIntelRows,
  parseIntelReportIdFromRemarks,
} from "@/lib/engagementTableStore";
import { canonicalSatelliteKey, normalizeSatelliteName } from "@/lib/visibilityMatrix";

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

function parseOtherResourcesFromRemarks(remarks: string | null | undefined): string {
  if (!remarks) return "";
  const m = remarks.match(/OTHER_RESOURCES:([^|]+)/);
  return m?.[1]?.trim() ?? "";
}

function engagementKeyForSatelliteName(name: string): string {
  return canonicalSatelliteKey(name) || normalizeSatelliteName(name);
}

function engagementRowRichness(r: any): number {
  let score = 0;
  if (r.antenna_id) score += 2;
  if (r.demodulator_id) score += 2;
  if (r.processing_server_id) score += 2;
  if (r.remarks) {
    score += parseRemarkIdList(r.remarks, "LNA_IDS").length;
    score += parseRemarkIdList(r.remarks, "LNB_IDS").length;
    score += parseRemarkIdList(r.remarks, "DEMOD_IDS").length;
    score += parseRemarkIdList(r.remarks, "PROC_IDS").length;
    score += parseRemarkIdList(r.remarks, "OTHER_RESOURCE_IDS").length;
  }
  return score;
}

/** @deprecated Do not use for resource utilisation — collapses multiple detachments per satellite. */
export function buildEngagementBySatelliteMap(enrichedRows: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const r of enrichedRows) {
    const name = r.satellites?.name as string | undefined;
    if (!name) continue;
    const key = engagementKeyForSatelliteName(name);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, r);
      continue;
    }
    const rScore = engagementRowRichness(r);
    const eScore = engagementRowRichness(existing);
    if (rScore > eScore) {
      map.set(key, r);
      continue;
    }
    if (rScore === eScore) {
      const rTs = (r.updated_at as string) ?? "";
      const eTs = (existing.updated_at as string) ?? "";
      if (rTs >= eTs) map.set(key, r);
    }
  }
  return map;
}

function equipmentIdsFromRow(
  row: any,
  listKey: string,
  legacyKey: string,
  columnId?: string | null,
): string[] {
  const fromList = parseRemarkIdList(row.remarks, listKey);
  if (fromList.length) return fromList;
  const legacy = parseEquipmentIdFromRemarks(row.remarks, legacyKey);
  if (legacy) return [legacy];
  if (columnId) return [columnId];
  return [];
}

function legacyFrontEndIdsFromRow(row: any, equipment: any[]): { lnaIds: string[]; lnbIds: string[] } {
  const typeMatch = row.remarks?.match(/LNA\/LNB:(LNA|LNB)/);
  if (typeMatch?.[1] === "LNA") {
    const lnaEq = equipment.find(
      (e: any) => {
        const cat = (e.category?.name ?? "").toLowerCase();
        return (
          e.serviceability === "Operational" &&
          (cat === "lna" || (cat.includes("lna") && !cat.includes("lnb")))
        );
      },
    );
    return { lnaIds: lnaEq ? [lnaEq.id as string] : [], lnbIds: [] };
  }
  if (typeMatch?.[1] === "LNB") {
    const lnbEq = equipment.find(
      (e: any) =>
        e.serviceability === "Operational" &&
        (e.category?.name ?? "").toLowerCase().includes("lnb"),
    );
    return { lnaIds: [], lnbIds: lnbEq ? [lnbEq.id as string] : [] };
  }
  return { lnaIds: [], lnbIds: [] };
}

function otherResourceIdsFromRow(row: any, equipment: any[]): string[] {
  const fromRemarks = parseRemarkIdList(row.remarks, "OTHER_RESOURCE_IDS");
  if (fromRemarks.length) return fromRemarks;

  const otherText = parseOtherResourcesFromRemarks(row.remarks);
  if (!otherText) return [];

  const byName = new Map(equipment.map((e) => [e.name.trim().toLowerCase(), e.id as string]));
  return otherText
    .split(",")
    .map((part) => byName.get(part.trim().toLowerCase()))
    .filter(Boolean) as string[];
}

/** Per-category allocated ids — mirrors Engaged Resources table columns. */
export function collectCategoryAllocatedIds(
  activeRows: any[],
  equipment: any[] = [],
): Map<string, Set<string>> {
  const byLabel = new Map<string, Set<string>>();
  for (const { label } of RESOURCE_RING_CATEGORIES) {
    byLabel.set(label, new Set());
  }
  byLabel.set("Other Resources", new Set());

  for (const row of activeRows) {
    const antennaIds = row.antenna_id ? [row.antenna_id as string] : [];
    const lnaIds = equipmentIdsFromRow(row, "LNA_IDS", "LNA_ID");
    const lnbIds = equipmentIdsFromRow(row, "LNB_IDS", "LNB_ID");
    const legacyFrontEnd = legacyFrontEndIdsFromRow(row, equipment);
    const resolvedLnaIds = lnaIds.length ? lnaIds : legacyFrontEnd.lnaIds;
    const resolvedLnbIds = lnbIds.length ? lnbIds : legacyFrontEnd.lnbIds;
    const demodIds = equipmentIdsFromRow(row, "DEMOD_IDS", "DEMOD_ID", row.demodulator_id);
    const procIds = equipmentIdsFromRow(row, "PROC_IDS", "PROC_ID", row.processing_server_id);
    const otherIds = otherResourceIdsFromRow(row, equipment);

    for (const id of antennaIds) byLabel.get("Antennas")!.add(id);
    for (const id of resolvedLnaIds) byLabel.get("LNA")!.add(id);
    for (const id of resolvedLnbIds) byLabel.get("LNB")!.add(id);
    for (const id of demodIds) byLabel.get("Demodulators")!.add(id);
    for (const id of procIds) byLabel.get("Processors")!.add(id);
    for (const id of otherIds) byLabel.get("Other Resources")!.add(id);
  }

  return byLabel;
}

/** Collect allocated equipment ids from Engaged Resources table rows (columns + remark lists). */
export function collectEngagementAllocatedIds(activeRows: any[], equipment: any[] = []): Set<string> {
  const ids = new Set<string>();
  for (const set of collectCategoryAllocatedIds(activeRows, equipment).values()) {
    for (const id of set) ids.add(id);
  }
  return ids;
}

/** Equipment ids selected in an engagement edit form (all resource columns). */
export function collectFormAllocatedIds(form: {
  antenna_id?: string;
  lna_ids?: string[];
  lnb_ids?: string[];
  demodulator_ids?: string[];
  processing_server_ids?: string[];
  other_resource_ids?: string[];
}): Set<string> {
  const ids = new Set<string>();
  if (form.antenna_id) ids.add(form.antenna_id);
  for (const id of form.lna_ids ?? []) ids.add(id);
  for (const id of form.lnb_ids ?? []) ids.add(id);
  for (const id of form.demodulator_ids ?? []) ids.add(id);
  for (const id of form.processing_server_ids ?? []) ids.add(id);
  for (const id of form.other_resource_ids ?? []) ids.add(id);
  return ids;
}

/** @deprecated Use collectEngagementAllocatedIds — kept for callers passing raw engagement arrays. */
export function buildInventoryAllocatedIds(activeEngagements: any[], equipment: any[] = []): Set<string> {
  return collectEngagementAllocatedIds(activeEngagements, equipment);
}

function countIntelRowsForSatellite(
  intelMonitoringRows: { satelliteName: string }[],
  satelliteName: string,
): number {
  const key = engagementKeyForSatelliteName(satelliteName);
  return intelMonitoringRows.filter(
    (row) => engagementKeyForSatelliteName(row.satelliteName) === key,
  ).length;
}

function findOperationalEngagementForIntelRow(
  satRow: {
    reportId?: string;
    satelliteName: string;
    polarization?: string | null;
  },
  unitEngagements: any[],
  intelMonitoringRows: { satelliteName: string; reportId?: string }[],
): any | null {
  if (satRow.reportId) {
    const byReport = unitEngagements.find(
      (eng) => parseIntelReportIdFromRemarks(eng.remarks) === satRow.reportId,
    );
    if (byReport) return byReport;
  }

  if (countIntelRowsForSatellite(intelMonitoringRows, satRow.satelliteName) === 1) {
    const satKey = engagementKeyForSatelliteName(satRow.satelliteName);
    return (
      unitEngagements.find((eng) => {
        const name = eng.satellites?.name as string | undefined;
        return name && engagementKeyForSatelliteName(name) === satKey;
      }) ?? null
    );
  }

  return null;
}

/** Engaged Resources table rows — one row per INT scan report (satellite + polarization). */
export function buildIntelMonitoringEngagementRows(
  unitDbId: string,
  intelMonitoringRows: {
    satelliteName: string;
    polarization?: string | null;
    engagementStatus?: string | null;
    reportId?: string;
  }[],
  engagements: any[],
): any[] {
  const unitEngagements = engagements.filter((e) => e.unit_id === unitDbId);
  const result: any[] = [];

  for (const satRow of intelMonitoringRows) {
    const rowId = engagementTableRowKey(satRow);
    const matched = findOperationalEngagementForIntelRow(
      satRow,
      unitEngagements,
      intelMonitoringRows,
    );

    if (matched) {
      result.push({
        ...matched,
        id: rowId,
        satellites: { name: satRow.satelliteName },
        _intelRow: satRow,
      });
      continue;
    }

    result.push({
      id: rowId,
      satellites: { name: satRow.satelliteName },
      remarks: null,
      antenna_id: null,
      demodulator_id: null,
      processing_server_id: null,
      status: satRow.engagementStatus ?? "In Progress",
      _intelRow: satRow,
    });
  }

  return result;
}

/** Single engagement % formula — table rows → category rings → average. */
export function computeTableDrivenResourceEngagementPct(
  unitDbId: string,
  equipment: any[],
  intelMonitoringRows: { satelliteName: string; engagementStatus?: string | null }[],
  engagements: any[],
): number {
  const visibleRows = filterEngagementVisibleIntelRows(unitDbId, intelMonitoringRows);
  const unitEquipment = equipment.filter((e: any) => e.unit_id === unitDbId);
  const tableRows = buildIntelMonitoringEngagementRows(unitDbId, visibleRows, engagements);
  return averageResourceEngagementPct(buildResourceRingStats(unitEquipment, tableRows));
}

export function buildResourceRingStats(
  equipment: any[],
  activeRows: any[],
): ResourceRingStat[] {
  const categoryAllocated = collectCategoryAllocatedIds(activeRows, equipment);
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
    const allocatedInCategory = categoryAllocated.get(label) ?? new Set<string>();
    const activeAllocated = catEq.filter(
      (e: any) => e.serviceability === "Operational" && allocatedInCategory.has(e.id),
    ).length;
    // Unserviceable inventory is always engaged; table rows supply operational allocations.
    const engaged = faulty + activeAllocated;
    const pct = total === 0 ? 0 : Math.min(100, Math.round((engaged / total) * 100));
    return { label, total, faulty, engaged, pct };
  });

  const otherEq = equipment.filter(
    (e: any) => (e.category?.name ?? "").trim().toLowerCase() === "other resources",
  );
  const otherTotal = otherEq.length;
  const otherFaulty = otherEq.filter((e: any) => NON_OPERATIONAL.has(e.serviceability)).length;
  const otherAllocated = categoryAllocated.get("Other Resources") ?? new Set<string>();
  const otherActiveAllocated = otherEq.filter(
    (e: any) => e.serviceability === "Operational" && otherAllocated.has(e.id),
  ).length;
  const otherEngaged = otherFaulty + otherActiveAllocated;
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

/** Large engagement ring = average of all six category rings (always ÷6). */
export function averageResourceEngagementPct(stats: ResourceRingStat[]): number {
  if (stats.length === 0) return 0;
  return Math.round(stats.reduce((sum, s) => sum + s.pct, 0) / stats.length);
}

/** Same formula as Resource Engagement unit detail — table-driven ring average per unit. */
export function computeUnitResourceEngagementPct(
  unitId: string,
  equipment: any[],
  engagements: any[],
  intelMonitoringRows: { satelliteName: string; engagementStatus?: string | null }[] = [],
): number {
  return computeTableDrivenResourceEngagementPct(
    unitId,
    equipment,
    intelMonitoringRows,
    engagements,
  );
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
