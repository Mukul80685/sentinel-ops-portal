import {
  getOperationalDataset,
  persistOperationalDataset,
  rebindAndPersistUnitEngagements,
} from "@/lib/operationalStore";
import type {
  OpEngagement,
  OpEquipment,
  OpIntelRow,
  OpSatellite,
  OpUnit,
  OperationalDataset,
} from "@/lib/operationalDataset";
import { filterUnitsForModule, unhideUnitInModule } from "@/lib/moduleUnitRegistry";
import { MODULE_UNITS_EVENT } from "@/lib/moduleUnitRegistry";
import { INTEL_CELL_EDITS_EVENT } from "@/lib/intelCellStore";
import { INTEL_FREQ_EVENT } from "@/lib/intelFrequencyActions";
import { SCAN_HISTORY_KEY } from "@/lib/scanHistoryStore";
import { UNIT_IDENTITY_OVERRIDES_KEY } from "@/lib/operationalConstants";
import {
  SNAPSHOT_FORMAT_VERSION,
  type ModuleSnapshotPackage,
  type SnapshotValidationResult,
} from "@/lib/moduleSnapshots/types";
import {
  collectLocalStorageByPrefix,
  collectLocalStorageKeys,
  computeSnapshotChecksum,
  mergeById,
  parseJsonValue,
  removeLocalStorageByPrefix,
  removeLocalStorageKeys,
} from "@/lib/moduleSnapshots/utils";

export const INTEL_SNAPSHOT_SCHEMA = "intel-repository-v1";

const INTEL_FIXED_STORAGE_KEYS = [
  "ssacc_intel_cell_edits",
  "ssacc_intel_freq_actions",
  "ssacc_intel_important_refs",
  "ssacc_intel_discarded_refs",
  "ssacc_intel_analysis_queue",
  "ssacc_intel_allocations",
  "ssacc_intel_integrity_overrides",
  "ssacc_intel_hidden_units",
  SCAN_HISTORY_KEY,
  UNIT_IDENTITY_OVERRIDES_KEY,
] as const;

const INTEL_DYNAMIC_PREFIXES = [
  "intel-repo-imports-",
  "intel-sat-meta-",
  "intel-scan-overrides-",
  "intel-setup-",
  "intel-suppressed-sats-",
  "intel-suppressed-rows-",
] as const;

const REQUIRED_STORAGE_KEYS = [
  "ssacc_intel_cell_edits",
  "ssacc_intel_freq_actions",
  "ssacc_intel_important_refs",
  "ssacc_intel_discarded_refs",
  "ssacc_intel_analysis_queue",
  "ssacc_intel_allocations",
] as const;

type IntelOperationalSlice = {
  intelRows: OpIntelRow[];
  engagements: OpEngagement[];
  satellites: OpSatellite[];
  units: OpUnit[];
  equipment: OpEquipment[];
};

function collectIntelOperationalSlice(): IntelOperationalSlice {
  const ds = getOperationalDataset();
  const visibleUnits = filterUnitsForModule(ds.units, "intel");
  const visibleUnitIds = new Set(visibleUnits.map((unit) => unit.id));

  // Backup all intel rows — including units hidden from the module UI.
  const intelRows = ds.intelRows ?? [];
  const affectedUnitIds = new Set([
    ...visibleUnitIds,
    ...intelRows.map((row) => row.unit_id),
  ]);

  const units = ds.units.filter((unit) => affectedUnitIds.has(unit.id));
  const unitIds = new Set(units.map((unit) => unit.id));

  const scopedIntelRows = intelRows.filter((row) => unitIds.has(row.unit_id));
  const engagements = ds.engagements.filter((engagement) => unitIds.has(engagement.unit_id));
  const equipment = ds.equipment.filter((item) => unitIds.has(item.unit_id));

  const satelliteIds = new Set<string>();
  for (const row of scopedIntelRows) satelliteIds.add(row.satellite_id);
  for (const engagement of engagements) satelliteIds.add(engagement.satellite_id);

  const satellites = ds.satellites.filter((satellite) => satelliteIds.has(satellite.id));

  return {
    intelRows: scopedIntelRows,
    engagements,
    satellites,
    units,
    equipment,
  };
}

const INTEL_STORAGE_DEFAULTS: Record<string, string> = {
  "ssacc_intel_cell_edits": "{}",
  "ssacc_intel_freq_actions": "{}",
  "ssacc_intel_important_refs": "[]",
  "ssacc_intel_discarded_refs": "[]",
  "ssacc_intel_analysis_queue": "[]",
  "ssacc_intel_allocations": "[]",
  "ssacc_intel_integrity_overrides": "{}",
  "ssacc_intel_hidden_units": "[]",
  [SCAN_HISTORY_KEY]: "{}",
  [UNIT_IDENTITY_OVERRIDES_KEY]: "{}",
};

function collectIntelStorage(): Record<string, string> {
  const storage = {
    ...collectLocalStorageKeys(INTEL_FIXED_STORAGE_KEYS),
    ...collectLocalStorageByPrefix(INTEL_DYNAMIC_PREFIXES),
  };

  for (const [key, defaultValue] of Object.entries(INTEL_STORAGE_DEFAULTS)) {
    if (!(key in storage)) storage[key] = defaultValue;
  }

  return storage;
}

export function exportIntelSnapshot(): ModuleSnapshotPackage {
  const exportedAt = new Date().toISOString();
  const storage = collectIntelStorage();
  const operational = collectIntelOperationalSlice();
  const checksum = computeSnapshotChecksum({
    module: "intel",
    schema: INTEL_SNAPSHOT_SCHEMA,
    exported_at: exportedAt,
    storage,
    operational,
  });

  return {
    snapshot_version: SNAPSHOT_FORMAT_VERSION,
    module: "intel",
    module_title: "Intelligence Repository",
    schema: INTEL_SNAPSHOT_SCHEMA,
    exported_at: exportedAt,
    storage,
    operational,
    checksum,
  };
}

function purgeIntelLocalStorage(): void {
  removeLocalStorageKeys(INTEL_FIXED_STORAGE_KEYS);
  removeLocalStorageByPrefix(INTEL_DYNAMIC_PREFIXES);
}

function applyIntelOperationalSlice(slice: IntelOperationalSlice): void {
  const ds = getOperationalDataset();
  const unitIds = new Set([
    ...slice.engagements.map((engagement) => engagement.unit_id),
    ...slice.intelRows.map((row) => row.unit_id),
    ...slice.equipment.map((item) => item.unit_id),
  ]);

  const next: OperationalDataset = {
    ...ds,
    intelRows: [
      ...ds.intelRows.filter((row) => !unitIds.has(row.unit_id)),
      ...slice.intelRows,
    ],
    units: mergeById(ds.units, slice.units),
    satellites: mergeById(ds.satellites, slice.satellites),
    equipment:
      slice.equipment.length > 0
        ? [
            ...ds.equipment.filter((item) => !unitIds.has(item.unit_id)),
            ...slice.equipment,
          ]
        : ds.equipment,
    engagements: [
      ...ds.engagements.filter((engagement) => !unitIds.has(engagement.unit_id)),
      ...slice.engagements,
    ],
    userManaged: true,
  };

  persistOperationalDataset(next);

  for (const unitId of unitIds) {
    unhideUnitInModule(unitId, "intel");
    rebindAndPersistUnitEngagements(unitId);
  }
}

function writeIntelStorage(storage: Record<string, string>): void {
  for (const [key, value] of Object.entries(storage)) {
    localStorage.setItem(key, value);
  }
}

function dispatchIntelRestoreEvents(): void {
  window.dispatchEvent(new Event(OPERATIONAL_STORE_EVENT));
  window.dispatchEvent(new Event(INTEL_FREQ_EVENT));
  window.dispatchEvent(new Event(INTEL_CELL_EDITS_EVENT));
  window.dispatchEvent(new CustomEvent(MODULE_UNITS_EVENT, { detail: { scope: "intel" } }));
}

export function restoreIntelSnapshot(pkg: ModuleSnapshotPackage): void {
  if (pkg.module !== "intel" || pkg.schema !== INTEL_SNAPSHOT_SCHEMA) {
    throw new Error("Snapshot is not compatible with Intelligence Repository.");
  }

  purgeIntelLocalStorage();

  const slice = pkg.operational as IntelOperationalSlice;
  applyIntelOperationalSlice(slice);
  writeIntelStorage(pkg.storage);
  dispatchIntelRestoreEvents();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateOperationalSlice(value: unknown): IntelOperationalSlice | null {
  if (!isRecord(value)) return null;
  const intelRows = value.intelRows;
  const engagements = value.engagements;
  const satellites = value.satellites;
  const units = value.units;
  const equipment = value.equipment;
  if (
    !Array.isArray(intelRows) ||
    !Array.isArray(engagements) ||
    !Array.isArray(satellites) ||
    !Array.isArray(units)
  ) {
    return null;
  }
  return {
    intelRows: intelRows as OpIntelRow[],
    engagements: engagements as OpEngagement[],
    satellites: satellites as OpSatellite[],
    units: units as OpUnit[],
    equipment: Array.isArray(equipment) ? (equipment as OpEquipment[]) : [],
  };
}

function validateReferentialIntegrity(slice: IntelOperationalSlice): string | null {
  const unitIds = new Set(slice.units.map((unit) => unit.id));
  const satelliteIds = new Set(slice.satellites.map((satellite) => satellite.id));

  for (const row of slice.intelRows) {
    if (!isNonEmptyString(row.id)) return "Intel row is missing a stable ID.";
    if (!unitIds.has(row.unit_id)) {
      return `Intel row "${row.id}" references a unit that is not present in the snapshot.`;
    }
    if (!satelliteIds.has(row.satellite_id)) {
      return `Intel row "${row.id}" references a satellite that is not present in the snapshot.`;
    }
  }

  for (const engagement of slice.engagements) {
    if (!isNonEmptyString(engagement.id)) return "Engagement record is missing a stable ID.";
    if (!unitIds.has(engagement.unit_id)) {
      return `Engagement "${engagement.id}" references a unit that is not present in the snapshot.`;
    }
    if (!satelliteIds.has(engagement.satellite_id)) {
      return `Engagement "${engagement.id}" references a satellite that is not present in the snapshot.`;
    }
    const hwIds = [
      engagement.antenna_id,
      engagement.demodulator_id,
      engagement.processing_server_id,
    ].filter((id): id is string => isNonEmptyString(id));
    if (slice.equipment.length > 0) {
      const equipmentIds = new Set(slice.equipment.map((item) => item.id));
      for (const hwId of hwIds) {
        if (!equipmentIds.has(hwId)) {
          return `Engagement "${engagement.id}" references equipment "${hwId}" that is not present in the snapshot.`;
        }
      }
    }
  }

  return null;
}

function validateStorageSchema(storage: Record<string, string>): string | null {
  for (const key of REQUIRED_STORAGE_KEYS) {
    if (!(key in storage)) {
      return `Snapshot is missing required table: ${key}`;
    }
    parseJsonValue(storage[key], key);
  }

  for (const [key, raw] of Object.entries(storage)) {
    const isFixed = (INTEL_FIXED_STORAGE_KEYS as readonly string[]).includes(key);
    const isDynamic = INTEL_DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix));
    if (!isFixed && !isDynamic) {
      return `Snapshot contains an unexpected storage key: ${key}`;
    }
    parseJsonValue(raw, key);
  }

  return null;
}

export function validateIntelSnapshot(raw: unknown): SnapshotValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, error: "Invalid snapshot file. Expected a JSON object." };
  }

  if (raw.snapshot_version !== SNAPSHOT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported snapshot version "${String(raw.snapshot_version)}". Expected ${SNAPSHOT_FORMAT_VERSION}.`,
    };
  }

  if (raw.module !== "intel") {
    return {
      ok: false,
      error: "This snapshot does not belong to the Intelligence Repository module.",
    };
  }

  if (raw.schema !== INTEL_SNAPSHOT_SCHEMA) {
    return {
      ok: false,
      error: `Incompatible snapshot schema "${String(raw.schema)}". Expected ${INTEL_SNAPSHOT_SCHEMA}.`,
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

  const storageError = validateStorageSchema(storage);
  if (storageError) return { ok: false, error: storageError };

  const operational = validateOperationalSlice(raw.operational);
  if (!operational) {
    return { ok: false, error: "Snapshot is missing required operational tables (units, satellites, engagements, intel rows)." };
  }

  const integrityError = validateReferentialIntegrity(operational);
  if (integrityError) return { ok: false, error: integrityError };

  const checksum = computeSnapshotChecksum({
    module: "intel",
    schema: INTEL_SNAPSHOT_SCHEMA,
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
      module: "intel",
      module_title: "Intelligence Repository",
      schema: INTEL_SNAPSHOT_SCHEMA,
      exported_at: raw.exported_at,
      storage,
      operational,
      checksum,
    },
  };
}

export const INTEL_RESTORE_WARNING =
  "This operation will replace the current Intelligence Repository with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.";

/** Test helper — validates export → restore round-trip shape without browser storage. */
export function validateIntelSnapshotSelfContainment(pkg: ModuleSnapshotPackage): string | null {
  const result = validateIntelSnapshot(pkg);
  if (!result.ok) return result.error;
  return validateReferentialIntegrity(pkg.operational as IntelOperationalSlice);
}
