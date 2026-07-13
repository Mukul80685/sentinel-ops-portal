import type { ModuleSnapshotId, ModuleSnapshotPackage, SnapshotValidationResult } from "@/lib/moduleSnapshots/types";
import { SNAPSHOT_FORMAT_VERSION } from "@/lib/moduleSnapshots/types";
import {
  collectLocalStorageByPrefix,
  collectLocalStorageKeys,
  computeSnapshotChecksum,
  parseJsonValue,
  removeLocalStorageByPrefix,
  removeLocalStorageKeys,
} from "@/lib/moduleSnapshots/utils";
import {
  filterUnitsForModule,
  unhideUnitInModule,
  MODULE_UNITS_EVENT,
  type ModuleScope,
} from "@/lib/moduleUnitRegistry";
import {
  getOperationalDataset,
  persistOperationalDataset,
} from "@/lib/operationalStore";
import type { OpCategory, OpEquipment, OpUnit } from "@/lib/operationalDataset";
import { mergeById } from "@/lib/moduleSnapshots/utils";
import { OPERATIONAL_STORE_EVENT } from "@/lib/operationalConstants";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

type OperationalSlice = {
  units: OpUnit[];
  equipment?: OpEquipment[];
  categories?: OpCategory[];
  faultDetails?: unknown[];
};

export type LocalStorageModuleSnapshotConfig = {
  module: ModuleSnapshotId;
  title: string;
  schema: string;
  scope: ModuleScope;
  fixedStorageKeys: readonly string[];
  storageDefaults: Record<string, string>;
  dynamicPrefixes?: readonly string[];
  restoreWarning: string;
  collectOperationalExtra?: (unitIds: Set<string>) => Record<string, unknown>;
  applyOperationalExtra?: (slice: OperationalSlice, unitIds: Set<string>) => void;
  extraRestoreEvents?: readonly string[];
};

function collectStorage(config: LocalStorageModuleSnapshotConfig): Record<string, string> {
  const storage = {
    ...collectLocalStorageKeys(config.fixedStorageKeys),
    ...collectLocalStorageByPrefix(config.dynamicPrefixes ?? []),
  };
  for (const [key, defaultValue] of Object.entries(config.storageDefaults)) {
    if (!(key in storage)) storage[key] = defaultValue;
  }
  return storage;
}

function collectOperational(config: LocalStorageModuleSnapshotConfig): Record<string, unknown> {
  const ds = getOperationalDataset();
  const units = filterUnitsForModule(ds.units, config.scope);
  const unitIds = new Set(units.map((unit) => unit.id));
  const base: OperationalSlice = { units };
  const extra = config.collectOperationalExtra?.(unitIds) ?? {};
  return { ...base, ...extra };
}

function purgeStorage(config: LocalStorageModuleSnapshotConfig): void {
  removeLocalStorageKeys(config.fixedStorageKeys);
  if (config.dynamicPrefixes?.length) {
    removeLocalStorageByPrefix(config.dynamicPrefixes);
  }
}

function applyOperationalSlice(
  config: LocalStorageModuleSnapshotConfig,
  slice: OperationalSlice,
): void {
  const ds = getOperationalDataset();
  const unitIds = new Set([
    ...slice.units.map((unit) => unit.id),
    ...(slice.equipment?.map((item) => item.unit_id) ?? []),
  ]);

  const next = {
    ...ds,
    units: mergeById(ds.units, slice.units),
    userManaged: true,
  };

  if (slice.categories?.length) {
    next.categories = mergeById(ds.categories, slice.categories);
  }

  if (slice.equipment?.length) {
    next.equipment = [
      ...ds.equipment.filter((item) => !unitIds.has(item.unit_id)),
      ...slice.equipment,
    ];
  }

  persistOperationalDataset(next);

  for (const unitId of unitIds) {
    unhideUnitInModule(unitId, config.scope);
  }

  config.applyOperationalExtra?.(slice, unitIds);
}

function writeStorage(storage: Record<string, string>): void {
  for (const [key, value] of Object.entries(storage)) {
    localStorage.setItem(key, value);
  }
}

function dispatchRestoreEvents(config: LocalStorageModuleSnapshotConfig): void {
  window.dispatchEvent(new Event(OPERATIONAL_STORE_EVENT));
  window.dispatchEvent(new CustomEvent(MODULE_UNITS_EVENT, { detail: { scope: config.scope } }));
  for (const eventName of config.extraRestoreEvents ?? []) {
    window.dispatchEvent(new Event(eventName));
  }
}

function validateStorageSchema(
  config: LocalStorageModuleSnapshotConfig,
  storage: Record<string, string>,
): string | null {
  for (const key of config.fixedStorageKeys) {
    if (!(key in storage)) {
      return `Snapshot is missing required table: ${key}`;
    }
    parseJsonValue(storage[key], key);
  }

  for (const [key, raw] of Object.entries(storage)) {
    const isFixed = (config.fixedStorageKeys as readonly string[]).includes(key);
    const isDynamic = (config.dynamicPrefixes ?? []).some((prefix) => key.startsWith(prefix));
    if (!isFixed && !isDynamic) {
      return `Snapshot contains an unexpected storage key: ${key}`;
    }
    parseJsonValue(raw, key);
  }

  return null;
}

function validateOperationalSlice(value: unknown): OperationalSlice | null {
  if (!isRecord(value) || !Array.isArray(value.units)) return null;
  const equipment = value.equipment;
  const categories = value.categories;
  const faultDetails = value.faultDetails;
  return {
    units: value.units as OpUnit[],
    equipment: Array.isArray(equipment) ? (equipment as OpEquipment[]) : undefined,
    categories: Array.isArray(categories) ? (categories as OpCategory[]) : undefined,
    faultDetails: Array.isArray(faultDetails) ? faultDetails : undefined,
  };
}

export function exportLocalStorageModuleSnapshot(
  config: LocalStorageModuleSnapshotConfig,
): ModuleSnapshotPackage {
  const exportedAt = new Date().toISOString();
  const storage = collectStorage(config);
  const operational = collectOperational(config);
  const checksum = computeSnapshotChecksum({
    module: config.module,
    schema: config.schema,
    exported_at: exportedAt,
    storage,
    operational,
  });

  return {
    snapshot_version: SNAPSHOT_FORMAT_VERSION,
    module: config.module,
    module_title: config.title,
    schema: config.schema,
    exported_at: exportedAt,
    storage,
    operational,
    checksum,
  };
}

export function restoreLocalStorageModuleSnapshot(
  config: LocalStorageModuleSnapshotConfig,
  pkg: ModuleSnapshotPackage,
): void {
  if (pkg.module !== config.module || pkg.schema !== config.schema) {
    throw new Error(`Snapshot is not compatible with ${config.title}.`);
  }

  purgeStorage(config);
  const slice = validateOperationalSlice(pkg.operational);
  if (!slice) {
    throw new Error("Snapshot is missing required operational unit data.");
  }
  applyOperationalSlice(config, slice);
  writeStorage(pkg.storage);
  dispatchRestoreEvents(config);
}

export function validateLocalStorageModuleSnapshot(
  config: LocalStorageModuleSnapshotConfig,
  raw: unknown,
): SnapshotValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, error: "Invalid snapshot file. Expected a JSON object." };
  }

  if (raw.snapshot_version !== SNAPSHOT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported snapshot version "${String(raw.snapshot_version)}". Expected ${SNAPSHOT_FORMAT_VERSION}.`,
    };
  }

  if (raw.module !== config.module) {
    return { ok: false, error: `This snapshot does not belong to ${config.title}.` };
  }

  if (raw.schema !== config.schema) {
    return {
      ok: false,
      error: `Incompatible snapshot schema "${String(raw.schema)}". Expected ${config.schema}.`,
    };
  }

  if (!isNonEmptyString(raw.exported_at) || Number.isNaN(Date.parse(raw.exported_at))) {
    return { ok: false, error: "Snapshot is missing a valid export timestamp." };
  }

  if (!isRecord(raw.storage)) {
    return { ok: false, error: "Snapshot is missing its storage payload." };
  }

  const storage = Object.fromEntries(
    Object.entries(raw.storage).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  const storageError = validateStorageSchema(config, storage);
  if (storageError) return { ok: false, error: storageError };

  const operational = validateOperationalSlice(raw.operational);
  if (!operational) {
    return { ok: false, error: "Snapshot is missing required operational unit data." };
  }

  const checksum = computeSnapshotChecksum({
    module: config.module,
    schema: config.schema,
    exported_at: raw.exported_at,
    storage,
    operational,
  });

  if (typeof raw.checksum !== "string" || raw.checksum !== checksum) {
    return { ok: false, error: "Snapshot integrity check failed. The file may be corrupted or modified." };
  }

  return {
    ok: true,
    package: {
      snapshot_version: SNAPSHOT_FORMAT_VERSION,
      module: config.module,
      module_title: config.title,
      schema: config.schema,
      exported_at: raw.exported_at,
      storage,
      operational,
      checksum,
    },
  };
}
