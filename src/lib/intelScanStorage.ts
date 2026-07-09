/**
 * Shared Intel scan override / suppression storage — used by INT UI and dashboard derivation.
 */

import { deriveIntScanPhaseStatus } from "@/lib/intelAnalysisData";
import type { IntelSatelliteReportRow } from "@/lib/intelAnalysisData";
import {
  intelScanOverridesKey,
  intelStorageSlug,
  intelSuppressedSatsKey,
  readIntelLocalJson,
} from "@/lib/intelStorageKeys";

export type ScanReportOverride = {
  satelliteName: string;
  polarization: string;
  totalScanned: number;
  analyzed: number;
  pending: number;
  productivityScore: number | null;
  updatedOn: string;
};

export function loadScanOverrides(
  unitIdOrSlug: string,
  unitCode?: string,
): ScanReportOverride[] {
  const slug = intelStorageSlug(unitIdOrSlug, unitCode);
  return readIntelLocalJson<ScanReportOverride[]>(intelScanOverridesKey(slug), unitIdOrSlug) ?? [];
}

export function saveScanOverrides(
  unitIdOrSlug: string,
  overrides: ScanReportOverride[],
  unitCode?: string,
): void {
  if (typeof window === "undefined") return;
  const slug = intelStorageSlug(unitIdOrSlug, unitCode);
  localStorage.setItem(intelScanOverridesKey(slug), JSON.stringify(overrides));
}

export function loadSuppressedSatNames(
  unitIdOrSlug: string,
  unitCode?: string,
): Set<string> {
  const slug = intelStorageSlug(unitIdOrSlug, unitCode);
  const list =
    readIntelLocalJson<string[]>(intelSuppressedSatsKey(slug), unitIdOrSlug) ?? [];
  return new Set(list.map((n) => n.toLowerCase()));
}

export function loadSuppressedSatNamesList(
  unitIdOrSlug: string,
  unitCode?: string,
): string[] {
  const slug = intelStorageSlug(unitIdOrSlug, unitCode);
  return readIntelLocalJson<string[]>(intelSuppressedSatsKey(slug), unitIdOrSlug) ?? [];
}

export function saveSuppressedSatNames(
  unitIdOrSlug: string,
  names: string[],
  unitCode?: string,
): void {
  if (typeof window === "undefined") return;
  const slug = intelStorageSlug(unitIdOrSlug, unitCode);
  localStorage.setItem(intelSuppressedSatsKey(slug), JSON.stringify(names));
}

/** Apply scan overrides + suppressions — same merge rules as the INT unit page. */
export function mergeIntelSatelliteTableWithStorage(
  intUnitSlug: string,
  baseRows: IntelSatelliteReportRow[],
  unitCode?: string,
): IntelSatelliteReportRow[] {
  const scanOverrides = loadScanOverrides(intUnitSlug, unitCode);
  const suppressed = loadSuppressedSatNames(intUnitSlug, unitCode);

  let combined: IntelSatelliteReportRow[];

  if (scanOverrides.length === 0) {
    combined = baseRows;
  } else {
    const ovMap = new Map(scanOverrides.map((o) => [o.satelliteName.toLowerCase(), o]));
    const updatedExisting = baseRows.map((row) => {
      const ov = ovMap.get(row.satelliteName.toLowerCase());
      if (!ov) return row;
      const engagementStatus = deriveIntScanPhaseStatus(
        ov.totalScanned,
        ov.analyzed,
        ov.pending,
      );
      return {
        ...row,
        polarization: ov.polarization,
        totalScanned: ov.totalScanned,
        analyzed: ov.analyzed,
        pending: ov.pending,
        productivityScore: ov.productivityScore,
        reportTimestamp: ov.updatedOn,
        engagementStatus,
        processingStatus:
          ov.pending > 0 ? "Active Scanning" : row.processingStatus,
      };
    });

    const rosterNames = new Set(baseRows.map((r) => r.satelliteName.toLowerCase()));
    const extraRows: IntelSatelliteReportRow[] = scanOverrides
      .filter((o) => !rosterNames.has(o.satelliteName.toLowerCase()))
      .map((o) => {
        const engagementStatus = deriveIntScanPhaseStatus(
          o.totalScanned,
          o.analyzed,
          o.pending,
        );
        return {
          reportId: `${intUnitSlug}__${o.satelliteName.replace(/\s+/g, "-")}`,
          satelliteName: o.satelliteName,
          scanEligible: true,
          totalScanned: o.totalScanned,
          analyzed: o.analyzed,
          pending: o.pending,
          productivityScore: o.productivityScore,
          reportTimestamp: o.updatedOn,
          polarization: o.polarization,
          processingStatus: o.pending > 0 ? "Active Scanning" : "Analysis Complete",
          engagementStatus,
        };
      });

    combined = [...updatedExisting, ...extraRows];
  }

  return combined.filter((row) => !suppressed.has(row.satelliteName.toLowerCase()));
}
