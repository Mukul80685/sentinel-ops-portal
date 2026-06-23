/**
 * INT frequency actions — flags, audit trail, cross-module references (local/mock).
 */
import { INT_UNITS } from "@/lib/intelRepository";
import type { IntelLinkageContext } from "@/lib/intelAnalysisData";
import { buildIntelLinkageContext, hasIntelData } from "@/lib/intelAnalysisData";
import { polarizationToBand } from "@/lib/intelIntegrity";
import { computeBottleneckEngagement, fetchAllEngagements, buildAllocatedIds } from "@/lib/engagementEngine";

export const INTEL_FREQ_EVENT = "ssacc-intel-freq-update";

export type FrequencySection = "productive" | "non_productive";

export type FrequencyActionType =
  | "mark_important"
  | "allocate_unit"
  | "discard"
  | "request_tech_analysis"
  | "admin_override";

export type FrequencyFlags = {
  important: boolean;
  allocated: boolean;
  techAnalysis: boolean;
  discarded: boolean;
};

export type AuditEntry = {
  id: string;
  action: FrequencyActionType;
  timestamp: string;
  displayTime: string;
  unitId?: string;
  unitLabel?: string;
  userLabel: string;
  note?: string;
};

export type FrequencyActionState = {
  flags: FrequencyFlags;
  allocatedToUnitId?: string;
  allocatedToUnitLabel?: string;
  auditLog: AuditEntry[];
};

export type ImportantFreqRef = {
  id: string;
  refKey: string;
  frequency: string;
  satelliteName: string;
  unitLabel: string;
  sourceReportId: string;
  createdAt: string;
  notes: string;
};

const STORAGE_ACTIONS = "ssacc_intel_freq_actions";
const STORAGE_IMPORTANT = "ssacc_intel_important_refs";
const STORAGE_OVERRIDES = "ssacc_intel_integrity_overrides";

function emitUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(INTEL_FREQ_EVENT));
  }
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function frequencyKey(reportId: string, freqId: string, section: FrequencySection): string {
  return `${reportId}::${section}::${freqId}`;
}

function formatAuditTime(d = new Date()): string {
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " IST";
}

function appendAudit(
  state: FrequencyActionState,
  entry: Omit<AuditEntry, "id" | "timestamp" | "displayTime">,
): FrequencyActionState {
  const now = new Date();
  return {
    ...state,
    auditLog: [
      {
        id: crypto.randomUUID(),
        timestamp: now.toISOString(),
        displayTime: formatAuditTime(now),
        ...entry,
      },
      ...state.auditLog,
    ],
  };
}

export function getFrequencyState(key: string): FrequencyActionState {
  const all = loadJson<Record<string, FrequencyActionState>>(STORAGE_ACTIONS, {});
  return all[key] ?? { flags: { important: false, allocated: false, techAnalysis: false, discarded: false }, auditLog: [] };
}

function setFrequencyState(key: string, state: FrequencyActionState) {
  const all = loadJson<Record<string, FrequencyActionState>>(STORAGE_ACTIONS, {});
  all[key] = state;
  saveJson(STORAGE_ACTIONS, all);
  emitUpdate();
}

export function markImportant(
  key: string,
  meta: { frequency: string; satelliteName: string; unitLabel: string; reportId: string; userLabel: string },
): FrequencyActionState {
  let state = getFrequencyState(key);
  state = { ...state, flags: { ...state.flags, important: true } };
  state = appendAudit(state, { action: "mark_important", userLabel: meta.userLabel, note: "Added to Important Frequencies" });

  const refs = loadJson<ImportantFreqRef[]>(STORAGE_IMPORTANT, []);
  if (!refs.some((r) => r.refKey === key)) {
    refs.unshift({
      id: crypto.randomUUID(),
      refKey: key,
      frequency: meta.frequency,
      satelliteName: meta.satelliteName,
      unitLabel: meta.unitLabel,
      sourceReportId: meta.reportId,
      createdAt: new Date().toISOString(),
      notes: `INT ref · ${meta.reportId}`,
    });
    saveJson(STORAGE_IMPORTANT, refs);
  }

  setFrequencyState(key, state);
  return state;
}

export function allocateToUnit(
  key: string,
  targetUnitId: string,
  userLabel: string,
): FrequencyActionState {
  const unit = INT_UNITS.find((u) => u.id === targetUnitId);
  let state = getFrequencyState(key);
  state = {
    ...state,
    flags: { ...state.flags, allocated: true },
    allocatedToUnitId: targetUnitId,
    allocatedToUnitLabel: unit ? `Unit ${unit.code}` : targetUnitId,
  };
  state = appendAudit(state, {
    action: "allocate_unit",
    userLabel,
    unitId: targetUnitId,
    unitLabel: unit ? `Unit ${unit.code}` : targetUnitId,
  });
  setFrequencyState(key, state);
  return state;
}

export function discardFrequency(key: string, userLabel: string): FrequencyActionState {
  let state = getFrequencyState(key);
  state = { ...state, flags: { ...state.flags, discarded: true } };
  state = appendAudit(state, { action: "discard", userLabel, note: "Removed from active analytical consideration" });
  setFrequencyState(key, state);
  return state;
}

export function requestTechnicalAnalysis(key: string, userLabel: string): FrequencyActionState {
  let state = getFrequencyState(key);
  state = { ...state, flags: { ...state.flags, techAnalysis: true } };
  state = appendAudit(state, {
    action: "request_tech_analysis",
    userLabel,
    note: "Flagged for deeper processing",
  });
  setFrequencyState(key, state);
  return state;
}

export function formatAuditShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function getAuditActionLabel(entry: AuditEntry): string {
  switch (entry.action) {
    case "allocate_unit":
      return `Allocated to ${entry.unitLabel ?? "Unit"}`;
    case "mark_important":
      return "Added to Important Frequencies";
    case "request_tech_analysis":
      return "Technical Analysis Requested";
    case "discard":
      return "Discarded";
    case "admin_override":
      return "Admin Override";
    default:
      return entry.action.replace(/_/g, " ");
  }
}

export function logAdminOverride(reportId: string, userLabel: string, note: string) {
  const key = `__report__${reportId}`;
  let state = getFrequencyState(key);
  state = appendAudit(state, { action: "admin_override", userLabel, note });
  setFrequencyState(key, state);
  const overrides = loadJson<Record<string, boolean>>(STORAGE_OVERRIDES, {});
  overrides[reportId] = true;
  saveJson(STORAGE_OVERRIDES, overrides);
}

export function hasIntegrityOverride(reportId: string): boolean {
  const overrides = loadJson<Record<string, boolean>>(STORAGE_OVERRIDES, {});
  return !!overrides[reportId];
}

export function getImportantFrequencyRefs(): ImportantFreqRef[] {
  return loadJson<ImportantFreqRef[]>(STORAGE_IMPORTANT, []);
}

export type EligibleUnit = {
  unitId: string;
  code: string;
  name: string;
  reason: string;
};

/** Units with engagement capacity + visibility for satellite/band */
export async function getEligibleAllocationUnits(
  satelliteName: string,
  scanBand: string,
  dbUnits: { id: string; code: string; name: string }[],
  allEngagements: any[],
  visibilityFetcher: (dbUnitId: string) => Promise<any[]>,
  equipmentFetcher: (dbUnitId: string) => Promise<any[]>,
): Promise<EligibleUnit[]> {
  const eligible: EligibleUnit[] = [];

  for (const intelUnit of INT_UNITS) {
    if (!hasIntelData(intelUnit.id)) continue;
    const db = dbUnits.find((u) => u.code === intelUnit.code);
    const dbId = db?.id;
    if (!dbId) continue;

    const unitEng = allEngagements.filter((e: any) => e.unit_id === dbId);
    const visibilityRows = await visibilityFetcher(dbId);
    const equipment = await equipmentFetcher(dbId);
    const ctx = buildIntelLinkageContext(intelUnit.id, unitEng, visibilityRows, equipment);

    const matrixBands = ctx.visibilityBySatName.get(satelliteName) ?? [];
    const bands = matrixBands.map((p) => polarizationToBand(p));
    const hasVisibility = bands.includes(scanBand) || matrixBands.length === 0;

    const activeEngs = unitEng.filter((e: any) => e.status === "In Progress" || e.status === "Paused");
    const allocatedIds = buildAllocatedIds(activeEngs);
    const { pct } = computeBottleneckEngagement(equipment, allocatedIds);
    const hasCapacity = pct < 100 && ctx.resourcesServiceable;

    if (hasVisibility && hasCapacity) {
      eligible.push({
        unitId: intelUnit.id,
        code: intelUnit.code,
        name: intelUnit.name,
        reason: `Capacity ${100 - pct}% · ${scanBand}-band visible`,
      });
    }
  }

  return eligible;
}

export { fetchAllEngagements };
