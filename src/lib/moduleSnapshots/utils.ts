import type { ModuleSnapshotId } from "@/lib/moduleSnapshots/types";
import { formatAdminExportStamp } from "@/lib/adminExportNaming";

export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

export function collectLocalStorageByPrefix(prefixes: readonly string[]): Record<string, string> {
  const storage: Record<string, string> = {};
  if (typeof window === "undefined") return storage;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      const value = localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    }
  }
  return storage;
}

export function collectLocalStorageKeys(keys: readonly string[]): Record<string, string> {
  const storage: Record<string, string> = {};
  if (typeof window === "undefined") return storage;

  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value !== null) storage[key] = value;
  }
  return storage;
}

export function removeLocalStorageKeys(keys: Iterable<string>): void {
  if (typeof window === "undefined") return;
  for (const key of keys) removeLocalStorageKey(key);
}

export function removeLocalStorageKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

export function removeLocalStorageByPrefix(prefixes: readonly string[]): void {
  if (typeof window === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      toRemove.push(key);
    }
  }
  removeLocalStorageKeys(toRemove);
}

/** Stable checksum for snapshot integrity validation. */
export function computeSnapshotChecksum(payload: {
  module: ModuleSnapshotId;
  schema: string;
  exported_at: string;
  storage: Record<string, string>;
  operational: Record<string, unknown>;
}): string {
  const canonical = JSON.stringify({
    module: payload.module,
    schema: payload.schema,
    exported_at: payload.exported_at,
    storage: sortRecord(payload.storage),
    operational: payload.operational,
  });
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = (Math.imul(hash, 33) ^ canonical.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

export function snapshotFilename(prefix: string, date: Date = new Date()): string {
  return `${prefix}_${formatAdminExportStamp(date)}.snapshot.json`;
}

export function parseJsonValue(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Corrupted snapshot: ${label} is not valid JSON.`);
  }
}
