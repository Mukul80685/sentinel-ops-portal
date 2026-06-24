/**
 * INT Repository data integrity — consumes Visibility Matrix SSOT only.
 */
import type { BeamVisibilityEntry, IntelLinkageContext } from "@/lib/intelAnalysisData";
import { getUnitIntelName } from "@/lib/intelAnalysisData";
import { computeSatelliteAnalysis } from "@/lib/engagementEngine";
import {
  bandsFromVisibleBeams,
  resolveMatrixVisibility,
  type VisibilityMatrixSnapshot,
} from "@/lib/visibilityMatrix";

export type IntelIntegrityResult = {
  valid: boolean;
  warnings: string[];
  scanPolarization: string;
  scanBand: string;
  matrixBands: string[];
  beamMismatchFiltered: string[];
};

/** Map polarization code → primary band (KU, C, KA, …) */
export function polarizationToBand(pol: string): string {
  const u = pol.trim().toUpperCase();
  if (u.startsWith("KU")) return "KU";
  if (u.startsWith("KA")) return "KA";
  if (u.startsWith("C-") || u.startsWith("C ") || u === "C") return "C";
  if (u.startsWith("S-") || u.startsWith("S ")) return "S";
  if (u.startsWith("L-") || u.startsWith("L ")) return "L";
  const head = u.split("-")[0];
  return head || u;
}

/** Fetch visibility snapshot from master matrix (never compute locally). */
export function getMatrixSnapshot(
  satName: string,
  unitId: string,
): VisibilityMatrixSnapshot | null {
  return resolveMatrixVisibility(unitId, satName);
}

/** Visible bands — derived from matrix visible beams only. */
export function getMatrixBandsForSatellite(satName: string, unitId: string): string[] {
  const snap = getMatrixSnapshot(satName, unitId);
  if (!snap) return [];
  return bandsFromVisibleBeams(snap.beamsVisibleToUnit);
}

/** Scan polarization — Engagement when active, else primary band from matrix visible beams. */
export function resolveScanPolarizationFromEngagement(
  satName: string,
  unitId: string,
  ctx: IntelLinkageContext,
  engagements: any[],
): string {
  const eng = engagements.find((e) => e.satellites?.name === satName);
  if (eng) {
    const analysis = computeSatelliteAnalysis(eng, []);
    if (analysis.polarization && analysis.polarization !== "—") {
      return analysis.polarization;
    }
    const m = (eng.remarks as string | null)?.match(/POL:([\w-]+)/);
    if (m) return m[1];
  }
  const snap = getMatrixSnapshot(satName, unitId);
  if (snap && snap.beamsVisibleToUnit.length > 0) {
    const first = snap.beamsVisibleToUnit[0].toLowerCase();
    if (first.includes("ku")) return "KU-HH";
    if (first.includes("ka")) return "KA-HH";
    if (first.includes("c-band") || first.includes("c band")) return "C-HL";
  }
  void ctx;
  return "—";
}

/**
 * Beam panels for INT drill-down — inventory + visibility from Visibility Matrix SSOT.
 */
export function resolveBeamVisibilityFromMatrix(
  satName: string,
  unitId: string,
  _ctx: IntelLinkageContext,
): { beams: BeamVisibilityEntry[]; filteredOut: string[]; snapshot: VisibilityMatrixSnapshot | null } {
  const unitName = getUnitIntelName(unitId);
  const snap = getMatrixSnapshot(satName, unitId);

  if (!snap) {
    return { beams: [], filteredOut: [], snapshot: null };
  }

  const beams: BeamVisibilityEntry[] = [
    ...snap.beamInventory.map((name) => ({
      name,
      visibleToUnit: false,
      label: `(Inventory — ${name})`,
    })),
    ...snap.beamsVisibleToUnit.map((name) => ({
      name,
      visibleToUnit: true,
      label: `(Visible to ${unitName})`,
    })),
  ];

  const seen = new Set<string>();
  const deduped = beams.filter((b) => {
    if (seen.has(b.name)) return false;
    seen.add(b.name);
    return true;
  });

  return { beams: deduped, filteredOut: [], snapshot: snap };
}

/** SSOT — beam names visible to a unit (Visibility Matrix). */
export function getVisibleBeamNamesFromMatrix(
  satName: string,
  unitId: string,
  _ctx?: IntelLinkageContext,
): string[] {
  return getMatrixSnapshot(satName, unitId)?.beamsVisibleToUnit ?? [];
}

/** Hard gate: scan permitted only when matrix reports visible beams > 0. */
export function canUnitScanSatellite(
  satName: string,
  unitId: string,
  _ctx?: IntelLinkageContext,
): boolean {
  const snap = getMatrixSnapshot(satName, unitId);
  return snap?.canScan ?? false;
}

export function validateIntelReportIntegrity(
  satName: string,
  unitId: string,
  ctx: IntelLinkageContext,
  engagements: any[],
  scanPolarization: string,
  beamEntries: BeamVisibilityEntry[],
  filteredOutBeams: string[],
): IntelIntegrityResult {
  const warnings: string[] = [];
  const scanBand = scanPolarization !== "—" ? polarizationToBand(scanPolarization) : "";
  const matrixBands = getMatrixBandsForSatellite(satName, unitId);
  const snap = getMatrixSnapshot(satName, unitId);

  if (!snap) {
    warnings.push("Satellite not found in Visibility Matrix catalog.");
  } else if (snap.beamsVisibleToUnit.length === 0) {
    warnings.push("Zero beam visibility — scanning and INT ingestion blocked.");
  }

  if (scanBand && matrixBands.length > 0 && !matrixBands.includes(scanBand)) {
    warnings.push(
      `Scan polarization ${scanPolarization} (${scanBand}-band) is not authorized by visible matrix beams (${matrixBands.join(", ")}).`,
    );
  }

  if (filteredOutBeams.length > 0) {
    warnings.push(
      `${filteredOutBeams.length} beam(s) suppressed — not authorized in Visibility Matrix.`,
    );
  }

  const eng = ctx.engagementBySatName.get(satName);
  if (!eng && scanPolarization !== "—" && snap?.canScan) {
    warnings.push("Scan polarization set without active Engagement Status allocation.");
  }

  void beamEntries;
  return {
    valid: warnings.length === 0,
    warnings,
    scanPolarization,
    scanBand,
    matrixBands,
    beamMismatchFiltered: filteredOutBeams,
  };
}

/** Infer band from beam display name */
export function beamNameToBand(name: string): string | null {
  const n = name.toUpperCase();
  if (n.includes("C-BAND") || n.includes("C BAND")) return "C";
  if (n.includes("KU ") || n.startsWith("KU")) return "KU";
  if (n.includes("KA ") || n.startsWith("KA")) return "KA";
  return null;
}

/** Derive operational band from INT frequency ID (e.g. KU-HH-11750.00 MHz → KU). */
export function inferBandFromFrequencyId(frequencyId: string): string {
  const head = frequencyId.trim().split("-")[0];
  return polarizationToBand(head) || head.toUpperCase();
}

/** Visible matrix beams that carry the frequency's band for a unit. */
export function getVisibleBeamsForBand(
  satName: string,
  unitId: string,
  band: string,
): string[] {
  const snap = getMatrixSnapshot(satName, unitId);
  if (!snap) return [];
  const target = band.toUpperCase();
  return snap.beamsVisibleToUnit.filter((beam) => beamNameToBand(beam) === target);
}

/**
 * Allocation eligibility — all three visibility conditions via Visibility Matrix SSOT:
 * 1) satellite visible, 2) band-specific beam visible, 3) band operationally accessible.
 */
export function evaluateFrequencyAllocationEligibility(
  satName: string,
  unitId: string,
  frequencyId: string,
): { eligible: boolean; reason: string; matchingBeams: string[]; band: string } {
  const band = inferBandFromFrequencyId(frequencyId);
  const snap = getMatrixSnapshot(satName, unitId);

  if (!snap) {
    return { eligible: false, reason: "Satellite not in Visibility Matrix", matchingBeams: [], band };
  }
  if (!snap.canScan) {
    return { eligible: false, reason: "Satellite not visible to unit", matchingBeams: [], band };
  }

  const matchingBeams = getVisibleBeamsForBand(satName, unitId, band);
  if (matchingBeams.length === 0) {
    const visibleBands = bandsFromVisibleBeams(snap.beamsVisibleToUnit);
    return {
      eligible: false,
      reason: `${band}-band not accessible (unit sees ${visibleBands.join(", ") || "none"})`,
      matchingBeams: [],
      band,
    };
  }

  return {
    eligible: true,
    reason: `${band}-band via ${matchingBeams.join(", ")}`,
    matchingBeams,
    band,
  };
}

