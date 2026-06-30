/**
 * Cross-module operational sync — Visibility → Engagement → INT Repository → Live Status.
 * Visibility Matrix (via canUnitScanSatellite) is the eligibility foundation.
 */

import {
  computeSatelliteAnalysis,
  isActiveScanStatus,
  type ScanningSatellite,
  type UnitScanSnapshot,
} from "@/lib/engagementEngine";
import { computeUnitCapability } from "@/lib/liveEngagementModel";
import { canUnitScanSatellite } from "@/lib/intelIntegrity";
import { isSatelliteInIntRoster } from "@/lib/intelAnalysisData";
import { INT_UNITS } from "@/lib/intelRepository";

export type OperationalSyncIssueCode = "A" | "B" | "C" | "D" | "E";

export type OperationalSyncIssue = {
  code: OperationalSyncIssueCode;
  severity: "error" | "warning";
  message: string;
  unitDbId?: string;
  intUnitSlug?: string;
  satelliteName?: string;
  engagementId?: string;
};

/** Map Supabase unit row → INT slug (alpha … hotel) for visibility gates. */
export function resolveIntUnitSlug(
  dbUnitId: string,
  dbUnitCode?: string,
): string | null {
  const opSlot = dbUnitId.match(/^op-unit-([a-z]+)$/i);
  if (opSlot) return opSlot[1].toLowerCase();

  const normalizedCode = dbUnitCode?.replace(/^GATE[-\s]?/i, "").trim();
  if (normalizedCode) {
    const match = INT_UNITS.find((u) => u.code === normalizedCode);
    if (match) return match.id;
  }
  const direct = INT_UNITS.find((u) => u.id === dbUnitId);
  if (direct) return direct.id;
  return null;
}

/** Map INT slug → operational unit id (inverse of resolveIntUnitSlug). */
export function resolveOperationalUnitId(
  intUnitSlug: string,
  dbUnits: { id: string; code: string }[],
): string {
  const direct = dbUnits.find((d) => d.id === `op-unit-${intUnitSlug}`);
  if (direct) return direct.id;
  const viaCode = dbUnits.find((d) => resolveIntUnitSlug(d.id, d.code) === intUnitSlug);
  return viaCode?.id ?? intUnitSlug;
}

/** Rule 3 — INT generation metrics indicate completion. */
export function isIntGenerationComplete(
  scanned: number,
  analyzed: number,
  pending: number,
): boolean {
  return scanned > 0 && analyzed >= scanned && pending <= 0;
}

/**
 * Rule 2 / 3 — work is ongoing when metrics or status indicate incomplete analysis.
 * Auto-complete: when analyzed == scanned and pending == 0, work is NOT ongoing
 * even if engagement status is stale "In Progress".
 */
export function isIntGenerationInProgress(
  scanned: number,
  analyzed: number,
  pending: number,
  status: string,
): boolean {
  if (isIntGenerationComplete(scanned, analyzed, pending)) return false;
  if (analyzed < scanned) return true;
  if (pending > 0) return true;
  if (status === "In Progress" || status === "Paused") return true;
  return false;
}

/** Rule 1 + 2 — eligible for Live Engagement tile display. */
export function shouldShowOnLiveEngagement(
  satelliteName: string,
  intUnitSlug: string | null,
  scanned: number,
  analyzed: number,
  pending: number,
  status: string,
): boolean {
  if (intUnitSlug && !canUnitScanSatellite(satelliteName, intUnitSlug)) return false;
  return isIntGenerationInProgress(scanned, analyzed, pending, status);
}

/** Live Engagement snapshot — derived from constraint-validated UnitCapability. */
export function buildSyncedUnitScanSnapshot(
  engagements: any[],
  unitDbId: string,
  intUnitSlug: string | null,
  intelRows: any[] = [],
  equipment: any[] = [],
  unitCode?: string,
): UnitScanSnapshot {
  void intUnitSlug;
  const cap = computeUnitCapability(
    unitDbId,
    unitCode,
    engagements,
    equipment,
    intelRows,
  );
  return cap.snapshot;
}

/** Rule 5 — compact satellite list for unit tiles (e.g. "Apstar-7, Chinasat-12, +5"). */
export function formatLiveEngagementSatelliteLabel(
  satellites: ScanningSatellite[],
  maxNames = 2,
): { primary: string[]; overflow: number; label: string; total: number } {
  const total = satellites.length;
  const primary = satellites.slice(0, maxNames).map((s) => s.name);
  const overflow = Math.max(0, total - maxNames);
  const label =
    overflow > 0 ? `${primary.join(", ")}, +${overflow}` : primary.join(", ");
  return { primary, overflow, label, total };
}

/** Rule 4 — satellite belongs in INT Repository when visible and engaged or complete. */
export function shouldExistInIntRepository(
  satelliteName: string,
  intUnitSlug: string,
  scanned: number,
  analyzed: number,
  pending: number,
  status: string | null,
): boolean {
  if (!canUnitScanSatellite(satelliteName, intUnitSlug)) return false;
  if (isSatelliteInIntRoster(intUnitSlug, satelliteName)) return true;
  if (status && isActiveScanStatus(status)) return true;
  if (isIntGenerationInProgress(scanned, analyzed, pending, status ?? "")) return true;
  if (isIntGenerationComplete(scanned, analyzed, pending)) return true;
  return false;
}

/** Cross-module validation — Rules A–E from spec. */
export function validateOperationalSync(input: {
  engagements: any[];
  dbUnits: { id: string; code: string; name?: string }[];
  intelRows: any[];
}): OperationalSyncIssue[] {
  const issues: OperationalSyncIssue[] = [];
  const { engagements, dbUnits, intelRows } = input;

  for (const unit of dbUnits) {
    const intSlug = resolveIntUnitSlug(unit.id, unit.code);
    const unitEngs = engagements.filter((e) => e.unit_id === unit.id);

    for (const eng of unitEngs) {
      const satName = (eng.satellites?.name as string | undefined) ?? "Unassigned";
      const analysis = computeSatelliteAnalysis(eng, intelRows);
      const onLive = shouldShowOnLiveEngagement(
        satName,
        intSlug,
        analysis.scanned,
        analysis.analyzed,
        analysis.pending,
        eng.status as string,
      );

      if (intSlug && onLive && !canUnitScanSatellite(satName, intSlug)) {
        issues.push({
          code: "A",
          severity: "error",
          message: `Satellite on Live Engagement but not visible in Visibility Matrix.`,
          unitDbId: unit.id,
          intUnitSlug: intSlug,
          satelliteName: satName,
          engagementId: eng.id,
        });
      }

      if (
        onLive &&
        isIntGenerationComplete(analysis.scanned, analysis.analyzed, analysis.pending)
      ) {
        issues.push({
          code: "B",
          severity: "error",
          message: `Satellite marked complete but still on Live Engagement.`,
          unitDbId: unit.id,
          intUnitSlug: intSlug ?? undefined,
          satelliteName: satName,
          engagementId: eng.id,
        });
      }

      if (analysis.analyzed > analysis.scanned) {
        issues.push({
          code: "D",
          severity: "error",
          message: `Frequency counts inconsistent: analyzed (${analysis.analyzed}) > scanned (${analysis.scanned}).`,
          unitDbId: unit.id,
          intUnitSlug: intSlug ?? undefined,
          satelliteName: satName,
          engagementId: eng.id,
        });
      }

      if (
        intSlug &&
        isActiveScanStatus(eng.status as string) &&
        isIntGenerationInProgress(
          analysis.scanned,
          analysis.analyzed,
          analysis.pending,
          eng.status as string,
        ) &&
        canUnitScanSatellite(satName, intSlug) &&
        !isSatelliteInIntRoster(intSlug, satName) &&
        !shouldExistInIntRepository(
          satName,
          intSlug,
          analysis.scanned,
          analysis.analyzed,
          analysis.pending,
          eng.status as string,
        )
      ) {
        issues.push({
          code: "C",
          severity: "warning",
          message: `Active engagement missing from INT Repository roster.`,
          unitDbId: unit.id,
          intUnitSlug: intSlug,
          satelliteName: satName,
          engagementId: eng.id,
        });
      }
    }

    if (intSlug) {
      const visibleActive = unitEngs.filter((eng) => {
        const satName = eng.satellites?.name ?? "";
        const analysis = computeSatelliteAnalysis(eng, intelRows);
        return (
          canUnitScanSatellite(satName, intSlug) &&
          isIntGenerationInProgress(
            analysis.scanned,
            analysis.analyzed,
            analysis.pending,
            eng.status as string,
          )
        );
      });

      for (const eng of visibleActive) {
        const satName = eng.satellites?.name ?? "";
        if (!isSatelliteInIntRoster(intSlug, satName)) {
          issues.push({
            code: "C",
            severity: "warning",
            message: `Visible active engagement not represented in INT Repository.`,
            unitDbId: unit.id,
            intUnitSlug: intSlug,
            satelliteName: satName,
            engagementId: eng.id,
          });
        }
      }
    }
  }

  const seenEngIds = new Set(engagements.map((e) => e.id));
  for (const eng of engagements) {
    if (!eng.unit_id || !seenEngIds.has(eng.id)) continue;
    const unitExists = dbUnits.some((u) => u.id === eng.unit_id);
    if (!unitExists) {
      issues.push({
        code: "E",
        severity: "warning",
        message: `Orphan engagement record references unknown unit.`,
        unitDbId: eng.unit_id,
        engagementId: eng.id,
        satelliteName: eng.satellites?.name,
      });
    }
  }

  return issues;
}
