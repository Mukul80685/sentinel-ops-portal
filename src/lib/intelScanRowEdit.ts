/**

 * Inline row edit for Intelligence Inventory unit table — persists scan overrides

 * and cascades satellite renames to linked stores / operational data.

 */



import { deriveIntPendingFrequencies } from "@/lib/intelAnalysisData";
import { parseIntelImportDate } from "@/lib/intelScanStorage";
import {
  loadImportedRecords,

  saveImportedRecords,

} from "@/lib/intelRepository";

import { renameReportCellEdits } from "@/lib/intelCellStore";

import { migrateIntelFrequencyReportId } from "@/lib/intelFrequencyActions";

import { renameUnitEngagementForIntelReport } from "@/lib/operationalStore";

import {

  canonicalSatelliteKey,

  normalizeSatelliteName,

} from "@/lib/visibilityMatrix";

import {

  buildIntelReportId,

  loadSuppressedSatNamesList,

  normalizeScanPolarization,

  reportIdForOverride,

  saveScanOverrides,

  saveSuppressedSatNames,

  scanRowContentKey,

  overrideRowKey,

  type ScanReportOverride,

} from "@/lib/intelScanStorage";



export {

  buildIntelReportId,

  overrideRowKey,

  reportIdForOverride,

  scanRowContentKey,

  scanRowKey,

} from "@/lib/intelScanStorage";



export type IntelScanRowDraft = {

  satelliteName: string;

  polarization: string;

  totalScanned: string;

  analyzed: string;

  pending: string;

  productivity: string;

  updatedOn: string;

};



function namesMatch(a: string, b: string): boolean {

  return (

    normalizeSatelliteName(a) === normalizeSatelliteName(b) ||

    canonicalSatelliteKey(a) === canonicalSatelliteKey(b)

  );

}



export function parseIntelScanRowDraft(

  draft: IntelScanRowDraft,

  opts?: { preserveUpdatedOn?: string },

): { ok: true; override: ScanReportOverride } | { ok: false; error: string } {

  const satelliteName = draft.satelliteName.trim();

  if (!satelliteName) return { ok: false, error: "Satellite name is required." };

  const totalScanned = Math.max(0, parseInt(draft.totalScanned.replace(/\D/g, ""), 10) || 0);
  const analyzed = Math.max(0, parseInt(draft.analyzed.replace(/\D/g, ""), 10) || 0);

  return {

    ok: true,

    override: {

      satelliteName,

      polarization: draft.polarization.trim() || "—",

      totalScanned,

      analyzed,

      pending: deriveIntPendingFrequencies(totalScanned, analyzed),

      productivityScore: null,

      updatedOn: draft.updatedOn.trim()

        ? parseIntelImportDate(draft.updatedOn)

        : (opts?.preserveUpdatedOn ?? ""),

    },

  };

}



function setupStorageKey(reportId: string, satelliteName: string): string {

  return `intel-setup-${reportId}-${satelliteName.replace(/\s+/g, "-").toLowerCase()}`;

}



function migrateSetupProgress(

  oldReportId: string,

  oldSatelliteName: string,

  newReportId: string,

  newSatelliteName: string,

): void {

  if (typeof window === "undefined") return;

  const oldKey = setupStorageKey(oldReportId, oldSatelliteName);

  const raw = localStorage.getItem(oldKey);

  if (!raw) return;

  const newKey = setupStorageKey(newReportId, newSatelliteName);

  localStorage.setItem(newKey, raw);

  localStorage.removeItem(oldKey);

}



function renameImportedRecordsSatellite(

  intUnitSlug: string,

  oldName: string,

  newName: string,

  oldPolarization?: string,

): void {

  const records = loadImportedRecords(intUnitSlug);

  let changed = false;

  const scopedPol = oldPolarization ? normalizeScanPolarization(oldPolarization) : null;

  const next = records.map((r) => {

    if (!namesMatch(r.satellite, oldName)) return r;

    if (

      scopedPol &&

      normalizeScanPolarization(r.polarization) !== scopedPol

    ) {

      return r;

    }

    changed = true;

    return { ...r, satellite: newName };

  });

  if (changed) saveImportedRecords(intUnitSlug, next);

}



function renameSuppressedSatellite(

  intUnitSlug: string,

  unitCode: string | undefined,

  oldName: string,

  newName: string,

): string[] {

  const list = loadSuppressedSatNamesList(intUnitSlug, unitCode);

  let changed = false;

  const next = list.map((n) => {

    if (!namesMatch(n, oldName)) return n;

    changed = true;

    return newName;

  });

  if (changed) saveSuppressedSatNames(intUnitSlug, next, unitCode);

  return next;

}



function cascadeSatelliteRename(

  intUnitSlug: string,

  unitCode: string | undefined,

  dbUnitId: string,

  rowId: string,

  oldName: string,

  oldPolarization: string,

  newName: string,

  newPolarization: string,

): void {

  const oldReportId = buildIntelReportId(intUnitSlug, oldName, oldPolarization, rowId);

  const newReportId = buildIntelReportId(intUnitSlug, newName, newPolarization, rowId);



  renameImportedRecordsSatellite(intUnitSlug, oldName, newName, oldPolarization);

  renameReportCellEdits(oldReportId, newReportId, newName);

  migrateSetupProgress(oldReportId, oldName, newReportId, newName);

  migrateIntelFrequencyReportId(oldReportId, newReportId, newName);

  renameUnitEngagementForIntelReport(dbUnitId, oldReportId, newReportId, newName);

  renameSuppressedSatellite(intUnitSlug, unitCode, oldName, newName);

}



export function applyIntelScanRowEdit(opts: {

  intUnitSlug: string;

  unitCode?: string;

  dbUnitId: string;

  previousRowId: string;

  previousSatelliteName: string;

  previousPolarization: string;

  draft: IntelScanRowDraft;

  existingOverrides: ScanReportOverride[];

  otherOverrides: ScanReportOverride[];

}): {

  ok: true;

  overrides: ScanReportOverride[];

} | {

  ok: false;

  error: string;

} {

  const existing = opts.existingOverrides.find((o) => overrideRowKey(o) === opts.previousRowId);

  if (!existing?.rowId) {

    return { ok: false, error: "Could not locate the scan row to update." };

  }



  const parsed = parseIntelScanRowDraft(opts.draft);

  if (!parsed.ok) return parsed;



  const override: ScanReportOverride = { ...parsed.override, rowId: existing.rowId };

  const nextContentKey = scanRowContentKey(override);



  const duplicate = opts.otherOverrides.some((o) => scanRowContentKey(o) === nextContentKey);

  if (duplicate) {

    return {

      ok: false,

      error: "Another scan row with identical values already exists. Change at least one column to keep rows distinct.",

    };

  }



  const nameChanged = !namesMatch(opts.previousSatelliteName, override.satelliteName);

  const polChanged =

    opts.previousPolarization.trim().toLowerCase() !== override.polarization.trim().toLowerCase();



  if (nameChanged || polChanged) {

    cascadeSatelliteRename(

      opts.intUnitSlug,

      opts.unitCode,

      opts.dbUnitId,

      existing.rowId,

      opts.previousSatelliteName,

      opts.previousPolarization,

      override.satelliteName,

      override.polarization,

    );

  }



  const overrides = [...opts.existingOverrides];

  const idx = overrides.findIndex((o) => overrideRowKey(o) === opts.previousRowId);

  if (idx >= 0) {

    overrides[idx] = override;

  } else {

    overrides.push(override);

  }



  saveScanOverrides(opts.intUnitSlug, overrides, opts.unitCode);

  return { ok: true, overrides };

}


