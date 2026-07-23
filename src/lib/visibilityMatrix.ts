/**
 * Satellite Visibility Matrix — SINGLE SOURCE OF TRUTH for beam inventory,
 * unit footprint visibility, and scan eligibility gating.
 *
 * INT Repository and all derived systems MUST consume this module only.
 */

export interface GeoSatellite {
  id: string;
  name: string;
  orbitType?: string;
  position: string;
  launchDate: string;
  transponders: string;
  cBandTransponders?: string;
  kuBandTransponders?: string;
  kaBandTransponders?: string;
  beamCoverage: string;
  beamCoverageImageUrl?: string;
  beams?: string[];
  footprintImageUrl?: string;
  visibilityNotes?: string;
  beamEirp?: Record<string, number>;
}

export interface GeoRegion {
  id: string;
  label: string;
  flagCode?: string;
  emoji?: string;
  satellites: GeoSatellite[];
}

/** Legacy name aliases — prefer GEO_REGIONS entries when present. */
const INT_SATELLITE_MATRIX_ALIASES: Record<string, { matrixId: string; regionId: string }> = {};

export function normalizeSatelliteName(name: string): string {
  return name.trim().toLowerCase();
}

/** Alphanumeric-only key for fuzzy satellite name matching (APSTAR-9 ↔ Apstar 9). */
export function canonicalSatelliteKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function namesMatch(a: string, b: string): boolean {
  return (
    normalizeSatelliteName(a) === normalizeSatelliteName(b) ||
    canonicalSatelliteKey(a) === canonicalSatelliteKey(b)
  );
}

export const GEO_REGIONS: GeoRegion[] = [
  {
    id: "china",
    label: "China",
    flagCode: "cn",
    satellites: [
      { id: "cn-1", name: "ChinaSat 6B", position: "105.5°E", launchDate: "2007-07-05", transponders: "38 C/Ku-band", beamCoverage: "Asia / Pacific" },
      { id: "cn-2", name: "ChinaSat 9", position: "92.2°E", launchDate: "2008-06-09", transponders: "22 Ku-band", beamCoverage: "China (DTH)" },
      { id: "cn-3", name: "ChinaSat 10", position: "110.5°E", launchDate: "2011-06-21", transponders: "30 Ku/C-band", beamCoverage: "Asia / Pacific" },
      { id: "cn-4", name: "ChinaSat 12", position: "87.5°E", launchDate: "2012-05-26", transponders: "32 C/Ku-band", beamCoverage: "Asia / Indian Ocean" },
      { id: "cn-5", name: "ChinaSat 15", position: "101.4°E", launchDate: "2011-03-05", transponders: "22 Ku-band", beamCoverage: "China / SE Asia" },
      { id: "cn-6", name: "AsiaSat 5", position: "100.5°E", launchDate: "2009-08-11", transponders: "26 C/Ku-band", beamCoverage: "Asia / Pacific / Middle East" },
      { id: "cn-7", name: "AsiaSat 7", position: "105.5°E", launchDate: "2011-11-21", transponders: "28 C/Ku-band", beamCoverage: "Asia / Middle East" },
      { id: "cn-8", name: "Apstar 6", position: "134.0°E", launchDate: "2005-04-12", transponders: "24 C/Ku-band", beamCoverage: "Asia / Pacific" },
      { id: "cn-9", name: "Apstar 9", position: "142.0°E", launchDate: "2015-10-17", transponders: "28 C/Ku-band", beamCoverage: "Asia / Pacific" },
      { id: "cn-10", name: "Apstar 7", position: "76.5°E", launchDate: "2014-03-18", transponders: "28 C/Ku-band", beamCoverage: "South Asia footprint" },
    ],
  },
  {
    id: "pakistan",
    label: "Pakistan",
    flagCode: "pk",
    satellites: [
      { id: "pk-1", name: "PAKSAT-1R", position: "38.0°E", launchDate: "2011-08-12", transponders: "30 C/Ku-band", beamCoverage: "South Asia / Middle East / Africa" },
      { id: "pk-2", name: "PAKSAT MM1", position: "42.0°E", launchDate: "2023-01-10", transponders: "14 Ku/Ka-band", beamCoverage: "South Asia / Middle East" },
    ],
  },
  {
    id: "turkey",
    label: "Turkey",
    flagCode: "tr",
    satellites: [
      { id: "tr-1", name: "Turksat 3A", position: "42.0°E", launchDate: "2008-06-12", transponders: "32 Ku/Ka-band", beamCoverage: "Turkey / Europe / Middle East" },
      { id: "tr-2", name: "Turksat 4A", position: "42.0°E", launchDate: "2014-02-14", transponders: "34 Ku/Ka-band", beamCoverage: "Turkey / Europe / Asia" },
      { id: "tr-3", name: "Turksat 4B", position: "50.0°E", launchDate: "2015-10-16", transponders: "32 Ku/Ka-band", beamCoverage: "Asia / Middle East / Africa" },
      { id: "tr-4", name: "Turksat 5A", position: "31.3°E", launchDate: "2021-01-08", transponders: "36 Ku/Ka-band", beamCoverage: "Europe / Middle East / Africa" },
    ],
  },
  {
    id: "bangladesh",
    label: "Bangladesh",
    flagCode: "bd",
    satellites: [
      { id: "bd-1", name: "Bangabandhu-1", position: "119.1°E", launchDate: "2018-05-12", transponders: "40 C/Ku-band", beamCoverage: "South Asia / SE Asia" },
    ],
  },
  {
    id: "sea",
    label: "Southeast Asia",
    emoji: "🌏",
    satellites: [
      { id: "sea-1", name: "Measat-3a", position: "91.5°E", launchDate: "2009-06-21", transponders: "24 C/Ku-band", beamCoverage: "Asia / Indian Ocean" },
      { id: "sea-2", name: "Thaicom 6", position: "78.5°E", launchDate: "2014-01-07", transponders: "28 C/Ku-band", beamCoverage: "Asia / Pacific" },
      { id: "sea-3", name: "Thaicom 8", position: "78.5°E", launchDate: "2016-05-27", transponders: "24 Ku/Ka-band", beamCoverage: "SE Asia / Indian Ocean" },
      { id: "sea-4", name: "Telkom-3S", position: "118.0°E", launchDate: "2017-02-14", transponders: "42 C/Ku/Ka-band", beamCoverage: "SE Asia / Pacific" },
      { id: "sea-5", name: "PSN VI", position: "146.0°E", launchDate: "2020-11-22", transponders: "32 C/Ku-band", beamCoverage: "Indonesia / Pacific" },
      { id: "sea-6", name: "JCSAT-17", position: "136.0°E", launchDate: "2020-02-18", transponders: "28 Ku/Ka-band", beamCoverage: "Asia / Pacific" },
      { id: "sea-7", name: "Sky Perfect JSAT-16", position: "162.0°E", launchDate: "2016-10-14", transponders: "24 Ku-band", beamCoverage: "Japan / Pacific" },
      { id: "sea-8", name: "Optus D3", position: "156.0°E", launchDate: "2009-08-22", transponders: "32 Ku-band", beamCoverage: "Australia / Pacific" },
    ],
  },
  {
    id: "middle-east",
    label: "Middle East",
    emoji: "🌐",
    satellites: [
      { id: "me-1", name: "Arabsat 5C", position: "20.0°E", launchDate: "2010-08-04", transponders: "36 C/Ku-band", beamCoverage: "Middle East / Africa / Europe" },
      { id: "me-2", name: "Arabsat 6A", position: "26.0°E", launchDate: "2019-04-11", transponders: "60 C/Ku/Ka-band", beamCoverage: "Middle East / Africa" },
      { id: "me-3", name: "Nilesat 201", position: "7.0°W", launchDate: "2010-08-04", transponders: "44 Ku-band", beamCoverage: "Middle East / North Africa" },
      { id: "me-4", name: "Es'hailSat 1", position: "25.5°E", launchDate: "2013-08-27", transponders: "24 Ku-band", beamCoverage: "Qatar / Middle East" },
      { id: "me-5", name: "Es'hailSat 2", position: "25.5°E", launchDate: "2018-11-15", transponders: "26 Ku/Ka-band", beamCoverage: "Middle East / Africa" },
    ],
  },
  {
    id: "europe",
    label: "Europe",
    flagCode: "eu",
    satellites: [
      { id: "eu-1", name: "Astra 1M", position: "19.2°E", launchDate: "2008-11-05", transponders: "32 Ku-band", beamCoverage: "Europe / Middle East" },
      { id: "eu-2", name: "Astra 2E", position: "28.2°E", launchDate: "2012-09-29", transponders: "60 Ku/Ka-band", beamCoverage: "Europe" },
      { id: "eu-3", name: "Eutelsat 33E", position: "33.0°E", launchDate: "2012-09-28", transponders: "40 Ku-band", beamCoverage: "Europe / Middle East / Africa" },
      { id: "eu-4", name: "Hotbird 13C", position: "13.0°E", launchDate: "2012-06-23", transponders: "64 Ku-band", beamCoverage: "Europe / N. Africa / Middle East" },
      { id: "eu-5", name: "Eutelsat 7A", position: "7.0°E", launchDate: "2011-09-22", transponders: "38 Ku-band", beamCoverage: "Europe / Middle East / Africa" },
      { id: "eu-6", name: "SES-12", position: "95.0°E", launchDate: "2018-06-04", transponders: "54 Ku/Ka-band", beamCoverage: "Asia / Middle East / Pacific" },
      { id: "eu-7", name: "Eutelsat 7B", position: "7.0°E", launchDate: "2013-03-26", transponders: "44 Ku/Ka-band", beamCoverage: "Europe / Middle East / Africa" },
      { id: "eu-8", name: "Astra 2G", position: "28.2°E", launchDate: "2014-12-27", transponders: "60 Ku-band", beamCoverage: "Europe / Middle East" },
      { id: "eu-9", name: "Hotbird 13E", position: "13.0°E", launchDate: "2006-10-05", transponders: "64 Ku-band", beamCoverage: "Europe / N. Africa" },
    ],
  },
  {
    id: "africa",
    label: "Africa",
    emoji: "🌍",
    satellites: [
      { id: "af-1", name: "Intelsat 20", position: "68.5°E", launchDate: "2012-08-02", transponders: "60 C/Ku-band", beamCoverage: "Africa / Middle East / Indian Ocean" },
      { id: "af-2", name: "AMOS-17", position: "17.0°E", launchDate: "2019-08-06", transponders: "55 Ka-band", beamCoverage: "Africa" },
      { id: "af-3", name: "Eutelsat 16A", position: "16.0°E", launchDate: "2011-04-20", transponders: "40 Ku-band", beamCoverage: "Africa / Europe" },
      { id: "af-4", name: "Intelsat 33e", position: "60.0°E", launchDate: "2016-08-26", transponders: "56 C/Ku/Ka-band", beamCoverage: "Africa / Asia / Middle East" },
    ],
  },
  {
    id: "russia",
    label: "Russia",
    flagCode: "ru",
    satellites: [
      { id: "ru-1", name: "Express-AM5", position: "140.0°E", launchDate: "2014-12-26", transponders: "42 Ku/Ka-band", beamCoverage: "Russia / Asia" },
      { id: "ru-2", name: "Express-AM6", position: "53.0°E", launchDate: "2014-10-21", transponders: "64 C/Ku-band", beamCoverage: "Russia / Middle East / Africa" },
      { id: "ru-3", name: "Express-AT1", position: "56.0°E", launchDate: "2014-03-17", transponders: "32 Ku-band", beamCoverage: "Russia / CIS" },
      { id: "ru-4", name: "Yamal-402", position: "55.0°E", launchDate: "2012-12-08", transponders: "46 Ku-band", beamCoverage: "Russia / Central Asia" },
      { id: "ru-5", name: "Yamal 601", position: "49.0°E", launchDate: "2016-05-30", transponders: "36 C/Ku-band", beamCoverage: "Russia / CIS" },
    ],
  },
  {
    id: "usa",
    label: "USA",
    flagCode: "us",
    satellites: [
      { id: "us-1", name: "AMC-21", position: "125.0°W", launchDate: "2008-08-14", transponders: "24 Ku/Ka-band", beamCoverage: "North America" },
      { id: "us-2", name: "AMC-18", position: "105.0°W", launchDate: "2006-12-16", transponders: "24 C-band", beamCoverage: "North America" },
      { id: "us-3", name: "Intelsat 34", position: "55.5°W", launchDate: "2015-08-27", transponders: "64 C/Ku-band", beamCoverage: "Americas / Atlantic" },
      { id: "us-4", name: "Intelsat 35e", position: "34.5°W", launchDate: "2017-07-02", transponders: "60 C/Ku/Ka-band", beamCoverage: "Americas / Africa / Europe" },
      { id: "us-5", name: "SES-14", position: "47.5°W", launchDate: "2018-01-25", transponders: "40 C/Ku/Ka-band", beamCoverage: "Americas / Atlantic" },
      { id: "us-6", name: "Galaxy 30", position: "125.0°W", launchDate: "2020-08-15", transponders: "24 C-band", beamCoverage: "North America / Pacific" },
    ],
  },
];

export const REGION_BEAMS: Record<string, string[]> = {
  china: [
    "Ku Regional – Beam 08", "Ku Spot – Beam 11", "C-band Wide Beam",
    "Ka Spot – Beam 04", "Ku Regional – Beam 13",
  ],
  pakistan: ["Ku Regional – Beam 05", "C-band Wide Beam", "Ka Spot – Beam 02", "Ku Spot – Beam 09"],
  turkey: ["Ku Regional – Beam 07", "Ka Spot – Beam 03", "C-band Regional Beam", "Ku Spot – Beam 14"],
  bangladesh: ["Ku Regional – Beam 06", "C-band Wide Beam", "Ka Spot – Beam 01", "Ku Spot – Beam 10"],
  sea: ["Ku Regional – Beam 09", "C-band Wide Beam", "Ka Spot – Beam 06", "Ku Spot – Beam 15", "C-band Regional Beam"],
  "middle-east": ["Ku Regional – Beam 03", "Ka Spot – Beam 07", "C-band Wide Beam", "Ku Spot – Beam 12", "C-band Regional Beam"],
  europe: ["Ku Regional – Beam 10", "Ka Spot – Beam 05", "C-band Wide Beam", "Ku Spot – Beam 16"],
  africa: ["Ku Regional – Beam 02", "C-band Wide Beam", "Ka Spot – Beam 08", "Ku Spot – Beam 17"],
  russia: ["Ku Regional – Beam 04", "C-band Wide Beam", "Ka Spot – Beam 09", "Ku Spot – Beam 18"],
  usa: ["Ku Regional – Beam 01", "C-band Wide Beam", "Ka Spot – Beam 10", "Ku Spot – Beam 19"],
};

export function seedRand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

/** Deterministic beam breakdown — matches Visibility Matrix "Beams" column. */
export function getBeamBreakdown(sat: GeoSatellite): { total: number; beams: string[] } {
  if (sat.beams && sat.beams.length > 0) {
    const total = sat.beams.reduce((n, b) => {
      const m = b.match(/^(\d+)/);
      return n + (m ? parseInt(m[1]) : 1);
    }, 0);
    return { total, beams: sat.beams };
  }
  const rand = seedRand(sat.id + "beams");
  const ku = 4 + Math.floor(rand() * 6);
  const reg = 2 + Math.floor(rand() * 4);
  const c = 2 + Math.floor(rand() * 3);
  return {
    total: ku + reg + c,
    beams: [`${ku} Ku Spot Beams`, `${reg} Regional Beams`, `${c} C-band Beams`],
  };
}

/** Parse transponder counts — shared by Visibility Metrics and Priority & Allocation. */
export function parseSatelliteTransponders(
  sat: GeoSatellite,
): { total: number; cBand?: string; kuBand?: string; kaBand?: string } {
  const cNum = sat.cBandTransponders ? parseInt(sat.cBandTransponders) || 0 : 0;
  const kuNum = sat.kuBandTransponders ? parseInt(sat.kuBandTransponders) || 0 : 0;
  const kaNum = sat.kaBandTransponders ? parseInt(sat.kaBandTransponders) || 0 : 0;
  if (cNum || kuNum || kaNum) {
    return {
      total: cNum + kuNum + kaNum,
      cBand: cNum > 0 ? String(cNum) : undefined,
      kuBand: kuNum > 0 ? String(kuNum) : undefined,
      kaBand: kaNum > 0 ? String(kaNum) : undefined,
    };
  }
  const totalMatch = sat.transponders.match(/^(\d+)/);
  const total = totalMatch ? parseInt(totalMatch[1]) : 0;
  const tl = sat.transponders.toLowerCase();
  if (tl.includes("c") && tl.includes("ku") && tl.includes("ka")) {
    const third = Math.floor(total / 3);
    const rem = total - third * 2;
    return { total, cBand: String(third), kuBand: String(third), kaBand: String(rem) };
  }
  if (tl.includes("c") && tl.includes("ku")) {
    const half = Math.floor(total / 2);
    return { total, cBand: String(half), kuBand: String(total - half) };
  }
  if (tl.includes("ku") && tl.includes("ka")) {
    const half = Math.floor(total / 2);
    return { total, kuBand: String(half), kaBand: String(total - half) };
  }
  if (tl.includes("ka")) return { total, kaBand: String(total) };
  if (tl.includes("ku")) return { total, kuBand: String(total) };
  if (tl.includes("c")) return { total, cBand: String(total) };
  return { total };
}

/** Build transponder label from band counts — e.g. "19 C-band / 18 Ku-band / 6 Ka-band". */
export function buildTranspondersLabel(
  cBand?: string,
  kuBand?: string,
  kaBand?: string,
): string {
  const parts: string[] = [];
  const c = parseInt(cBand ?? "") || 0;
  const ku = parseInt(kuBand ?? "") || 0;
  const ka = parseInt(kaBand ?? "") || 0;
  if (c > 0) parts.push(`${c} C-band`);
  if (ku > 0) parts.push(`${ku} Ku-band`);
  if (ka > 0) parts.push(`${ka} Ka-band`);
  return parts.length > 0 ? parts.join(" / ") : "—";
}

/** Human-readable transponder label — e.g. "19 C-band + 19 Ku-band". */
export function formatSatelliteTransponders(sat: GeoSatellite): string {
  const tp = parseSatelliteTransponders(sat);
  const parts: string[] = [];
  if (tp.cBand) parts.push(`${tp.cBand} C-band`);
  if (tp.kuBand) parts.push(`${tp.kuBand} Ku-band`);
  if (tp.kaBand) parts.push(`${tp.kaBand} Ka-band`);
  if (parts.length > 0) return parts.join(" + ");
  return sat.transponders || "—";
}

/** Count satellites with at least one visible beam for a unit. */
export function countVisibleSatellitesForUnit(
  unitId: string,
  regions: GeoRegion[],
): number {
  const seen = new Set<string>();

  for (const region of regions) {
    for (const sat of region.satellites) {
      const beams = getVisibleBeams(unitId, sat.id, region.id);

      if (beams.length > 0) {
        seen.add(sat.id);
      }
    }
  }

  return seen.size;
}

/** Deterministic visible beams — matches Visibility Matrix "Visible Beams" column. */
export function getVisibleBeams(unitId: string, satId: string, regionId: string): string[] {
  const pool = REGION_BEAMS[regionId] ?? ["Ku Regional – Beam 01", "C-band Wide Beam", "Ka Spot – Beam 02"];
  const rand = seedRand(unitId + satId);
  const count = 1 + Math.floor(rand() * Math.min(3, pool.length - 1));
  const idxs = Array.from({ length: pool.length }, (_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  return idxs.slice(0, count).map((i) => pool[i]);
}

export type VisibilityMatrixSnapshot = {
  satelliteName: string;
  unitId: string;
  regionId: string;
  satelliteId: string;
  /** Total beam count (matches Visibility Matrix Beams column total). */
  totalBeamCount: number;
  /** Beam inventory breakdown labels (matches Visibility Matrix Beams column). */
  beamInventory: string[];
  /** Beams visible to unit (matches Visibility Matrix Visible Beams column). */
  beamsVisibleToUnit: string[];
  canScan: boolean;
  source: "visibility_matrix";
};

export function findGeoSatelliteEntry(
  satelliteName: string,
): { sat: GeoSatellite; regionId: string } | null {
  const norm = normalizeSatelliteName(satelliteName);
  const canon = canonicalSatelliteKey(satelliteName);
  for (const region of GEO_REGIONS) {
    const sat = region.satellites.find(
      (s) => normalizeSatelliteName(s.name) === norm || canonicalSatelliteKey(s.name) === canon,
    );
    if (sat) return { sat, regionId: region.id };
  }
  const aliasKey = Object.keys(INT_SATELLITE_MATRIX_ALIASES).find(
    (k) => namesMatch(k, satelliteName),
  );
  if (aliasKey) {
    const alias = INT_SATELLITE_MATRIX_ALIASES[aliasKey];
    return {
      sat: {
        id: alias.matrixId,
        name: aliasKey,
        position: "—",
        launchDate: "—",
        transponders: "—",
        beamCoverage: "—",
      },
      regionId: alias.regionId,
    };
  }
  return null;
}

/** True when the Visibility Matrix catalog lists the satellite and the unit has ≥1 visible beam. */
export function isSatelliteVisibleToUnitInMatrix(unitId: string, satelliteName: string): boolean {
  const snap = resolveMatrixVisibility(unitId, satelliteName);
  return snap?.canScan === true;
}

export type VisibilityDeepLinkSearch = {
  unit: string;
  satellite: string;
  region: string;
};

/** Deep-link search params for INT → Visibility Matrix navigation. */
export function buildVisibilityDeepLinkSearch(
  unitId: string,
  satelliteName: string,
): VisibilityDeepLinkSearch | null {
  const entry = findGeoSatelliteEntry(satelliteName);
  if (!entry) return null;
  return {
    unit: unitId,
    satellite: entry.sat.name,
    region: entry.regionId,
  };
}

/**
 * Master visibility lookup — INT Repository MUST call this (never recompute locally).
 */
export function resolveMatrixVisibility(unitId: string, satelliteName: string): VisibilityMatrixSnapshot | null {
  const entry = findGeoSatelliteEntry(satelliteName);
  if (!entry) return null;
  const { sat, regionId } = entry;
  const { total, beams } = getBeamBreakdown(sat);
  const visible = getVisibleBeams(unitId, sat.id, regionId);
  return {
    satelliteName,
    unitId,
    regionId,
    satelliteId: sat.id,
    totalBeamCount: total,
    beamInventory: beams,
    beamsVisibleToUnit: visible,
    canScan: visible.length > 0,
    source: "visibility_matrix",
  };
}

function inventoryLineMatchesUnitVisibleBeams(inventoryLabel: string, visible: string[]): boolean {
  const l = inventoryLabel.toLowerCase();
  for (const v of visible) {
    const vl = v.toLowerCase();
    if (l.includes("ku") && vl.includes("ku")) return true;
    if (l.includes("ka") && vl.includes("ka")) return true;
    if ((l.includes("c-band") || l.includes("c band")) && (vl.includes("c-band") || vl.includes("c band")))
      return true;
    if (l.includes("regional") && vl.includes("regional")) return true;
    if (l.includes("spot") && vl.includes("spot")) return true;
    if (l.includes("wide") && vl.includes("wide")) return true;
  }
  return false;
}

/**
 * Unit-specific beam details for Priority & Allocation — derived from this unit's
 * Visible Beams in the Satellite Visibility Matrix. No leading beam count; full list.
 */
export function formatUnitBeamDetailsForAllocation(
  unitId: string,
  sat: GeoSatellite,
  regionId: string,
): string {
  const visible = getVisibleBeams(unitId, sat.id, regionId);
  if (visible.length === 0) {
    const fallback = sat.beamCoverage?.trim();
    return fallback || "—";
  }

  const { beams } = getBeamBreakdown(sat);
  const filtered = beams.filter((label) => inventoryLineMatchesUnitVisibleBeams(label, visible));
  if (filtered.length > 0) return filtered.join(", ");

  return visible.join(", ");
}

/** Infer authorized bands from matrix-visible beam labels. */
export function bandsFromVisibleBeams(beamNames: string[]): string[] {
  const bands = new Set<string>();
  for (const b of beamNames) {
    const bl = b.toLowerCase();
    if (bl.includes("ku")) bands.add("KU");
    if (bl.includes("ka")) bands.add("KA");
    if (bl.includes("c-band") || bl.includes("c band")) bands.add("C");
  }
  return Array.from(bands);
}
