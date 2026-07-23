/**
 * Offline EXE persistence — mirrors browser localStorage to userData on disk so
 * upgrades (and port/origin changes) do not wipe operational data.
 */

import { OPERATIONAL_STORE_KEY, OPERATIONAL_STORE_EVENT } from "@/lib/operationalConstants";
import { invalidateOperationalStoreCache } from "@/lib/operationalStore";
import { INTEL_CELL_EDITS_EVENT } from "@/lib/intelCellStore";
import { PRIORITY_ALLOCATION_EVENT } from "@/lib/priorityAllocation";

const DISK_SNAPSHOT_MARKER = "ssacc_disk_snapshot_at";
const RESTORE_MARKER = "ssacc_snapshot_restored_at";

type ElectronPersistApi = {
  read: () => Promise<PersistEnvelope | null>;
  write: (payload: PersistEnvelope) => Promise<boolean>;
};

type PersistEnvelope = {
  savedAt: string;
  data: Record<string, string>;
};

function persistApi(): ElectronPersistApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as Window & { ssaccPersist?: ElectronPersistApi }).ssaccPersist;
  return api ?? null;
}

export function isElectronPersistAvailable(): boolean {
  return persistApi() !== null;
}

let storageReadyPromise: Promise<void> | null = null;
let resolveStorageReady: (() => void) | null = null;

function ensureStorageReadyPromise(): Promise<void> {
  if (!isElectronPersistAvailable()) return Promise.resolve();
  if (!storageReadyPromise) {
    storageReadyPromise = new Promise<void>((resolve) => {
      resolveStorageReady = resolve;
    });
  }
  return storageReadyPromise;
}

/** Resolves after disk → localStorage hydration (no-op on web). */
export function whenElectronStorageReady(): Promise<void> {
  return ensureStorageReadyPromise();
}

function markElectronStorageReady(): void {
  resolveStorageReady?.();
  resolveStorageReady = null;
}

const STORAGE_READY_TIMEOUT_MS = 8000;

function collectLocalStorageSnapshot(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

function applyLocalStorageSnapshot(data: Record<string, string>): void {
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") localStorage.setItem(key, value);
  }
}

/** Full replace — used after reinstall/port change when the origin partition is empty. */
function replaceLocalStorageSnapshot(data: Record<string, string>): void {
  localStorage.clear();
  applyLocalStorageSnapshot(data);
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced write of all localStorage keys to disk (Electron userData). */
export function scheduleElectronStorageFlush(delayMs = 400): void {
  const api = persistApi();
  if (!api) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushElectronStorage();
  }, delayMs);
}

export async function flushElectronStorage(): Promise<void> {
  const api = persistApi();
  if (!api || typeof window === "undefined") return;

  const savedAt = new Date().toISOString();
  const data = collectLocalStorageSnapshot();
  data[DISK_SNAPSHOT_MARKER] = savedAt;

  const ok = await api.write({ savedAt, data });
  if (!ok) {
    throw new Error("Failed to persist application data to disk.");
  }
  localStorage.setItem(DISK_SNAPSHOT_MARKER, savedAt);
}

/**
 * Restore localStorage from disk when the browser partition is empty (e.g. after
 * reinstall or origin/port change). Never overwrites an existing user-managed store
 * unless local storage is missing the operational dataset entirely.
 */
export async function hydrateElectronStorage(): Promise<boolean> {
  const api = persistApi();
  if (!api || typeof window === "undefined") return false;

  const envelope = await api.read();
  if (!envelope?.data || typeof envelope.data !== "object") return false;

  const diskAt = envelope.savedAt ?? envelope.data[DISK_SNAPSHOT_MARKER] ?? "";
  const localStoreRaw = localStorage.getItem(OPERATIONAL_STORE_KEY);
  const localMarker = localStorage.getItem(DISK_SNAPSHOT_MARKER);

  let localUserManaged = false;
  if (localStoreRaw) {
    try {
      localUserManaged = !!(JSON.parse(localStoreRaw) as { userManaged?: boolean }).userManaged;
    } catch {
      localUserManaged = false;
    }
  }

  const diskHasStore = !!envelope.data[OPERATIONAL_STORE_KEY];
  if (!diskHasStore) return false;

  const restoredAt = localStorage.getItem(RESTORE_MARKER);
  const diskRestoredAt = envelope.data[RESTORE_MARKER] ?? "";

  // In-memory snapshot restore wins over disk until a successful flush copies it to userData.
  if (restoredAt && localUserManaged) {
    if (!diskRestoredAt || restoredAt >= diskRestoredAt) {
      return false;
    }
  }

  const localMissingStore = !localStoreRaw;
  const diskIsNewer = !!diskAt && (!localMarker || diskAt > localMarker);

  if (localMissingStore) {
    replaceLocalStorageSnapshot(envelope.data);
    invalidateOperationalStoreCache();
    if (diskAt) localStorage.setItem(DISK_SNAPSHOT_MARKER, diskAt);
    return true;
  }

  if (localUserManaged && !diskIsNewer) return false;

  if (diskIsNewer) {
    applyLocalStorageSnapshot(envelope.data);
    invalidateOperationalStoreCache();
    localStorage.setItem(DISK_SNAPSHOT_MARKER, diskAt);
    return true;
  }

  return false;
}

export function installElectronPersistenceHooks(): () => void {
  if (!isElectronPersistAvailable() || typeof window === "undefined") return () => {};

  const onBeforeUnload = () => {
    void flushElectronStorage();
  };

  const onStorage = (event: StorageEvent) => {
    if (!event.key) return;
    scheduleElectronStorageFlush();
  };

  const onOperationalChange = () => scheduleElectronStorageFlush();
  const onIntelCellEdits = () => scheduleElectronStorageFlush();
  const onPriorityChange = () => scheduleElectronStorageFlush();

  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("storage", onStorage);
  window.addEventListener(OPERATIONAL_STORE_EVENT, onOperationalChange);
  window.addEventListener(INTEL_CELL_EDITS_EVENT, onIntelCellEdits);
  window.addEventListener(PRIORITY_ALLOCATION_EVENT, onPriorityChange);

  const interval = window.setInterval(() => scheduleElectronStorageFlush(0), 60_000);

  return () => {
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(OPERATIONAL_STORE_EVENT, onOperationalChange);
    window.removeEventListener(INTEL_CELL_EDITS_EVENT, onIntelCellEdits);
    window.removeEventListener(PRIORITY_ALLOCATION_EVENT, onPriorityChange);
    window.clearInterval(interval);
    if (flushTimer) clearTimeout(flushTimer);
  };
}

/** Call after module snapshot restore — ensures reload reads from disk if origin resets. */
export async function finalizeSnapshotRestore(): Promise<void> {
  invalidateOperationalStoreCache();
  const restoredAt = new Date().toISOString();
  localStorage.setItem(RESTORE_MARKER, restoredAt);
  await flushElectronStorage();
}

export function bootstrapElectronStorage(): () => void {
  if (!isElectronPersistAvailable() || typeof window === "undefined") {
    markElectronStorageReady();
    return () => {};
  }

  let disposeHooks = () => {};
  const timeout = window.setTimeout(() => {
    console.warn("[electronPersist] hydration timed out — continuing startup");
    markElectronStorageReady();
  }, STORAGE_READY_TIMEOUT_MS);

  void (async () => {
    try {
      await hydrateElectronStorage();
      disposeHooks = installElectronPersistenceHooks();
    } catch (error) {
      console.error("[electronPersist] hydration failed", error);
    } finally {
      window.clearTimeout(timeout);
      markElectronStorageReady();
    }
  })();

  return () => disposeHooks();
}
