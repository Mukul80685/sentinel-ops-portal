/**
 * INT Repository — hierarchical analysis data, fake datasets, and cross-module linkage.
 */
import { computeSatelliteAnalysis } from "@/lib/engagementEngine";
import {
  canUnitScanSatellite,
  getVisibleBeamNamesFromMatrix,
  resolveBeamVisibilityFromMatrix,
  resolveScanPolarizationFromEngagement,
  validateIntelReportIntegrity,
} from "@/lib/intelIntegrity";
import { resolveMatrixVisibility } from "@/lib/visibilityMatrix";
import { bandToPolarizations, INT_UNITS } from "@/lib/intelRepository";

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

export function hasIntelData(unitId: string): boolean {
  return INTEL_MOCK_UNIT_IDS.has(unitId);
}

/** True when satellite appears in this unit's INT Repository roster. */
export function isSatelliteInIntRoster(unitId: string, satelliteName: string): boolean {
  if (!hasIntelData(unitId)) return false;
  const roster = UNIT_SATELLITE_ROSTER[unitId];
  if (!roster) return false;
  const norm = satelliteName.trim().toLowerCase();
  return roster.some((s) => s.toLowerCase() === norm);
}

export function intelReportIdForSatellite(unitId: string, satelliteName: string): string {
  return `${unitId}__${satelliteName.replace(/\s+/g, "-")}`;
}

export function getUnitIntelName(unitId: string): string {
  return INT_UNITS.find((u) => u.id === unitId)?.name ?? "Current Unit";
}

export function getUnitIntelCode(unitId: string): string {
  return INT_UNITS.find((u) => u.id === unitId)?.code ?? "A";
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

export function buildIntelLinkageContext(
  unitId: string,
  engagements: any[],
  visibilityRows: any[],
  equipmentRows: any[],
): IntelLinkageContext {
  const engagementBySatName = new Map<string, EngagementScanLink>();

  for (const eng of engagements) {
    const name = eng.satellites?.name as string | undefined;
    if (!name) continue;
    const analysis = computeSatelliteAnalysis(eng, []);
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
    return {
      totalScanned: eng.scanned,
      analyzed: eng.analyzed,
      pending: eng.pending,
      processingStatus:
        eng.status === "In Progress" ? "Active Scanning"
        : eng.status === "Paused" ? "Scan Paused"
        : "Queued",
      engagementStatus: eng.status,
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
  return {
    totalScanned,
    analyzed,
    pending: totalScanned - analyzed,
    processingStatus: analyzed === totalScanned ? "Analysis Complete" : "Processing",
    engagementStatus: null,
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

  const now = INTEL_MOCK_EPOCH_MS;

  return roster.map((satName, idx) => {
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

  const profile = VISIBILITY_SATELLITE_PROFILES[row.satelliteName];
  if (!profile) return null;

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

export function formatIntelCompactDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
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
