/**
 * Inline row edit for Intelligence Inventory unit table — persists scan overrides
 * and cascades satellite renames to linked stores / operational data.
 */

import {
  loadImportedRecords,
  saveImportedRecords,
} from "@/lib/intelRepository";
import { renameReportCellEdits } from "@/lib/intelCellStore";
import { migrateIntelFrequencyReportId } from "@/lib/intelFrequencyActions";
import { renameUnitEngagementSatelliteName } from "@/lib/operationalStore";
import {
  canonicalSatelliteKey,
  normalizeSatelliteName,
} from "@/lib/visibilityMatrix";
import {
  loadScanOverrides,
  loadSuppressedSatNamesList,
  saveScanOverrides,
  saveSuppressedSatNames,
  type ScanReportOverride,
} from "@/lib/intelScanStorage";

const EXCEL_EPOCH_MS = new Date(Date.UTC(1899, 11, 30)).getTime();
const MONTH_NAMES_LOWER = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type IntelScanRowDraft = {
  satelliteName: string;
  polarization: string;
  totalScanned: string;
  analyzed: string;
  pending: string;
  productivity: string;
  updatedOn: string;
};

export function buildIntelReportId(intUnitSlug: string, satelliteName: string): string {
  return `${intUnitSlug}__${satelliteName.replace(/\s+/g, "-")}`;
}

function namesMatch(a: string, b: string): boolean {
  return (
    normalizeSatelliteName(a) === normalizeSatelliteName(b) ||
    canonicalSatelliteKey(a) === canonicalSatelliteKey(b)
  );
}

function parseImportDate(raw: unknown): string {
  const fallback = new Date().toISOString().slice(0, 10);
  const numVal = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!isNaN(numVal) && numVal > 1 && numVal < 2_958_466) {
    const ms = EXCEL_EPOCH_MS + Math.round(numVal) * 86_400_000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const str = String(raw ?? "").trim();
  if (!str) return fallback;

  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  const namedMatch = str.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (namedMatch) {
    const [, d, mon, y] = namedMatch;
    const mIdx = MONTH_NAMES_LOWER.indexOf(mon.slice(0, 3).toLowerCase());
    if (mIdx !== -1) {
      const dt = new Date(Date.UTC(+y, mIdx, +d));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }

  const numericMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numericMatch) {
    let [, a, b, y] = numericMatch;
    if (y.length === 2) y = `20${y}`;
    const aNum = +a;
    const bNum = +b;
    if (aNum > 12) {
      const dt = new Date(Date.UTC(+y, bNum - 1, aNum));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    if (bNum > 12) {
      const dt = new Date(Date.UTC(+y, aNum - 1, bNum));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    const dt = new Date(Date.UTC(+y, aNum - 1, bNum));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) return fallbackDate.toISOString().slice(0, 10);
  return str;
}

export function parseIntelScanRowDraft(
  draft: IntelScanRowDraft,
): { ok: true; override: ScanReportOverride } | { ok: false; error: string } {
  const satelliteName = draft.satelliteName.trim();
  if (!satelliteName) return { ok: false, error: "Satellite name is required." };

  const productivityRaw = draft.productivity.trim();
  let productivityScore: number | null = null;
  if (productivityRaw && productivityRaw.toUpperCase() !== "N/A") {
    const v = parseFloat(productivityRaw.replace(/[^0-9.]/g, ""));
    if (isNaN(v)) return { ok: false, error: "Productivity must be a number or N/A." };
    productivityScore = Math.min(100, Math.max(0, v));
  }

  return {
    ok: true,
    override: {
      satelliteName,
      polarization: draft.polarization.trim() || "—",
      totalScanned: Math.max(0, parseInt(draft.totalScanned.replace(/\D/g, ""), 10) || 0),
      analyzed: Math.max(0, parseInt(draft.analyzed.replace(/\D/g, ""), 10) || 0),
      pending: Math.max(0, parseInt(draft.pending.replace(/\D/g, ""), 10) || 0),
      productivityScore,
      updatedOn: parseImportDate(draft.updatedOn),
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
): void {
  const records = loadImportedRecords(intUnitSlug);
  let changed = false;
  const next = records.map((r) => {
    if (!namesMatch(r.satellite, oldName)) return r;
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
  oldName: string,
  newName: string,
): void {
  const oldReportId = buildIntelReportId(intUnitSlug, oldName);
  const newReportId = buildIntelReportId(intUnitSlug, newName);

  renameImportedRecordsSatellite(intUnitSlug, oldName, newName);
  renameReportCellEdits(oldReportId, newReportId, newName);
  migrateSetupProgress(oldReportId, oldName, newReportId, newName);
  migrateIntelFrequencyReportId(oldReportId, newReportId, newName);
  renameUnitEngagementSatelliteName(dbUnitId, oldName, newName);
  renameSuppressedSatellite(intUnitSlug, unitCode, oldName, newName);
}

export function applyIntelScanRowEdit(opts: {
  intUnitSlug: string;
  unitCode?: string;
  dbUnitId: string;
  previousSatelliteName: string;
  draft: IntelScanRowDraft;
  existingOverrides: ScanReportOverride[];
  otherSatelliteNames: string[];
}): {
  ok: true;
  overrides: ScanReportOverride[];
} | {
  ok: false;
  error: string;
} {
  const parsed = parseIntelScanRowDraft(opts.draft);
  if (!parsed.ok) return parsed;

  const { override } = parsed;
  const prevKey = opts.previousSatelliteName.trim().toLowerCase();
  const nextKey = override.satelliteName.toLowerCase();

  const duplicate = opts.otherSatelliteNames.some(
    (n) => n.toLowerCase() === nextKey && n.toLowerCase() !== prevKey,
  );
  if (duplicate) {
    return { ok: false, error: `Another satellite named "${override.satelliteName}" already exists in this unit.` };
  }

  if (!namesMatch(opts.previousSatelliteName, override.satelliteName)) {
    cascadeSatelliteRename(
      opts.intUnitSlug,
      opts.unitCode,
      opts.dbUnitId,
      opts.previousSatelliteName,
      override.satelliteName,
    );
  }

  const overrides = [...opts.existingOverrides];
  const idx = overrides.findIndex((o) => o.satelliteName.toLowerCase() === prevKey);
  if (idx >= 0) {
    overrides[idx] = override;
  } else {
    overrides.push(override);
  }

  saveScanOverrides(opts.intUnitSlug, overrides, opts.unitCode);
  return { ok: true, overrides };
}
