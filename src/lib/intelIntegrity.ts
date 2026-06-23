/**
 * INT Repository data integrity — enforces Visibility Matrix + Engagement Status linkage.
 */
import type { BeamVisibilityEntry, IntelLinkageContext } from "@/lib/intelAnalysisData";
import { SATELLITE_BEAMS, getUnitIntelName } from "@/lib/intelAnalysisData";
import { computeSatelliteAnalysis } from "@/lib/engagementEngine";

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

/** Infer band from beam display name */
export function beamNameToBand(name: string): string | null {
  const n = name.toUpperCase();
  if (n.includes("C-BAND") || n.includes("C BAND")) return "C";
  if (n.includes("KU ") || n.startsWith("KU") || n.includes("K U")) return "KU";
  if (n.includes("KA ") || n.startsWith("KA")) return "KA";
  if (n.includes("SE ASIA") || n.includes("COVERAGE") || n.includes("FOOTPRINT") || n.includes("DTH")) {
    return null;
  }
  return null;
}

/** Visible bands for satellite — source: Visibility Matrix only */
export function getMatrixBandsForSatellite(satName: string, ctx: IntelLinkageContext): string[] {
  const pols = ctx.visibilityBySatName.get(satName) ?? [];
  const bands = new Set<string>();
  for (const p of pols) {
    if (p && p !== "—") bands.add(polarizationToBand(p));
  }
  return Array.from(bands);
}

/** Scan polarization — source: Engagement Status when active, else matrix primary pol */
export function resolveScanPolarizationFromEngagement(
  satName: string,
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
  const matrixPols = ctx.visibilityBySatName.get(satName) ?? [];
  if (matrixPols.length > 0) return matrixPols[0];
  return "—";
}

/**
 * Beam distribution — ONLY beams whose band matches Visibility Matrix for this unit.
 * Excludes mismatched band types (e.g. no C-band when matrix shows KU only).
 */
export function resolveBeamVisibilityFromMatrix(
  satName: string,
  unitId: string,
  ctx: IntelLinkageContext,
): { beams: BeamVisibilityEntry[]; filteredOut: string[] } {
  const unitName = getUnitIntelName(unitId);
  const visibleBands = getMatrixBandsForSatellite(satName, ctx);
  const allBeams = SATELLITE_BEAMS[satName] ?? ["Regional Beam 1", "Regional Beam 2"];
  const filteredOut: string[] = [];
  const beams: BeamVisibilityEntry[] = [];

  for (const name of allBeams) {
    const beamBand = beamNameToBand(name);
    if (beamBand && visibleBands.length > 0 && !visibleBands.includes(beamBand)) {
      filteredOut.push(name);
      continue;
    }
    beams.push({
      name,
      visibleToUnit: visibleBands.length > 0,
      label: visibleBands.length > 0
        ? `(Visible to ${unitName})`
        : "(Not in Visibility Matrix for this unit)",
    });
  }

  return { beams, filteredOut };
}

export function validateIntelReportIntegrity(
  satName: string,
  ctx: IntelLinkageContext,
  engagements: any[],
  scanPolarization: string,
  beamEntries: BeamVisibilityEntry[],
  filteredOutBeams: string[],
): IntelIntegrityResult {
  const warnings: string[] = [];
  const scanBand = scanPolarization !== "—" ? polarizationToBand(scanPolarization) : "";
  const matrixBands = getMatrixBandsForSatellite(satName, ctx);

  if (matrixBands.length === 0) {
    warnings.push("No visibility matrix entries for this satellite at the current unit.");
  }

  if (scanBand && matrixBands.length > 0 && !matrixBands.includes(scanBand)) {
    warnings.push(
      `Scan polarization ${scanPolarization} (${scanBand}-band) is not present in the Visibility Matrix (${matrixBands.join(", ")}).`,
    );
  }

  for (const beam of beamEntries) {
    const bb = beamNameToBand(beam.name);
    if (bb && scanBand && bb !== scanBand) {
      warnings.push(`Beam "${beam.name}" (${bb}-band) conflicts with active scan band ${scanBand}.`);
    }
  }

  if (filteredOutBeams.length > 0) {
    warnings.push(
      `${filteredOutBeams.length} beam(s) suppressed — band type not authorized in Visibility Matrix.`,
    );
  }

  const eng = ctx.engagementBySatName.get(satName);
  if (!eng && scanPolarization !== "—") {
    warnings.push("Scan polarization set without active Engagement Status allocation.");
  }

  return {
    valid: warnings.length === 0,
    warnings,
    scanPolarization,
    scanBand,
    matrixBands,
    beamMismatchFiltered: filteredOutBeams,
  };
}
