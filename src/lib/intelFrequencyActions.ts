/**
 * INT frequency actions — flags, audit trail, cross-module references (local/mock).
 */
import { INT_UNITS } from "@/lib/intelRepository";
import type { IntelLinkageContext } from "@/lib/intelAnalysisData";
import { buildIntelLinkageContext, hasIntelData } from "@/lib/intelAnalysisData";
import { canUnitScanSatellite } from "@/lib/intelIntegrity";
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
  /** Unit that originally scanned / reported this frequency */
  scannedByUnitId?: string;
  auditLog: AuditEntry[];
};

export type DiscardedFreqRef = {
  id: string;
  refKey: string;
  frequencyId: string;
  satelliteName: string;
  classification: FrequencySection;
  sourceUnitId?: string;
  discardedAt: string;
  reason?: string;
  userLabel: string;
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

export type AnalysisQueueEntry = {
  id: string;
  refKey: string;
  frequencyId: string;
  satelliteName: string;
  sourceUnitId?: string;
  requestedAt: string;
  status: "ANALYSIS_REQUESTED";
  userLabel: string;
};

const STORAGE_ACTIONS = "ssacc_intel_freq_actions";
const STORAGE_IMPORTANT = "ssacc_intel_important_refs";
const STORAGE_DISCARDED = "ssacc_intel_discarded_refs";
const STORAGE_ANALYSIS_QUEUE = "ssacc_intel_analysis_queue";
const STORAGE_OVERRIDES = "ssacc_intel_integrity_overrides";

/** Discarded entries expire after 90 days */
const DISCARD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

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
  meta: { frequency: string; satelliteName: string; unitLabel: string; reportId: string; userLabel: string; sourceUnitId?: string },
): FrequencyActionState {
  let state = getFrequencyState(key);
  state = {
    ...state,
    flags: { ...state.flags, important: true },
    scannedByUnitId: meta.sourceUnitId ?? state.scannedByUnitId,
  };
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
    emitUpdate();
  }

  setFrequencyState(key, state);
  return state;
}

export function allocateToUnit(
  key: string,
  targetUnitId: string,
  userLabel: string,
  scannedByUnitId?: string,
): FrequencyActionState {
  const unit = INT_UNITS.find((u) => u.id === targetUnitId);
  let state = getFrequencyState(key);
  state = {
    ...state,
    flags: { ...state.flags, allocated: true },
    allocatedToUnitId: targetUnitId,
    allocatedToUnitLabel: unit ? `Unit ${unit.code}` : targetUnitId,
    scannedByUnitId: scannedByUnitId ?? state.scannedByUnitId,
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

export function discardFrequency(
  key: string,
  userLabel: string,
  meta?: {
    frequencyId: string;
    satelliteName: string;
    section: FrequencySection;
    sourceUnitId?: string;
    reason?: string;
  },
): FrequencyActionState {
  let state = getFrequencyState(key);
  state = { ...state, flags: { ...state.flags, discarded: true } };
  const note = meta?.reason ?? "Removed from active analytical consideration";
  state = appendAudit(state, { action: "discard", userLabel, note });
  setFrequencyState(key, state);

  if (meta) {
    const refs = purgeExpiredDiscards(loadJson<DiscardedFreqRef[]>(STORAGE_DISCARDED, []));
    if (!refs.some((r) => r.refKey === key)) {
      refs.unshift({
        id: crypto.randomUUID(),
        refKey: key,
        frequencyId: meta.frequencyId,
        satelliteName: meta.satelliteName,
        classification: meta.section,
        sourceUnitId: meta.sourceUnitId,
        discardedAt: new Date().toISOString(),
        reason: meta.reason,
        userLabel,
      });
      saveJson(STORAGE_DISCARDED, refs);
      emitUpdate();
    }
  }

  return state;
}

function purgeExpiredDiscards(refs: DiscardedFreqRef[]): DiscardedFreqRef[] {
  const cutoff = Date.now() - DISCARD_RETENTION_MS;
  const kept = refs.filter((r) => new Date(r.discardedAt).getTime() > cutoff);
  if (kept.length !== refs.length) {
    saveJson(STORAGE_DISCARDED, kept);
  }
  return kept;
}

export function getDiscardedFrequencyRefs(): DiscardedFreqRef[] {
  return purgeExpiredDiscards(loadJson<DiscardedFreqRef[]>(STORAGE_DISCARDED, []));
}

export function requestTechnicalAnalysis(
  key: string,
  userLabel: string,
  meta?: { sourceUnitId?: string; frequencyId?: string; satelliteName?: string },
): FrequencyActionState {
  let state = getFrequencyState(key);
  state = {
    ...state,
    flags: { ...state.flags, techAnalysis: true },
    scannedByUnitId: meta?.sourceUnitId ?? state.scannedByUnitId,
  };
  state = appendAudit(state, {
    action: "request_tech_analysis",
    userLabel,
    note: "Flagged for deeper processing",
  });

  const queue = loadJson<AnalysisQueueEntry[]>(STORAGE_ANALYSIS_QUEUE, []);
  if (!queue.some((q) => q.refKey === key)) {
    queue.unshift({
      id: crypto.randomUUID(),
      refKey: key,
      frequencyId: meta?.frequencyId ?? key,
      satelliteName: meta?.satelliteName ?? "",
      sourceUnitId: meta?.sourceUnitId,
      requestedAt: new Date().toISOString(),
      status: "ANALYSIS_REQUESTED",
      userLabel,
    });
    saveJson(STORAGE_ANALYSIS_QUEUE, queue);
    emitUpdate();
  }

  setFrequencyState(key, state);
  return state;
}

export function getAnalysisQueue(): AnalysisQueueEntry[] {
  return loadJson<AnalysisQueueEntry[]>(STORAGE_ANALYSIS_QUEUE, []);
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
    default: {
      const action = entry.action as string;
      return action.replace(/_/g, " ");
    }
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

    const hasVisibility = canUnitScanSatellite(satelliteName, intelUnit.id, ctx);

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
