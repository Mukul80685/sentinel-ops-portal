/**
 * INT Repository – shared data model, mock generation, filtering, and CSV utilities.
 */
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductivityStatus =
  | "productive"
  | "non-productive"
  | "partially-productive"
  | "unknown";

export const PRODUCTIVITY_LABELS: Record<ProductivityStatus, string> = {
  productive:           "Productive",
  "non-productive":     "Non-Productive",
  "partially-productive": "Partially Productive",
  unknown:              "Unknown",
};

export interface IntelUnit {
  id: string;
  code: string;
  name: string;
  location: string;
}

export interface IntelRecord {
  id: string;
  unitId: string;
  unitLabel: string;
  satellite: string;
  country: string;
  polarization: string;
  frequency: string;
  symbolRate: string;
  modulation: string;
  signalType: string;
  status: string;
  analysisSummary: string;
  operator: string;
  remarks: string;
  collectionDate: string;
  productivity: ProductivityStatus;
  archived?: boolean;
  satellite_id?: string | null;
}

export interface UnitIntelStats {
  satellitesProfiled: number;
  totalScanned: number;
  productive: number;
  nonProductive: number;
  lastUpload: string | null;
}

export interface SatelliteSummary {
  key: string;
  satellite: string;
  polarization: string;
  country: string;
  totalScanned: number;
  productive: number;
  nonProductive: number;
  partiallyProductive: number;
  unknown: number;
  latestUpdate: string | null;
  firstCollection: string | null;
  uploadCount: number;
}

export interface IntelFilter {
  q: string;
  unit: string;
  satellite: string;
  country: string;
  polarization: string;
  freqMin: string;
  freqMax: string;
  dateFrom: string;
  dateTo: string;
  productivity: ProductivityStatus | "";
  operator: string;
  signalType: string;
  status: string;
}

export const EMPTY_INTEL_FILTER: IntelFilter = {
  q: "", unit: "", satellite: "", country: "", polarization: "",
  freqMin: "", freqMax: "", dateFrom: "", dateTo: "",
  productivity: "", operator: "", signalType: "", status: "",
};

// ─── Static unit roster (A–H) ─────────────────────────────────────────────────

export const INT_UNITS: IntelUnit[] = [
  { id: "alpha",   code: "A", name: "Unit A", location: "Northern Sector" },
  { id: "bravo",   code: "B", name: "Unit B", location: "Eastern Sector" },
  { id: "charlie", code: "C", name: "Unit C", location: "Western Sector" },
  { id: "delta",   code: "D", name: "Unit D", location: "Southern Sector" },
  { id: "echo",    code: "E", name: "Unit E", location: "Central Sector" },
  { id: "foxtrot", code: "F", name: "Unit F", location: "Forward Sector" },
  { id: "golf",    code: "G", name: "Unit G", location: "Rear Sector" },
  { id: "hotel",   code: "H", name: "Unit H", location: "Coastal Sector" },
];

export const UNIT_LABELS = INT_UNITS.map((u) => u.name);

// ─── Seeded randomness ────────────────────────────────────────────────────────

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

// ─── Satellite key helpers ────────────────────────────────────────────────────

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function makeSatelliteKey(satellite: string, polarization: string): string {
  return `${slugify(satellite)}__${slugify(polarization)}`;
}

export function parseSatelliteKey(key: string): { satellite: string; polarization: string } | null {
  const idx = key.indexOf("__");
  if (idx < 0) return null;
  const satSlug = key.slice(0, idx);
  const polSlug = key.slice(idx + 2);
  return {
    satellite: satSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    polarization: polSlug.toUpperCase(),
  };
}

export function displaySatelliteName(key: string, records: IntelRecord[]): string {
  const parsed = parseSatelliteKey(key);
  if (records.length > 0) return records[0].satellite;
  return parsed?.satellite ?? key;
}

export function displayPolarization(key: string, records: IntelRecord[]): string {
  const parsed = parseSatelliteKey(key);
  if (records.length > 0) return records[0].polarization;
  return parsed?.polarization ?? "—";
}

// ─── Productivity classification ──────────────────────────────────────────────

export function classifyProductivity(
  isProductive: boolean | null | undefined,
  summary?: string | null,
  analysis?: string | null,
): ProductivityStatus {
  const text = `${summary ?? ""} ${analysis ?? ""}`.toLowerCase();
  if (text.includes("partial")) return "partially-productive";
  if (isProductive === true) return "productive";
  if (isProductive === false) return "non-productive";
  if (summary || analysis) return "productive";
  return "unknown";
}

export function productivityColor(p: ProductivityStatus): string {
  switch (p) {
    case "productive":           return "text-emerald-400";
    case "non-productive":       return "text-muted-foreground";
    case "partially-productive": return "text-amber-400";
    default:                     return "text-sky-400";
  }
}

// ─── DB row normalisation ─────────────────────────────────────────────────────

export function normalizeDbRow(row: Record<string, unknown>, unitLabel = "—"): IntelRecord {
  const satellites = row.satellites as { name?: string } | null;
  const units = row.units as { code?: string } | null;
  const summary = String(row.summary ?? "");
  const analysis = String(row.analysis_report ?? "");
  return {
    id:              String(row.id),
    unitId:          String(row.unit_id ?? ""),
    unitLabel:       units?.code ?? unitLabel,
    satellite:       satellites?.name ?? "Unknown Satellite",
    country:         String(row.source ?? "—"),
    polarization:    String(row.band ?? "KU-H"),
    frequency:       String(row.frequency ?? "—"),
    symbolRate:      String((row as Record<string, unknown>).symbol_rate ?? "—"),
    modulation:      String((row as Record<string, unknown>).modulation ?? "—"),
    signalType:      String(row.intel_type ?? "SIGINT"),
    status:          String(row.activity_level ?? "—"),
    analysisSummary: summary || analysis.slice(0, 120) || "—",
    operator:        String(row.source ?? units?.code ?? "—"),
    remarks:         String(row.analyst_remarks ?? row.key_findings ?? "—"),
    collectionDate:  String(row.observation_date ?? row.created_at ?? ""),
    productivity:    classifyProductivity(
      row.is_productive as boolean | null,
      summary,
      analysis,
    ),
    satellite_id:    row.satellite_id as string | null,
  };
}

// ─── Mock satellite profiles per unit ─────────────────────────────────────────

const MOCK_SAT_PROFILES: { satellite: string; country: string; polarization: string; baseCount: number }[] = [
  { satellite: "ChinaSat 6B",  country: "China",       polarization: "KU-H", baseCount: 84 },
  { satellite: "Apstar 7",     country: "China",       polarization: "KU-V", baseCount: 52 },
  { satellite: "PAKSAT-1R",    country: "Pakistan",    polarization: "KU-H", baseCount: 68 },
  { satellite: "Turksat 4A",   country: "Turkey",      polarization: "KU-V", baseCount: 45 },
  { satellite: "Bangabandhu-1",country: "Bangladesh",  polarization: "KU-H", baseCount: 38 },
  { satellite: "Thaicom 8",    country: "Southeast Asia", polarization: "KU-V", baseCount: 56 },
  { satellite: "Arabsat 6A",   country: "Middle East", polarization: "C-H",  baseCount: 72 },
  { satellite: "Astra 1M",     country: "Europe",      polarization: "KU-H", baseCount: 41 },
  { satellite: "Yamal 601",      country: "Russia",      polarization: "KU-V", baseCount: 63 },
  { satellite: "Intelsat 29e", country: "USA",         polarization: "C-V",  baseCount: 55 },
  { satellite: "Measat-3a",    country: "Southeast Asia", polarization: "KU-H", baseCount: 47 },
  { satellite: "Nilesat 201",  country: "Middle East", polarization: "KU-V", baseCount: 39 },
  { satellite: "Eutelsat 7B",  country: "Europe",      polarization: "KU-H", baseCount: 44 },
  { satellite: "Express AM6",  country: "Russia",      polarization: "C-H",  baseCount: 51 },
];

const MODULATIONS = ["QPSK", "8PSK", "16APSK", "BPSK", "OQPSK"];
const SIGNAL_TYPES = ["SIGINT", "COMINT", "ELINT", "TECHINT"];
const STATUSES = ["Active", "Intermittent", "Dormant", "Confirmed", "Unverified"];
const OPERATORS = ["Analyst-1", "Analyst-2", "Op-Sig-3", "Op-Sig-7", "Collection Team"];

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Generate deterministic mock records for a unit. */
export function generateMockIntelRecords(unitId: string, unitLabel: string): IntelRecord[] {
  const rand = seedRand(unitId + "intel-mock");
  const records: IntelRecord[] = [];
  let serial = 0;

  // Each unit gets a subset of satellites (varies by unit)
  const unitIdx = INT_UNITS.findIndex((u) => u.id === unitId);
  const profileOffset = unitIdx >= 0 ? unitIdx : 0;

  MOCK_SAT_PROFILES.forEach((profile, pi) => {
    if ((pi + profileOffset) % 3 === 2 && unitIdx > 0) return; // vary per unit

    const count = profile.baseCount + Math.floor(rand() * 20) - 10;
    const productiveRatio = 0.25 + rand() * 0.2;
    const partialRatio = 0.05 + rand() * 0.05;

    for (let i = 0; i < count; i++) {
      serial++;
      const r = rand();
      let productivity: ProductivityStatus;
      if (r < productiveRatio) productivity = "productive";
      else if (r < productiveRatio + partialRatio) productivity = "partially-productive";
      else if (r < 0.92) productivity = "non-productive";
      else productivity = "unknown";

      const daysAgo = Math.floor(rand() * 365);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      const freqBase = profile.polarization.startsWith("C") ? 3700 : 11700;
      const frequency = `${(freqBase + rand() * 800).toFixed(3)} MHz`;

      records.push({
        id:              `mock-${unitId}-${profile.satellite.replace(/\s/g, "")}-${i}`,
        unitId,
        unitLabel,
        satellite:       profile.satellite,
        country:         profile.country,
        polarization:    profile.polarization,
        frequency,
        symbolRate:      `${(2 + rand() * 30).toFixed(2)} Msps`,
        modulation:      MODULATIONS[Math.floor(rand() * MODULATIONS.length)],
        signalType:      SIGNAL_TYPES[Math.floor(rand() * SIGNAL_TYPES.length)],
        status:          STATUSES[Math.floor(rand() * STATUSES.length)],
        analysisSummary: productivity === "productive"
          ? `Confirmed signal activity on ${frequency}`
          : productivity === "partially-productive"
            ? `Partial signal detection — requires follow-up`
            : productivity === "non-productive"
              ? `No usable signal detected`
              : `Awaiting analysis`,
        operator:        OPERATORS[Math.floor(rand() * OPERATORS.length)],
        remarks:         rand() > 0.7 ? "Follow-up collection recommended" : "—",
        collectionDate:  formatDate(date),
        productivity,
      });
    }
  });

  return records;
}

// ─── Local storage for imported records ─────────────────────────────────────

const LS_PREFIX = "intel-repo-imports-";

export function loadImportedRecords(unitId: string): IntelRecord[] {
  try {
    const raw = localStorage.getItem(LS_PREFIX + unitId);
    return raw ? (JSON.parse(raw) as IntelRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveImportedRecords(unitId: string, records: IntelRecord[]): void {
  localStorage.setItem(LS_PREFIX + unitId, JSON.stringify(records));
}

export function mergeRecords(
  dbRows: IntelRecord[],
  unitId: string,
  unitLabel: string,
  useMockWhenEmpty = true,
): IntelRecord[] {
  const imported = loadImportedRecords(unitId);
  const combined = [...dbRows, ...imported];

  if (combined.length > 0) return combined;
  if (useMockWhenEmpty) return generateMockIntelRecords(unitId, unitLabel);
  return [];
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function computeUnitStats(records: IntelRecord[]): UnitIntelStats {
  const satellites = new Set(records.map((r) => r.satellite));
  const productive = records.filter((r) => r.productivity === "productive").length;
  const nonProductive = records.filter((r) => r.productivity === "non-productive").length;
  const dates = records.map((r) => r.collectionDate).filter(Boolean).sort();
  return {
    satellitesProfiled: satellites.size,
    totalScanned: records.length,
    productive,
    nonProductive,
    lastUpload: dates.length > 0 ? dates[dates.length - 1] : null,
  };
}

export function groupBySatellite(records: IntelRecord[]): SatelliteSummary[] {
  const groups = new Map<string, IntelRecord[]>();

  for (const r of records) {
    const key = makeSatelliteKey(r.satellite, r.polarization);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  return Array.from(groups.entries()).map(([key, recs]) => {
    const dates = recs.map((r) => r.collectionDate).filter(Boolean).sort();
    const uploadDates = new Set(dates);
    return {
      key,
      satellite:       recs[0].satellite,
      polarization:    recs[0].polarization,
      country:         recs[0].country,
      totalScanned:    recs.length,
      productive:      recs.filter((r) => r.productivity === "productive").length,
      nonProductive:   recs.filter((r) => r.productivity === "non-productive").length,
      partiallyProductive: recs.filter((r) => r.productivity === "partially-productive").length,
      unknown:         recs.filter((r) => r.productivity === "unknown").length,
      latestUpdate:    dates.length > 0 ? dates[dates.length - 1] : null,
      firstCollection: dates.length > 0 ? dates[0] : null,
      uploadCount:     uploadDates.size,
    };
  }).sort((a, b) => a.satellite.localeCompare(b.satellite));
}

export function computeSatelliteHealth(records: IntelRecord[]) {
  const productive = records.filter((r) => r.productivity === "productive").length;
  const nonProductive = records.filter((r) => r.productivity === "non-productive").length;
  const partiallyProductive = records.filter((r) => r.productivity === "partially-productive").length;
  const unknown = records.filter((r) => r.productivity === "unknown").length;
  const total = records.length;
  const successRate = total > 0 ? Math.round((productive / total) * 100) : 0;
  const dates = records.map((r) => r.collectionDate).filter(Boolean).sort();
  const uploadDates = new Set(dates);

  return {
    totalScanned: total,
    productive,
    nonProductive,
    partiallyProductive,
    unknown,
    successRate,
    firstCollection: dates[0] ?? null,
    latestCollection: dates[dates.length - 1] ?? null,
    uploadCount: uploadDates.size,
    totalRecords: total,
  };
}

// ─── Filtering & search ───────────────────────────────────────────────────────

function parseFreqMHz(freq: string): number | null {
  const m = freq.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

export function applyIntelFilter(records: IntelRecord[], f: IntelFilter): IntelRecord[] {
  const q = f.q.trim().toLowerCase();

  return records.filter((r) => {
    if (f.unit && r.unitLabel !== f.unit && r.unitId !== f.unit) return false;
    if (f.satellite && !r.satellite.toLowerCase().includes(f.satellite.toLowerCase())) return false;
    if (f.country && !r.country.toLowerCase().includes(f.country.toLowerCase())) return false;
    if (f.polarization && r.polarization.toLowerCase() !== f.polarization.toLowerCase()) return false;
    if (f.productivity && r.productivity !== f.productivity) return false;
    if (f.operator && !r.operator.toLowerCase().includes(f.operator.toLowerCase())) return false;
    if (f.signalType && r.signalType !== f.signalType) return false;
    if (f.status && !r.status.toLowerCase().includes(f.status.toLowerCase())) return false;
    if (f.dateFrom && r.collectionDate < f.dateFrom) return false;
    if (f.dateTo && r.collectionDate > f.dateTo) return false;

    if (f.freqMin || f.freqMax) {
      const fv = parseFreqMHz(r.frequency);
      if (fv !== null) {
        if (f.freqMin && fv < parseFloat(f.freqMin)) return false;
        if (f.freqMax && fv > parseFloat(f.freqMax)) return false;
      }
    }

    if (q) {
      const hay = [
        r.satellite, r.frequency, r.operator, r.remarks,
        r.analysisSummary, r.unitLabel, r.polarization, r.modulation,
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return !r.archived;
  });
}

export function isFilterActive(f: IntelFilter): boolean {
  return Object.entries(f).some(([, v]) => v !== "");
}

// ─── CSV import ───────────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  satellite:       ["satellite", "sat", "satellite name"],
  polarization:    ["polarization", "pol", "band", "polarity"],
  frequency:       ["frequency", "freq", "rf"],
  symbolRate:      ["symbol rate", "symbol_rate", "sym rate", "s/r"],
  modulation:      ["modulation", "mod"],
  signalType:      ["signal type", "signal_type", "intel type", "type"],
  status:          ["status", "activity", "activity level"],
  analysisSummary: ["analysis summary", "summary", "analysis", "analysis_report"],
  operator:        ["operator", "analyst", "source", "collector"],
  remarks:         ["remarks", "notes", "analyst remarks", "comments"],
  collectionDate:  ["date", "date of collection", "observation date", "collection date"],
  productivity:    ["productivity", "productive", "classification", "result"],
  country:         ["country", "region", "nation"],
  unitLabel:       ["unit", "agency"],
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]/g, " ");
}

function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normed = headers.map(normHeader);

  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const alias of aliases) {
      const idx = normed.indexOf(alias);
      if (idx >= 0) { map[field] = idx; break; }
    }
  }
  return map;
}

function parseProductivityCell(val: string): ProductivityStatus {
  const v = val.trim().toLowerCase();
  if (v.includes("partial")) return "partially-productive";
  if (v.includes("non") || v === "no" || v === "false" || v === "0") return "non-productive";
  if (v.includes("prod") || v === "yes" || v === "true" || v === "1") return "productive";
  return "unknown";
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export function parseIntelCsv(
  text: string,
  unitId: string,
  unitLabel: string,
): IntelRecord[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const colMap = mapHeaders(headers);
  const records: IntelRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;

    const get = (field: string) => {
      const idx = colMap[field];
      return idx !== undefined ? cells[idx]?.trim() ?? "" : "";
    };

    const productivityRaw = get("productivity");
    records.push({
      id:              `import-${unitId}-${Date.now()}-${i}`,
      unitId,
      unitLabel:       get("unitLabel") || unitLabel,
      satellite:       get("satellite") || "Unknown",
      country:         get("country") || "—",
      polarization:    get("polarization") || "KU-H",
      frequency:       get("frequency") || "—",
      symbolRate:      get("symbolRate") || "—",
      modulation:      get("modulation") || "—",
      signalType:      get("signalType") || "SIGINT",
      status:          get("status") || "—",
      analysisSummary: get("analysisSummary") || "—",
      operator:        get("operator") || "—",
      remarks:         get("remarks") || "—",
      collectionDate:  get("collectionDate") || formatDate(new Date()),
      productivity:    productivityRaw
        ? parseProductivityCell(productivityRaw)
        : "unknown",
    });
  }

  return records;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

export const EXPORT_HEADERS = [
  "Serial Number", "Date of Collection", "Satellite", "Polarization",
  "Frequency", "Symbol Rate", "Modulation", "Signal Type", "Status",
  "Analysis Summary", "Unit", "Operator", "Remarks", "Productivity",
];

export function recordsToExportRows(records: IntelRecord[]): (string | number)[][] {
  return records.map((r, i) => [
    i + 1,
    r.collectionDate,
    r.satellite,
    r.polarization,
    r.frequency,
    r.symbolRate,
    r.modulation,
    r.signalType,
    r.status,
    r.analysisSummary,
    r.unitLabel,
    r.operator,
    r.remarks,
    PRODUCTIVITY_LABELS[r.productivity],
  ]);
}

export { formatDisplayDate };

// ─── Interim repository entry model ──────────────────────────────────────────

/** A satellite entry that exists due to an active engagement but has no uploaded data yet. */
export interface InterimRepoEntry extends SatelliteSummary {
  isInterim: true;
  /** Engagement status driving this entry (e.g. "In Progress", "Planned") */
  engagementStatus: string;
  /** Supabase satellite UUID, used for visibility lookups */
  satelliteDbId: string;
}

export type RepoEntry = (SatelliteSummary & { isInterim?: false; satelliteDbId?: string }) | InterimRepoEntry;

/** Returns true if a repo entry has no uploaded scan data. */
export function isEmptyEntry(e: RepoEntry): boolean {
  return e.isInterim === true || e.uploadCount === 0;
}

// ─── LocalStorage: per-satellite upload metadata ─────────────────────────────

const LS_SAT_META_PREFIX = "intel-sat-meta-";

interface SatUploadMeta {
  hasData: boolean;
  lastUpload: string | null;
}

export function loadSatMeta(unitId: string, satelliteKey: string): SatUploadMeta {
  try {
    const raw = localStorage.getItem(`${LS_SAT_META_PREFIX}${unitId}-${satelliteKey}`);
    return raw ? JSON.parse(raw) : { hasData: false, lastUpload: null };
  } catch {
    return { hasData: false, lastUpload: null };
  }
}

export function saveSatMeta(unitId: string, satelliteKey: string, meta: SatUploadMeta): void {
  localStorage.setItem(`${LS_SAT_META_PREFIX}${unitId}-${satelliteKey}`, JSON.stringify(meta));
}

// ─── Band → polarization mapping ─────────────────────────────────────────────

/** Convert a DB beam band (C, Ku, Ka, S, L) to the INT Repository polarization options. */
export function bandToPolarizations(band: string): string[] {
  const b = band.trim().toUpperCase();
  if (b === "KU") return ["KU-H", "KU-V"];
  if (b === "C")  return ["C-H",  "C-V"];
  if (b === "KA") return ["KA-H", "KA-V"];
  if (b === "S")  return ["S-H",  "S-V"];
  if (b === "L")  return ["L-H",  "L-V"];
  return [`${b}-H`, `${b}-V`];
}

// ─── XLSX / CSV file parsing ──────────────────────────────────────────────────

/** Accepted upload MIME types and extensions. */
export const ACCEPTED_FILE_TYPES = ".csv,.xlsx,.xls";

export function validateUploadFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["csv", "xlsx", "xls"].includes(ext)) {
    return "Invalid format. Only CSV or Excel (.xlsx / .xls) files allowed.";
  }
  return null;
}

/** Parse a CSV text string into IntelRecord[]. Wraps existing parseIntelCsv. */
export function parseCsvFile(text: string, unitId: string, unitLabel: string): IntelRecord[] {
  return parseIntelCsv(text, unitId, unitLabel);
}

/** Parse an XLSX/XLS file buffer into IntelRecord[]. */
export function parseXlsxFile(buffer: ArrayBuffer, unitId: string, unitLabel: string): IntelRecord[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
  return parseIntelCsv(csv, unitId, unitLabel);
}

/** Read a File and parse it into IntelRecord[], returning a Promise. */
export function parseUploadedFile(
  file: File,
  unitId: string,
  unitLabel: string,
): Promise<IntelRecord[]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const reader = new FileReader();

    if (ext === "csv") {
      reader.onload = (e) => {
        const text = e.target?.result as string;
        resolve(parseCsvFile(text, unitId, unitLabel));
      };
      reader.onerror = () => reject(new Error("Failed to read CSV file"));
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        const buf = e.target?.result as ArrayBuffer;
        try {
          resolve(parseXlsxFile(buf, unitId, unitLabel));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read XLSX file"));
      reader.readAsArrayBuffer(file);
    }
  });
}
