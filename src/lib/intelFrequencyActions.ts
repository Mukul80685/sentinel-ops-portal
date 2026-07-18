/**
 * INT frequency actions — flags, audit trail, cross-module references (local/mock).
 */
import { hasIntelData, getUnitIntelName } from "@/lib/intelAnalysisData";
import { INT_UNITS } from "@/lib/intelRepository";
import { evaluateFrequencyAllocationEligibility } from "@/lib/intelIntegrity";
import { computeBottleneckEngagement, fetchAllEngagements, buildAllocatedIds } from "@/lib/engagementEngine";

export const INTEL_FREQ_EVENT = "ssacc-intel-freq-update";

export type FrequencySection = "productive" | "non_productive";

export type FrequencyActionType =
  | "mark_important"
  | "clear_important"
  | "allocate_unit"
  | "clear_allocation"
  | "discard"
  | "restore_frequency"
  | "request_tech_analysis"
  | "clear_tech_analysis"
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
  satelliteName?: string;
  frequencyId?: string;
  beamName?: string;
  frequencyBand?: string;
  auditLog: AuditEntry[];
};

export type DiscardedFreqRef = {
  id: string;
  refKey: string;
  frequencyId: string;
  satelliteName: string;
  beamName?: string;
  band?: string;
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
  beamName?: string;
  band?: string;
  polarization?: string;
  createdAt: string;
  notes: string;
};

export type AnalysisQueueEntry = {
  id: string;
  refKey: string;
  frequencyId: string;
  satelliteName: string;
  beamName?: string;
  band?: string;
  sourceUnitId?: string;
  requestedAt: string;
  status: "ANALYSIS_REQUESTED";
  userLabel: string;
};

export type AllocationRecord = {
  id: string;
  refKey: string;
  frequencyId: string;
  satelliteName: string;
  beamName: string;
  band: string;
  fromUnitId: string;
  toUnitId: string;
  toUnitLabel: string;
  allocatedAt: string;
  userLabel: string;
};

const STORAGE_ACTIONS = "ssacc_intel_freq_actions";
const STORAGE_IMPORTANT = "ssacc_intel_important_refs";
const STORAGE_DISCARDED = "ssacc_intel_discarded_refs";
const STORAGE_ANALYSIS_QUEUE = "ssacc_intel_analysis_queue";
const STORAGE_ALLOCATIONS = "ssacc_intel_allocations";
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

/** Parse a frequency action key produced by {@link frequencyKey}. */
export function parseFrequencyKey(key: string): {
  reportId: string;
  section: FrequencySection;
  frequencyId: string;
} | null {
  const first = key.indexOf("::");
  if (first === -1) return null;
  const second = key.indexOf("::", first + 2);
  if (second === -1) return null;
  const section = key.slice(first + 2, second) as FrequencySection;
  if (section !== "productive" && section !== "non_productive") return null;
  return {
    reportId: key.slice(0, first),
    section,
    frequencyId: key.slice(second + 2),
  };
}

const MANUAL_IMPORTANT_DISCARD_PREFIX = "__manual__important__";

export type ImportantEntryDiscardInput = {
  /** INT repository ref key when the row originated from Productive / Non-Productive tables. */
  refKey?: string;
  /** Local Important Frequencies store id (non-INT manual entries). */
  storedId?: string;
  frequency: string;
  satelliteName: string;
  unitLabel?: string;
  beamName?: string;
  band?: string;
  notes?: string;
};

/**
 * Remove a row from Important Frequencies and archive it in Discarded Frequencies.
 * INT-linked rows are also marked discarded so they disappear from the INT repository tables.
 */
export function removeImportantFrequencyEntry(
  userLabel: string,
  entry: ImportantEntryDiscardInput,
): FrequencyActionState | null {
  const reason = "Removed from Important Frequencies — moved to Discarded";

  if (entry.refKey && !entry.refKey.startsWith(MANUAL_IMPORTANT_DISCARD_PREFIX)) {
    const parsed = parseFrequencyKey(entry.refKey);
    const impRef = getImportantFrequencyRefs().find((r) => r.refKey === entry.refKey);
    const reportId = parsed?.reportId ?? impRef?.sourceReportId;
    const sourceUnitId = reportId?.includes("__") ? reportId.split("__")[0] : undefined;

    return discardFrequency(entry.refKey, userLabel, {
      frequencyId: impRef?.frequency ?? parsed?.frequencyId ?? entry.frequency,
      satelliteName: impRef?.satelliteName ?? entry.satelliteName,
      section: parsed?.section ?? "productive",
      sourceUnitId,
      beamName: impRef?.beamName ?? entry.beamName,
      band: impRef?.band ?? entry.band ?? entry.unitLabel,
      reason,
    });
  }

  const key =
    entry.refKey ??
    `${MANUAL_IMPORTANT_DISCARD_PREFIX}${entry.storedId ?? crypto.randomUUID()}`;

  return discardFrequency(key, userLabel, {
    frequencyId: entry.frequency,
    satelliteName: entry.satelliteName,
    section: "productive",
    band: entry.band ?? entry.unitLabel,
    beamName: entry.beamName,
    reason: entry.notes ? `${reason} · ${entry.notes}` : reason,
  });
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
  meta: {
    frequency: string;
    satelliteName: string;
    unitLabel: string;
    reportId: string;
    userLabel: string;
    sourceUnitId?: string;
    beamName?: string;
    band?: string;
    polarization?: string;
    notes?: string;
  },
): FrequencyActionState {
  let state = getFrequencyState(key);
  if (state.flags.important) {
    return state;
  }
  state = {
    ...state,
    flags: { ...state.flags, important: true },
    scannedByUnitId: meta.sourceUnitId ?? state.scannedByUnitId,
    satelliteName: meta.satelliteName,
    frequencyId: meta.frequency,
    beamName: meta.beamName ?? state.beamName,
    frequencyBand: meta.band ?? state.frequencyBand,
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
      beamName: meta.beamName,
      band: meta.band,
      polarization: meta.polarization,
      createdAt: new Date().toISOString(),
      notes: meta.notes ?? `INT ref · ${meta.reportId}`,
    });
    saveJson(STORAGE_IMPORTANT, refs);
    emitUpdate();
  }

  setFrequencyState(key, state);
  return state;
}

export function clearImportant(key: string, userLabel: string): FrequencyActionState {
  let state = getFrequencyState(key);
  if (!state.flags.important) return state;

  state = {
    ...state,
    flags: { ...state.flags, important: false },
  };
  state = appendAudit(state, {
    action: "clear_important",
    userLabel,
    note: "Removed from Important Frequencies",
  });

  const refs = loadJson<ImportantFreqRef[]>(STORAGE_IMPORTANT, []).filter((r) => r.refKey !== key);
  saveJson(STORAGE_IMPORTANT, refs);
  setFrequencyState(key, state);
  emitUpdate();
  return state;
}

export function allocateToUnit(
  key: string,
  targetUnitId: string,
  userLabel: string,
  meta: {
    scannedByUnitId?: string;
    satelliteName: string;
    frequencyId: string;
    beamName: string;
    band: string;
  },
): FrequencyActionState {
  const unitLabel = getUnitIntelName(targetUnitId);
  let state = getFrequencyState(key);
  state = {
    ...state,
    flags: { ...state.flags, allocated: true },
    allocatedToUnitId: targetUnitId,
    allocatedToUnitLabel: unitLabel,
    scannedByUnitId: meta.scannedByUnitId ?? state.scannedByUnitId,
    satelliteName: meta.satelliteName,
    frequencyId: meta.frequencyId,
    beamName: meta.beamName,
    frequencyBand: meta.band,
  };
  state = appendAudit(state, {
    action: "allocate_unit",
    userLabel,
    unitId: targetUnitId,
    unitLabel,
    note: `Beam: ${meta.beamName}`,
  });
  setFrequencyState(key, state);

  const allocs = loadJson<AllocationRecord[]>(STORAGE_ALLOCATIONS, []);
  allocs.unshift({
    id: crypto.randomUUID(),
    refKey: key,
    frequencyId: meta.frequencyId,
    satelliteName: meta.satelliteName,
    beamName: meta.beamName,
    band: meta.band,
    fromUnitId: meta.scannedByUnitId ?? "",
    toUnitId: targetUnitId,
    toUnitLabel: unitLabel,
    allocatedAt: new Date().toISOString(),
    userLabel,
  });
  saveJson(STORAGE_ALLOCATIONS, allocs);
  emitUpdate();

  return state;
}

export function clearAllocation(key: string, userLabel: string): FrequencyActionState {
  let state = getFrequencyState(key);
  if (!state.flags.allocated) return state;

  state = {
    ...state,
    flags: { ...state.flags, allocated: false },
    allocatedToUnitId: undefined,
    allocatedToUnitLabel: undefined,
  };
  state = appendAudit(state, {
    action: "clear_allocation",
    userLabel,
    note: "Unit allocation removed",
  });
  setFrequencyState(key, state);

  const allocs = loadJson<AllocationRecord[]>(STORAGE_ALLOCATIONS, []).filter((a) => a.refKey !== key);
  saveJson(STORAGE_ALLOCATIONS, allocs);
  emitUpdate();
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
    beamName?: string;
    band?: string;
  },
): FrequencyActionState {
  let state = getFrequencyState(key);
  if (state.flags.discarded) return state;

  const impRefs = loadJson<ImportantFreqRef[]>(STORAGE_IMPORTANT, []);
  const wasImportant = state.flags.important || impRefs.some((r) => r.refKey === key);
  if (impRefs.some((r) => r.refKey === key)) {
    saveJson(STORAGE_IMPORTANT, impRefs.filter((r) => r.refKey !== key));
  }

  state = {
    ...state,
    flags: { ...state.flags, discarded: true, important: false },
    satelliteName: meta?.satelliteName ?? state.satelliteName,
    frequencyId: meta?.frequencyId ?? state.frequencyId,
    beamName: meta?.beamName ?? state.beamName,
    frequencyBand: meta?.band ?? state.frequencyBand,
  };
  const note = meta?.reason ?? "Removed from active analytical consideration";
  state = appendAudit(state, { action: "discard", userLabel, note });
  if (wasImportant) {
    state = appendAudit(state, {
      action: "clear_important",
      userLabel,
      note: "Removed from Important Frequencies",
    });
  }
  setFrequencyState(key, state);

  if (meta) {
    const refs = purgeExpiredDiscards(loadJson<DiscardedFreqRef[]>(STORAGE_DISCARDED, []));
    if (!refs.some((r) => r.refKey === key)) {
      refs.unshift({
        id: crypto.randomUUID(),
        refKey: key,
        frequencyId: meta.frequencyId,
        satelliteName: meta.satelliteName,
        beamName: meta.beamName,
        band: meta.band,
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

export function restoreFrequency(key: string, userLabel: string): FrequencyActionState {
  let state = getFrequencyState(key);
  if (!state.flags.discarded) return state;

  state = {
    ...state,
    flags: { ...state.flags, discarded: false },
  };
  state = appendAudit(state, {
    action: "restore_frequency",
    userLabel,
    note: "Restored to active INT repository",
  });
  setFrequencyState(key, state);

  const refs = purgeExpiredDiscards(loadJson<DiscardedFreqRef[]>(STORAGE_DISCARDED, [])).filter(
    (r) => r.refKey !== key,
  );
  saveJson(STORAGE_DISCARDED, refs);
  emitUpdate();
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
  meta?: {
    sourceUnitId?: string;
    frequencyId?: string;
    satelliteName?: string;
    beamName?: string;
    band?: string;
  },
): FrequencyActionState {
  let state = getFrequencyState(key);
  if (state.flags.techAnalysis) return state;

  state = {
    ...state,
    flags: { ...state.flags, techAnalysis: true },
    scannedByUnitId: meta?.sourceUnitId ?? state.scannedByUnitId,
    satelliteName: meta?.satelliteName ?? state.satelliteName,
    frequencyId: meta?.frequencyId ?? state.frequencyId,
    beamName: meta?.beamName ?? state.beamName,
    frequencyBand: meta?.band ?? state.frequencyBand,
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
      beamName: meta?.beamName,
      band: meta?.band,
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

export function clearTechnicalAnalysis(key: string, userLabel: string): FrequencyActionState {
  let state = getFrequencyState(key);
  if (!state.flags.techAnalysis) return state;

  state = {
    ...state,
    flags: { ...state.flags, techAnalysis: false },
  };
  state = appendAudit(state, {
    action: "clear_tech_analysis",
    userLabel,
    note: "Technical analysis removed",
  });

  const queue = loadJson<AnalysisQueueEntry[]>(STORAGE_ANALYSIS_QUEUE, []);
  const filtered = queue.filter((q) => q.refKey !== key);
  if (filtered.length !== queue.length) {
    saveJson(STORAGE_ANALYSIS_QUEUE, filtered);
  }

  setFrequencyState(key, state);
  return state;
}

export function getAllocationRecords(): AllocationRecord[] {
  return loadJson<AllocationRecord[]>(STORAGE_ALLOCATIONS, []);
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
    case "clear_important":
      return "Removed from Important Frequencies";
    case "request_tech_analysis":
      return "Detailed Analysis Requested";
    case "clear_tech_analysis":
      return "Technical Analysis Removed";
    case "clear_allocation":
      return "Allocation Removed";
    case "discard":
      return "Discarded";
    case "restore_frequency":
      return "Restored to Repository";
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

export type FrequencyCurrentStatus =
  | "normal"
  | "important"
  | "discarded"
  | "detailed_analysis_requested";

/** Derived status for a frequency action record (single source of truth in flags + audit). */
export function getFrequencyCurrentStatus(key: string): FrequencyCurrentStatus {
  const { flags } = getFrequencyState(key);
  if (flags.discarded) return "discarded";
  if (flags.techAnalysis) return "detailed_analysis_requested";
  if (flags.important) return "important";
  return "normal";
}

export type EligibleUnit = {
  unitId: string;
  code: string;
  name: string;
  reason: string;
  matchingBeams: string[];
  band: string;
};

/** Units with matrix beam+band visibility + engagement capacity for this frequency. */
export async function getEligibleAllocationUnits(
  satelliteName: string,
  frequencyId: string,
  dbUnits: { id: string; code: string; name: string }[],
  allEngagements: any[],
  equipmentFetcher: (dbUnitId: string) => Promise<any[]>,
): Promise<EligibleUnit[]> {
  const eligible: EligibleUnit[] = [];
  const NON_OP = new Set(["Non-Serviceable", "Under Repair", "Partially Serviceable"]);

  for (const intelUnit of INT_UNITS) {
    if (!hasIntelData(intelUnit.id)) continue;

    const visibility = evaluateFrequencyAllocationEligibility(satelliteName, intelUnit.id, frequencyId);
    if (!visibility.eligible) continue;

    const db = dbUnits.find((u) => u.code === intelUnit.code);
    const dbId = db?.id;
    if (!dbId) continue;

    const unitEng = allEngagements.filter((e: any) => e.unit_id === dbId);
    const equipment = await equipmentFetcher(dbId);
    const hasOperational = equipment.some((e: any) => e.serviceability === "Operational");
    const allFaulty = equipment.length > 0 && equipment.every((e: any) => NON_OP.has(e.serviceability));
    const resourcesServiceable = equipment.length === 0 ? true : hasOperational && !allFaulty;

    const activeEngs = unitEng.filter((e: any) => e.status === "In Progress" || e.status === "Paused");
    const allocatedIds = buildAllocatedIds(activeEngs);
    const { pct } = computeBottleneckEngagement(equipment, allocatedIds);
    const hasCapacity = pct < 100 && resourcesServiceable;

    if (hasCapacity) {
      eligible.push({
        unitId: intelUnit.id,
        code: db.code,
        name: db.name,
        reason: `${visibility.reason} · Capacity ${100 - pct}%`,
        matchingBeams: visibility.matchingBeams,
        band: visibility.band,
      });
    }
  }

  return eligible;
}

function rekeyFrequencyActionStates(
  oldReportId: string,
  newReportId: string,
  newSatelliteName: string,
): boolean {
  const all = loadJson<Record<string, FrequencyActionState>>(STORAGE_ACTIONS, {});
  const next: Record<string, FrequencyActionState> = {};
  let changed = false;

  for (const [key, state] of Object.entries(all)) {
    if (key === `__report__${oldReportId}`) {
      next[`__report__${newReportId}`] = { ...state, satelliteName: newSatelliteName };
      changed = true;
      continue;
    }
    const parsed = parseFrequencyKey(key);
    if (parsed?.reportId === oldReportId) {
      const newKey = frequencyKey(newReportId, parsed.frequencyId, parsed.section);
      next[newKey] = { ...state, satelliteName: newSatelliteName };
      changed = true;
      continue;
    }
    next[key] = state;
  }

  if (changed) saveJson(STORAGE_ACTIONS, next);
  return changed;
}

function patchRefSatelliteName<T extends { refKey: string; satelliteName: string; sourceReportId?: string }>(
  rows: T[],
  oldReportId: string,
  newReportId: string,
  newSatelliteName: string,
): T[] {
  return rows.map((row) => {
    const refMatches = row.refKey.includes(oldReportId);
    const sourceMatches = row.sourceReportId === oldReportId;
    if (!refMatches && !sourceMatches) return row;
    return {
      ...row,
      refKey: refMatches ? row.refKey.replaceAll(oldReportId, newReportId) : row.refKey,
      sourceReportId: sourceMatches ? newReportId : row.sourceReportId,
      satelliteName: sourceMatches || refMatches ? newSatelliteName : row.satelliteName,
    };
  });
}

/** Re-key frequency action stores when an INT unit table row is renamed. */
export function migrateIntelFrequencyReportId(
  oldReportId: string,
  newReportId: string,
  newSatelliteName: string,
): void {
  if (typeof window === "undefined" || oldReportId === newReportId) return;

  let changed = rekeyFrequencyActionStates(oldReportId, newReportId, newSatelliteName);

  const important = patchRefSatelliteName(
    loadJson<ImportantFreqRef[]>(STORAGE_IMPORTANT, []),
    oldReportId,
    newReportId,
    newSatelliteName,
  );
  const importantBefore = loadJson<ImportantFreqRef[]>(STORAGE_IMPORTANT, []);
  if (JSON.stringify(important) !== JSON.stringify(importantBefore)) {
    saveJson(STORAGE_IMPORTANT, important);
    changed = true;
  }

  const discarded = patchRefSatelliteName(
    loadJson<DiscardedFreqRef[]>(STORAGE_DISCARDED, []),
    oldReportId,
    newReportId,
    newSatelliteName,
  );
  const discardedBefore = loadJson<DiscardedFreqRef[]>(STORAGE_DISCARDED, []);
  if (JSON.stringify(discarded) !== JSON.stringify(discardedBefore)) {
    saveJson(STORAGE_DISCARDED, discarded);
    changed = true;
  }

  const queue = patchRefSatelliteName(
    loadJson<AnalysisQueueEntry[]>(STORAGE_ANALYSIS_QUEUE, []),
    oldReportId,
    newReportId,
    newSatelliteName,
  );
  const queueBefore = loadJson<AnalysisQueueEntry[]>(STORAGE_ANALYSIS_QUEUE, []);
  if (JSON.stringify(queue) !== JSON.stringify(queueBefore)) {
    saveJson(STORAGE_ANALYSIS_QUEUE, queue);
    changed = true;
  }

  const allocations = patchRefSatelliteName(
    loadJson<AllocationRecord[]>(STORAGE_ALLOCATIONS, []),
    oldReportId,
    newReportId,
    newSatelliteName,
  );
  const allocationsBefore = loadJson<AllocationRecord[]>(STORAGE_ALLOCATIONS, []);
  if (JSON.stringify(allocations) !== JSON.stringify(allocationsBefore)) {
    saveJson(STORAGE_ALLOCATIONS, allocations);
    changed = true;
  }

  const overrides = loadJson<Record<string, boolean>>(STORAGE_OVERRIDES, {});
  if (overrides[oldReportId]) {
    overrides[newReportId] = true;
    delete overrides[oldReportId];
    saveJson(STORAGE_OVERRIDES, overrides);
    changed = true;
  }

  if (changed) emitUpdate();
}

export { fetchAllEngagements };
