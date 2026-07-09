/**
 * INT Repository — hierarchical analysis data, fake datasets, and cross-module linkage.
 */
import {
  isIntGenerationComplete,
  resolveOperationalUnitId,
} from "@/lib/operationalSync";
import { computeSatelliteAnalysis } from "@/lib/engagementEngine";
import {
  canUnitScanSatellite,
  getVisibleBeamNamesFromMatrix,
  resolveBeamVisibilityFromMatrix,
  resolveScanPolarizationFromEngagement,
  validateIntelReportIntegrity,
} from "@/lib/intelIntegrity";
import {
  resolveMatrixVisibility,
  isSatelliteVisibleToUnitInMatrix,
  buildVisibilityDeepLinkSearch,
  bandsFromVisibleBeams,
  normalizeSatelliteName,
  canonicalSatelliteKey,
  type GeoSatellite,
} from "@/lib/visibilityMatrix";
import { bandToPolarizations, INT_UNITS } from "@/lib/intelRepository";
import { findSatelliteInCatalog } from "@/lib/satelliteCatalog";
import { getOperationalDataset } from "@/lib/operationalStore";
import { loadScanOverrides } from "@/lib/intelScanStorage";
import { loadImportedRecords } from "@/lib/intelRepository";
import { intelStorageSlug } from "@/lib/intelStorageKeys";

export const OUTPUT_TYPES = ["voice", "packet", "image", "video", "location"] as const;

export const DETAILS_OF_INTERCEPTION = [
  "Voice COMINT — clear channel decode",
  "Packet capture / PCAP stored",
  "Image data extracted from transport stream",
  "Video stream demux successful",
  "Location/geo-fix extracted (hub / terminal / launch site)",
] as const;

export const NON_PRODUCTIVE_LEVELS = ["Modulation", "ECC", "Layer 2", "Layer 3", "Layer 4"] as const;

export const KNOWN_PROTOCOLS = [
  "DVB-S2", "DVB-S2X", "SCPC", "TCP/IP", "UDP", "AMBE+2", "MPEG-TS", "GSE-Lite",
] as const;

const NON_PRODUCTIVE_REMARKS: Record<(typeof NON_PRODUCTIVE_LEVELS)[number], string[]> = {
  Modulation: [
    "QPSK/8PSK identified; no further decode path available",
    "Modulation locked — payload layer inaccessible",
  ],
  ECC: [
    "Reed-Solomon decode partial; payload still encrypted",
    "FEC recovered framing only — content blocked",
  ],
  "Layer 2": [
    "MAC-layer frames observed without usable payload",
    "Only Layer 2 headers captured — no application data",
  ],
  "Layer 3": [
    "IP headers present; encrypted payload — no cleartext",
    "Routing/control packets only — no intelligence-bearing content",
  ],
  "Layer 4": [
    "Transport session established; payload not retrievable",
    "Application-layer handshake without decodable content",
  ],
};

export type VisibilitySatelliteProfile = {
  name: string;
  originCountry: string;
  launchDate: string;
  orbitalPosition: string;
  totalTransponders: string;
  beamDistributionSummary: string;
  defaultPolarization: string;
};

function inferDefaultPolarization(sat: GeoSatellite): string {
  const t = `${sat.transponders ?? ""} ${sat.kuBandTransponders ?? ""} ${sat.cBandTransponders ?? ""}`.toLowerCase();
  if (t.includes("ku") && t.includes("c")) return "KU-HH";
  if (t.includes("ku")) return "KU-HH";
  if (t.includes("c-band") || /\bc\b/.test(t)) return "C-HL";
  return "—";
}

/** Map Visibility Matrix GeoSatellite metadata → INT drill-down profile fields. */
export function geoSatelliteToVisibilityProfile(
  sat: GeoSatellite,
  countryOfOrigin: string,
): VisibilitySatelliteProfile {
  const beamParts = [
    sat.orbitType,
    sat.beamCoverage,
    sat.beams?.length ? sat.beams.join(" · ") : null,
  ].filter(Boolean);
  return {
    name: sat.name,
    originCountry: countryOfOrigin || "—",
    launchDate: sat.launchDate || "—",
    orbitalPosition: sat.position || "—",
    totalTransponders: sat.transponders || "—",
    beamDistributionSummary: beamParts.join(" · ") || "—",
    defaultPolarization: inferDefaultPolarization(sat),
  };
}

/**
 * Resolve satellite details for INT drill-down — legacy mock profiles first,
 * then Satellite Visibility Matrix catalog (base + overlay, unit-scoped).
 */
export function resolveSatelliteProfile(
  satelliteName: string,
  unitId?: string,
): VisibilitySatelliteProfile {
  const legacy = VISIBILITY_SATELLITE_PROFILES[satelliteName];
  if (legacy) return legacy;

  const legacyKey = Object.keys(VISIBILITY_SATELLITE_PROFILES).find((k) =>
    normalizeSatelliteName(k) === normalizeSatelliteName(satelliteName) ||
    canonicalSatelliteKey(k) === canonicalSatelliteKey(satelliteName),
  );
  if (legacyKey) return VISIBILITY_SATELLITE_PROFILES[legacyKey];

  const catalogRow = findSatelliteInCatalog(satelliteName, unitId);
  if (catalogRow) {
    return geoSatelliteToVisibilityProfile(catalogRow.satellite, catalogRow.countryOfOrigin);
  }

  return {
    name: satelliteName,
    originCountry: "—",
    launchDate: "—",
    orbitalPosition: "—",
    totalTransponders: "—",
    beamDistributionSummary: "—",
    defaultPolarization: "—",
  };
}

export type ScanSummarySeed = {
  polarization?: string;
  totalScanned?: number;
  analyzed?: number;
  pending?: number;
  updatedOn?: string;
};

/** Apply scan-report table values onto a drill-down report (summary row → detail view). */
export function enrichDrillDownFromScanSeed(
  report: IntelDrillDownReport,
  seed?: ScanSummarySeed,
): IntelDrillDownReport {
  if (!seed) return report;
  const pol =
    seed.polarization && seed.polarization !== "—"
      ? seed.polarization
      : report.scanSummary.polarization;
  return {
    ...report,
    baseProfile: resolveSatelliteProfile(report.satelliteName, report.unitId),
    scanSummary: {
      ...report.scanSummary,
      polarization: pol,
      totalScanned: seed.totalScanned ?? report.scanSummary.totalScanned,
      analyzed: seed.analyzed ?? report.scanSummary.analyzed,
      pending: seed.pending ?? report.scanSummary.pending,
    },
  };
}

export const VISIBILITY_SATELLITE_PROFILES: Record<string, VisibilitySatelliteProfile> = {
  "ChinaSat 6B": {
    name: "ChinaSat 6B", originCountry: "China", launchDate: "2007-07-05",
    orbitalPosition: "105.5°E", totalTransponders: "38 C/Ku-band",
    beamDistributionSummary: "4 regional Ku beams · 2 C-band footprints · Asia-Pacific coverage",
    defaultPolarization: "KU-HH",
  },
  "Apstar 7": {
    name: "Apstar 7", originCountry: "China / Hong Kong", launchDate: "2014-03-18",
    orbitalPosition: "76.5°E", totalTransponders: "28 C/Ku-band",
    beamDistributionSummary: "3 Ku spot beams · 1 C-band regional · South Asia footprint",
    defaultPolarization: "KU-VL",
  },
  "PAKSAT-1R": {
    name: "PAKSAT-1R", originCountry: "Pakistan", launchDate: "2011-08-11",
    orbitalPosition: "38.0°E", totalTransponders: "30 Ku-band",
    beamDistributionSummary: "2 Ku beams · Pakistan / Middle East coverage",
    defaultPolarization: "KU-HH",
  },
  "Measat-3a": {
    name: "Measat-3a", originCountry: "Malaysia", launchDate: "2009-06-21",
    orbitalPosition: "91.5°E", totalTransponders: "24 Ku/C-band",
    beamDistributionSummary: "3 Ku regional beams · SE Asia / Indian Ocean",
    defaultPolarization: "KU-HV",
  },
  "Arabsat 6A": {
    name: "Arabsat 6A", originCountry: "Saudi Arabia", launchDate: "2019-04-11",
    orbitalPosition: "30.5°E", totalTransponders: "45 Ku-band HTS",
    beamDistributionSummary: "6 Ka/Ku spot beams · MENA wide beam",
    defaultPolarization: "C-HL",
  },
  "ChinaSat 10": {
    name: "ChinaSat 10", originCountry: "China", launchDate: "2011-06-21",
    orbitalPosition: "110.5°E", totalTransponders: "30 Ku/C-band",
    beamDistributionSummary: "5 Ku beams · 2 C-band · East Asia coverage",
    defaultPolarization: "KU-HH",
  },
  "AsiaSat 7": {
    name: "AsiaSat 7", originCountry: "Hong Kong", launchDate: "2011-11-21",
    orbitalPosition: "105.5°E", totalTransponders: "28 C/Ku-band",
    beamDistributionSummary: "4 Ku beams · Asia / Middle East relay",
    defaultPolarization: "KU-VL",
  },
  "Turksat 4A": {
    name: "Turksat 4A", originCountry: "Turkey", launchDate: "2014-02-14",
    orbitalPosition: "42.0°E", totalTransponders: "32 Ku-band",
    beamDistributionSummary: "3 Ku spot · 1 regional · Europe / MENA",
    defaultPolarization: "KU-HH",
  },
  "Eutelsat 7B": {
    name: "Eutelsat 7B", originCountry: "France", launchDate: "2013-05-14",
    orbitalPosition: "7.0°E", totalTransponders: "40 Ku-band",
    beamDistributionSummary: "5 Ku beams · Sub-Saharan Africa / Europe",
    defaultPolarization: "KU-VL",
  },
  "Yamal 601": {
    name: "Yamal 601", originCountry: "Russia", launchDate: "2016-05-30",
    orbitalPosition: "49.0°E", totalTransponders: "36 C/Ku-band",
    beamDistributionSummary: "3 C-band · 4 Ku beams · Russia / CIS",
    defaultPolarization: "C-HL",
  },
  "ChinaSat 12": {
    name: "ChinaSat 12", originCountry: "China", launchDate: "2012-05-26",
    orbitalPosition: "87.5°E", totalTransponders: "32 C/Ku-band",
    beamDistributionSummary: "4 Ku beams · Indian Ocean / Africa footprint",
    defaultPolarization: "KU-HH",
  },
  "Bangabandhu-1": {
    name: "Bangabandhu-1", originCountry: "Bangladesh", launchDate: "2018-05-11",
    orbitalPosition: "119.1°E", totalTransponders: "26 Ku-band",
    beamDistributionSummary: "2 Ku spot beams · South Asia DTH",
    defaultPolarization: "KU-HV",
  },
  "Thaicom 8": {
    name: "Thaicom 8", originCountry: "Thailand", launchDate: "2014-05-27",
    orbitalPosition: "78.5°E", totalTransponders: "24 Ku-band",
    beamDistributionSummary: "3 Ku beams · SE Asia coverage",
    defaultPolarization: "KU-VL",
  },
  "Nilesat 201": {
    name: "Nilesat 201", originCountry: "Egypt", launchDate: "2010-08-04",
    orbitalPosition: "7.0°W", totalTransponders: "28 Ku-band",
    beamDistributionSummary: "2 wide Ku beams · North Africa / Middle East DTH",
    defaultPolarization: "KU-HH",
  },
};

export const UNIT_SATELLITE_ROSTER: Record<string, string[]> = {
  alpha:   ["ChinaSat 6B", "Apstar 7", "PAKSAT-1R", "Measat-3a", "Arabsat 6A"],
  bravo:   ["ChinaSat 10", "AsiaSat 7", "Turksat 4A", "Eutelsat 7B", "Yamal 601"],
  charlie: ["ChinaSat 12", "PAKSAT-1R", "Bangabandhu-1", "Thaicom 8", "Nilesat 201"],
};

export const INTEL_MOCK_UNIT_IDS = new Set(["alpha", "bravo", "charlie"]);

export function hasIntelData(intUnitSlug: string, dbUnitId?: string): boolean {
  const slug = intelStorageSlug(intUnitSlug);
  if (INTEL_MOCK_UNIT_IDS.has(slug)) return true;
  if (UNIT_SATELLITE_ROSTER[slug]) return true;
  if (loadScanOverrides(slug).length > 0) return true;
  if (loadImportedRecords(slug).length > 0) return true;

  if (dbUnitId) {
    const ds = getOperationalDataset();
    if ((ds.intelRows ?? []).some((r) => r.unit_id === dbUnitId)) return true;
    if (ds.engagements.some((e) => e.unit_id === dbUnitId)) return true;
  }

  return false;
}

/** True when satellite appears in this unit's INT Repository roster. */
export function isSatelliteInIntRoster(unitId: string, satelliteName: string): boolean {
  if (!hasIntelData(unitId)) return false;
  const roster = UNIT_SATELLITE_ROSTER[unitId];
  if (!roster) return false;
  const norm = satelliteName.trim().toLowerCase();
  return roster.some((s) => s.toLowerCase() === norm);
}

/**
 * INT ↔ Visibility cross-link eligibility:
 * roster INT exists, satellite is cataloged in Visibility Matrix, and unit has visible beams.
 */
export function hasIntVisibilityCrossLink(unitId: string, satelliteName: string): boolean {
  if (!isSatelliteInIntRoster(unitId, satelliteName)) return false;
  return isSatelliteVisibleToUnitInMatrix(unitId, satelliteName);
}

/** Scan phase from frequency metrics — pending zero means fully analyzed. */
export function deriveIntScanPhaseStatus(
  scanned: number,
  analyzed: number,
  pending: number,
): "Completed" | "In Progress" | null {
  if (scanned <= 0) return null;
  if (pending <= 0) return "Completed";
  return "In Progress";
}

export type IntScanLookupEntry = {
  pending: number;
  scanned: number;
  activelyScanning: boolean;
};

/** Per-satellite scan metrics for INT ↔ Visibility Matrix cross-link badges. */
export function buildIntScanLookupForUnit(
  unitId: string,
  engagements: any[],
  intelRows: any[],
  equipment: any[],
  dbUnits: { id: string; code?: string }[],
): Map<string, IntScanLookupEntry> {
  if (!hasIntelData(unitId)) return new Map();

  const dbUnitId = resolveOperationalUnitId(unitId, dbUnits);
  const unitEngagements = engagements.filter((e: any) => e.unit_id === dbUnitId);
  const unitEquipment = equipment.filter((e: any) => e.unit_id === dbUnitId);
  const unitIntel = intelRows.filter((r: any) => r.unit_id === dbUnitId);
  const visibilityRows = buildIntelLinkageVisibilityRows(unitId, dbUnitId, unitEngagements);
  const ctx = buildIntelLinkageContext(
    unitId,
    unitEngagements,
    visibilityRows,
    unitEquipment,
    unitIntel,
  );
  const rows = buildIntelSatelliteTable(unitId, ctx, unitEngagements);
  const map = new Map<string, IntScanLookupEntry>();

  for (const row of rows) {
    if (!row.scanEligible || row.totalScanned <= 0) continue;
    map.set(normalizeSatelliteName(row.satelliteName), {
      pending: row.pending,
      scanned: row.totalScanned,
      activelyScanning: row.pending > 0,
    });
  }

  return map;
}

export { buildVisibilityDeepLinkSearch };

export function intelReportIdForSatellite(unitId: string, satelliteName: string): string {
  return `${unitId}__${satelliteName.replace(/\s+/g, "-")}`;
}

/** Look up a dynamically created unit in the operational store (avoids import cycle). */
function findDynamicUnit(slug: string): { name: string; code: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("ssacc_operational_store_v2");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { units?: { id: string; name: string; code: string }[] };
    const unit = parsed.units?.find((u) => u.id === `op-unit-${slug}`);
    return unit ? { name: unit.name, code: unit.code } : null;
  } catch {
    return null;
  }
}

export function getUnitIntelName(unitId: string): string {
  return (
    INT_UNITS.find((u) => u.id === unitId)?.name ??
    findDynamicUnit(unitId)?.name ??
    "Current Unit"
  );
}

export function getUnitIntelCode(unitId: string): string {
  return (
    INT_UNITS.find((u) => u.id === unitId)?.code ??
    findDynamicUnit(unitId)?.code ??
    "A"
  );
}

/** Beam inventory from Visibility Matrix SSOT (inventory is unit-independent). */
export function getAllSatelliteBeams(satName: string, unitId = "alpha"): string[] {
  return resolveMatrixVisibility(unitId, satName)?.beamInventory ?? [];
}

export type BeamVisibilityEntry = {
  name: string;
  visibleToUnit: boolean;
  label: string;
};

/** Delegates to Visibility Matrix — never computes visibility locally. */
export function resolveBeamVisibility(
  satName: string,
  unitId: string,
  ctx: IntelLinkageContext,
): BeamVisibilityEntry[] {
  return resolveBeamVisibilityFromMatrix(satName, unitId, ctx).beams;
}

export type IntelSatelliteReportRow = {
  reportId: string;
  satelliteName: string;
  /** False when Visibility Matrix reports zero intersecting beams for this unit. */
  scanEligible: boolean;
  totalScanned: number;
  analyzed: number;
  pending: number;
  /** null = not applicable (zero visibility) */
  productivityScore: number | null;
  reportTimestamp: string | null;
  polarization: string;
  processingStatus: string;
  engagementStatus: string | null;
};

export type ProductiveFrequency = {
  id: string;
  frequencyId: string;
  outputType: string;
  detailsOfInterception: string;
  protocolEncountered?: string;
};

export type NonProductiveFrequency = {
  id: string;
  frequencyId: string;
  level: string;
  protocolEncountered?: string;
  remarks: string;
};

export type NovelProtocol = {
  frequency: string;
  protocol: string;
  remarks: string;
};

export type IntelDrillDownReport = {
  reportId: string;
  satelliteName: string;
  unitId: string;
  baseProfile: VisibilitySatelliteProfile;
  totalBeamsAvailable: string[];
  totalBeamCount: number;
  beamsVisibleToUnit: string[];
  scanBand: string;
  /** True when visibility matrix reports zero beams for this unit — sections remain, data gated. */
  visibilityBlocked: boolean;
  visibilityConstraint: string;
  scanSummary: {
    polarization: string;
    totalScanned: number;
    analyzed: number;
    pending: number;
    scanStartDate: string;
  };
  productive: ProductiveFrequency[];
  nonProductive: NonProductiveFrequency[];
  novelProtocols: NovelProtocol[];
};

export type EngagementScanLink = {
  status: string;
  id: string;
  scanned: number;
  analyzed: number;
  pending: number;
};

export type IntelLinkageContext = {
  unitId: string;
  engagementBySatName: Map<string, EngagementScanLink>;
  visibilityBySatId: Map<string, Set<string>>;
  visibilityBySatName: Map<string, string[]>;
  resourcesServiceable: boolean;
};

function seedRand(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h & 0xfffffff) / 0x10000000;
  };
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function freqId(base: number, pol: string, idx: number): string {
  return `${pol}-${(base + idx * 6.25).toFixed(2)} MHz`;
}

/** Visibility rows for buildIntelLinkageContext — sourced from Visibility Matrix SSOT. */
export function buildIntelLinkageVisibilityRows(
  intUnitSlug: string,
  dbUnitId: string,
  engagements: any[],
): any[] {
  const rows: any[] = [];
  const seen = new Set<string>();

  for (const eng of engagements) {
    const satName = eng.satellites?.name as string | undefined;
    if (!satName) continue;

    const snap = resolveMatrixVisibility(intUnitSlug, satName);
    if (!snap?.canScan) continue;

    const bands = bandsFromVisibleBeams(snap.beamsVisibleToUnit);
    for (const band of bands) {
      const key = `${snap.satelliteId}:${band}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        unit_id: dbUnitId,
        visible: true,
        beams: {
          band,
          satellite_id: snap.satelliteId ?? (eng.satellites?.id as string),
          satellites: { name: satName },
        },
      });
    }
  }

  return rows;
}

export function buildIntelLinkageContext(
  unitId: string,
  engagements: any[],
  visibilityRows: any[],
  equipmentRows: any[],
  intelRows: any[] = [],
): IntelLinkageContext {
  const engagementBySatName = new Map<string, EngagementScanLink>();

  for (const eng of engagements) {
    const name = eng.satellites?.name as string | undefined;
    if (!name) continue;
    const analysis = computeSatelliteAnalysis(eng, intelRows);
    engagementBySatName.set(name, {
      status: eng.status as string,
      id: eng.id as string,
      scanned: analysis.scanned,
      analyzed: analysis.analyzed,
      pending: analysis.pending,
    });
  }

  const visibilityBySatId = new Map<string, Set<string>>();
  const visibilityBySatName = new Map<string, string[]>();
  const satIdToName = new Map<string, string>();

  for (const eng of engagements) {
    if (eng.satellites?.id && eng.satellites?.name) {
      satIdToName.set(eng.satellites.id, eng.satellites.name);
    }
  }

  for (const row of visibilityRows) {
    if (row.visible === false) continue;
    const beam = row.beams;
    if (!beam) continue;
    const satId = beam.satellite_id as string;
    const satName =
      (beam.satellites as { name?: string } | null)?.name ??
      satIdToName.get(satId);
    if (!satName) continue;

    const pols = bandToPolarizations(beam.band ?? "");
    if (!visibilityBySatId.has(satId)) visibilityBySatId.set(satId, new Set());
    if (!visibilityBySatName.has(satName)) visibilityBySatName.set(satName, []);

    for (const p of pols) {
      visibilityBySatId.get(satId)!.add(p);
      const list = visibilityBySatName.get(satName)!;
      if (!list.includes(p)) list.push(p);
    }
  }

  const NON_OP = new Set(["Non-Serviceable", "Under Repair", "Partially Serviceable"]);
  const hasOperational = equipmentRows.some((e: any) => e.serviceability === "Operational");
  const allFaulty = equipmentRows.length > 0 && equipmentRows.every((e: any) => NON_OP.has(e.serviceability));

  return {
    unitId,
    engagementBySatName,
    visibilityBySatId,
    visibilityBySatName,
    resourcesServiceable: equipmentRows.length === 0 ? true : hasOperational && !allFaulty,
  };
}

function resolvePolarization(satName: string, ctx: IntelLinkageContext): string {
  const visible = ctx.visibilityBySatName.get(satName);
  if (visible && visible.length > 0) return visible[0];
  return VISIBILITY_SATELLITE_PROFILES[satName]?.defaultPolarization ?? "KU-HH";
}

function buildScanCounts(
  unitId: string,
  satName: string,
  ctx: IntelLinkageContext,
): {
  totalScanned: number;
  analyzed: number;
  pending: number;
  processingStatus: string;
  engagementStatus: string | null;
} {
  if (!canUnitScanSatellite(satName, unitId, ctx)) {
    return {
      totalScanned: 0,
      analyzed: 0,
      pending: 0,
      processingStatus: "No Activity Possible — Zero Beam Visibility",
      engagementStatus: null,
    };
  }

  const eng = ctx.engagementBySatName.get(satName);

  if (eng && ctx.resourcesServiceable) {
    const complete = isIntGenerationComplete(eng.scanned, eng.analyzed, eng.pending);
    const scanPhase = deriveIntScanPhaseStatus(eng.scanned, eng.analyzed, eng.pending);
    return {
      totalScanned: eng.scanned,
      analyzed: eng.analyzed,
      pending: eng.pending,
      processingStatus: complete
        ? "Analysis Complete"
        : eng.pending > 0
          ? "Active Scanning"
          : eng.status === "Paused"
            ? "Scan Paused"
            : "Processing",
      engagementStatus: scanPhase,
    };
  }

  if (!ctx.resourcesServiceable) {
    return {
      totalScanned: 0, analyzed: 0, pending: 0,
      processingStatus: "Blocked — Unserviceable Resources",
      engagementStatus: null,
    };
  }

  const rand = seedRand(`${unitId}-${satName}-counts`);
  const totalScanned = 32 + Math.floor(rand() * 19);
  const analyzed = Math.floor(totalScanned * (0.55 + rand() * 0.3));
  const pending = totalScanned - analyzed;
  const scanPhase = deriveIntScanPhaseStatus(totalScanned, analyzed, pending);
  return {
    totalScanned,
    analyzed,
    pending,
    processingStatus: pending === 0 ? "Analysis Complete" : "Active Scanning",
    engagementStatus: scanPhase,
  };
}

function productivityScore(analyzed: number, productiveCount: number): number {
  if (analyzed === 0) return 0;
  return Math.min(100, Math.round((productiveCount / analyzed) * 100));
}

export function buildIntelSatelliteTable(
  unitId: string,
  ctx: IntelLinkageContext,
  engagements: any[] = [],
): IntelSatelliteReportRow[] {
  const roster = UNIT_SATELLITE_ROSTER[unitId];
  if (!roster) return [];

  const rosterSet = new Set(roster.map((s) => s.toLowerCase()));
  const extraFromEngagements: string[] = [];
  for (const eng of engagements) {
    const name = eng.satellites?.name as string | undefined;
    if (!name || rosterSet.has(name.toLowerCase())) continue;
    if (canUnitScanSatellite(name, unitId, ctx)) {
      extraFromEngagements.push(name);
    }
  }

  const allSatellites = [...roster, ...extraFromEngagements];
  const now = INTEL_MOCK_EPOCH_MS;

  return allSatellites.map((satName, idx) => {
    const eligible = canUnitScanSatellite(satName, unitId, ctx);
    const counts = buildScanCounts(unitId, satName, ctx);

    if (!eligible) {
      return {
        reportId: `${unitId}__${satName.replace(/\s+/g, "-")}`,
        satelliteName: satName,
        scanEligible: false,
        totalScanned: 0,
        analyzed: 0,
        pending: 0,
        productivityScore: null,
        reportTimestamp: null,
        polarization: "—",
        processingStatus: counts.processingStatus,
        engagementStatus: null,
      };
    }

    const rand = seedRand(`${unitId}-${satName}-row`);
    const productiveEst = Math.floor(counts.analyzed * (0.35 + rand() * 0.25));
    const daysAgo = Math.floor(rand() * 14);
    const ts = new Date(now - daysAgo * 86400000 - idx * 3600000);

    return {
      reportId: `${unitId}__${satName.replace(/\s+/g, "-")}`,
      satelliteName: satName,
      scanEligible: true,
      totalScanned: counts.totalScanned,
      analyzed: counts.analyzed,
      pending: counts.pending,
      productivityScore: productivityScore(counts.analyzed, productiveEst),
      reportTimestamp: ts.toISOString(),
      polarization: resolveScanPolarizationFromEngagement(satName, unitId, ctx, engagements),
      processingStatus: counts.processingStatus,
      engagementStatus: counts.engagementStatus,
    };
  });
}

export function buildIntelDrillDownReport(
  unitId: string,
  reportId: string,
  ctx: IntelLinkageContext,
  engagements: any[] = [],
): IntelDrillDownReport | null {
  const row = buildIntelSatelliteTable(unitId, ctx, engagements).find((r) => r.reportId === reportId);
  if (!row) return null;

  const profile = resolveSatelliteProfile(row.satelliteName, unitId);

  const scanPol = resolveScanPolarizationFromEngagement(row.satelliteName, unitId, ctx, engagements);
  const { beams: beamVisibility, filteredOut: beamFilteredOut, snapshot } = resolveBeamVisibilityFromMatrix(
    row.satelliteName,
    unitId,
    ctx,
  );
  const integrity = validateIntelReportIntegrity(
    row.satelliteName,
    unitId,
    ctx,
    engagements,
    scanPol,
    beamVisibility,
    beamFilteredOut,
  );
  const totalBeamsAvailable = snapshot?.beamInventory ?? [];
  const totalBeamCount = snapshot?.totalBeamCount ?? totalBeamsAvailable.length;
  const beamsVisibleToUnit = snapshot?.beamsVisibleToUnit ?? getVisibleBeamNamesFromMatrix(row.satelliteName, unitId, ctx);

  if (!row.scanEligible) {
    return {
      reportId: row.reportId,
      satelliteName: row.satelliteName,
      unitId,
      baseProfile: profile,
      totalBeamsAvailable,
      totalBeamCount,
      beamsVisibleToUnit,
      scanBand: integrity.scanBand,
      visibilityBlocked: true,
      visibilityConstraint: "Scanning blocked — Visibility Matrix reports zero beams visible to this unit.",
      scanSummary: {
        polarization: "—",
        totalScanned: 0,
        analyzed: 0,
        pending: 0,
        scanStartDate: "—",
      },
      productive: [],
      nonProductive: [],
      novelProtocols: [],
    };
  }

  const pol = scanPol !== "—" ? scanPol : (ctx.visibilityBySatName.get(row.satelliteName)?.[0] ?? profile.defaultPolarization);

  const rand = seedRand(`${reportId}-drill`);
  const baseFreq = pol.toUpperCase().startsWith("C") ? 3750 : 11750;

  const score = row.productivityScore ?? 0;
  const productiveCount =
    row.analyzed > 0 ? Math.min(row.analyzed, Math.max(1, Math.floor(row.analyzed * (score / 100)))) : 0;
  const nonProdCount = Math.max(0, row.analyzed - productiveCount);

  const productive: ProductiveFrequency[] = Array.from({ length: Math.min(productiveCount, 15) }, (_, i) => {
    const fid = freqId(baseFreq, pol, i);
    const hasProtocol = rand() > 0.55;
    return {
      id: `${reportId}-prod-${i}`,
      frequencyId: fid,
      outputType: pick(OUTPUT_TYPES, rand),
      detailsOfInterception: pick(DETAILS_OF_INTERCEPTION, rand),
      ...(hasProtocol ? { protocolEncountered: pick(KNOWN_PROTOCOLS, rand) } : {}),
    };
  });

  const nonProductive: NonProductiveFrequency[] = Array.from({ length: Math.min(nonProdCount, 12) }, (_, i) => {
    const level = pick(NON_PRODUCTIVE_LEVELS, rand);
    const hasProtocol = level !== "Modulation" && rand() > 0.45;
    const remarksPool = NON_PRODUCTIVE_REMARKS[level as keyof typeof NON_PRODUCTIVE_REMARKS];
    const fid = freqId(baseFreq + 200, pol, i + productiveCount);
    return {
      id: `${reportId}-non-${i}`,
      frequencyId: fid,
      level,
      remarks: pick(remarksPool, rand),
      ...(hasProtocol ? { protocolEncountered: pick(KNOWN_PROTOCOLS, rand) } : {}),
    };
  });

  const novelCount = rand() > 0.55 ? 1 + Math.floor(rand() * 2) : 0;
  const NOVEL_NAMES = ["DVB-S2X-Ext", "SCPC-ACM-Variant", "TDM-OFDM-Hybrid", "Proprietary-XLink"];
  const novelProtocols: NovelProtocol[] = Array.from({ length: novelCount }, (_, i) => ({
    frequency: freqId(baseFreq + 400, pol, i),
    protocol: `${pick(NOVEL_NAMES, rand)}-${String.fromCharCode(65 + i)}`,
    remarks: rand() > 0.5
      ? "No prior corpus match in regional protocol library"
      : "First observation in unit scan archive — pending validation",
  }));

  const scanDays = 1 + Math.floor(rand() * 10);
  const scanStart = row.reportTimestamp
    ? new Date(new Date(row.reportTimestamp).getTime() - scanDays * 86400000)
    : null;

  return {
    reportId: row.reportId,
    satelliteName: row.satelliteName,
    unitId,
    baseProfile: profile,
    totalBeamsAvailable,
    totalBeamCount,
    beamsVisibleToUnit,
    scanBand: integrity.scanBand,
    visibilityBlocked: false,
    visibilityConstraint: "",
    scanSummary: {
      polarization: pol,
      totalScanned: row.totalScanned,
      analyzed: row.analyzed,
      pending: row.pending,
      scanStartDate: scanStart ? scanStart.toISOString().slice(0, 10) : "—",
    },
    productive,
    nonProductive,
    novelProtocols,
  };
}

/** Fixed epoch for deterministic mock INT timestamps — all views derive from the same rows. */
const INTEL_MOCK_EPOCH_MS = Date.parse("2026-06-19T12:00:00Z");

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export function formatIntelCompactDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTH_SHORT[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  return `${dd} ${mon} ${yyyy}`;
}

/** @deprecated Use formatIntelCompactDate for repository summary views. */
export function formatIntelTimestamp(iso: string): string {
  return formatIntelCompactDate(iso);
}

export type UnitIntelSummary = {
  hasData: boolean;
  satellites: number;
  totalScanned: number;
  productive: number;
  lastReportIso: string | null;
};

/** Derive unit-level stats from satellite table rows — single source of truth. */
export function summarizeIntelSatelliteRows(rows: IntelSatelliteReportRow[]): UnitIntelSummary {
  if (rows.length === 0) {
    return { hasData: false, satellites: 0, totalScanned: 0, productive: 0, lastReportIso: null };
  }
  const eligible = rows.filter((r) => r.scanEligible);
  const totalScanned = eligible.reduce((s, r) => s + r.totalScanned, 0);
  const productive = eligible.reduce(
    (s, r) => s + Math.floor(r.analyzed * ((r.productivityScore ?? 0) / 100)),
    0,
  );
  let maxTs = -Infinity;
  let lastReportIso: string | null = null;
  for (const r of eligible) {
    if (!r.reportTimestamp) continue;
    const t = new Date(r.reportTimestamp).getTime();
    if (!isNaN(t) && t > maxTs) {
      maxTs = t;
      lastReportIso = r.reportTimestamp;
    }
  }
  return {
    hasData: rows.length > 0,
    satellites: rows.length,
    totalScanned,
    productive,
    lastReportIso,
  };
}

/**
 * Build a minimal IntelDrillDownReport for a satellite that was imported
 * via the scan-report import (i.e. not in the original unit roster).
 * When linkageCtx is provided, beam data is fetched from the Satellite
 * Visibility Matrix.  If the satellite is absent from the matrix, the
 * report is flagged with visibilityBlocked = true and a descriptive
 * visibilityConstraint message so the analysis page can surface it.
 */
export function buildSyntheticDrillDownReport(
  satelliteName: string,
  unitId: string,
  ctx?: IntelLinkageContext,
  scanSeed?: ScanSummarySeed,
): IntelDrillDownReport {
  const reportId = `${unitId}__${satelliteName.replace(/\s+/g, "-")}`;
  const profile = resolveSatelliteProfile(satelliteName, unitId);

  let totalBeamsAvailable: string[] = [];
  let totalBeamCount = 0;
  let beamsVisibleToUnit: string[] = [];
  let visibilityBlocked = false;
  let visibilityConstraint = "—";

  if (ctx) {
    const { beams, snapshot } = resolveBeamVisibilityFromMatrix(satelliteName, unitId, ctx);
    totalBeamsAvailable = snapshot?.beamInventory ?? [];
    totalBeamCount      = snapshot?.totalBeamCount ?? totalBeamsAvailable.length;
    beamsVisibleToUnit  = snapshot?.beamsVisibleToUnit ?? beams;

    if (totalBeamsAvailable.length === 0) {
      visibilityBlocked  = true;
      visibilityConstraint =
        `"${satelliteName}" not found in Satellite Visibility Matrix — beam data unavailable.`;
    }
  }

  const pol =
    scanSeed?.polarization && scanSeed.polarization !== "—"
      ? scanSeed.polarization
      : profile.defaultPolarization !== "—"
        ? profile.defaultPolarization
        : "—";

  return {
    reportId,
    satelliteName,
    unitId,
    baseProfile: profile,
    totalBeamsAvailable,
    totalBeamCount,
    beamsVisibleToUnit,
    scanBand: "—",
    visibilityBlocked,
    visibilityConstraint,
    scanSummary: {
      polarization: pol,
      totalScanned: scanSeed?.totalScanned ?? 0,
      analyzed: scanSeed?.analyzed ?? 0,
      pending: scanSeed?.pending ?? 0,
      scanStartDate: "—",
    },
    productive: [],
    nonProductive: [],
    novelProtocols: [],
  };
}
