import {
  exportLocalStorageModuleSnapshot,
  restoreLocalStorageModuleSnapshot,
  validateLocalStorageModuleSnapshot,
  type LocalStorageModuleSnapshotConfig,
} from "@/lib/moduleSnapshots/moduleSnapshotCommon";
import { getOperationalDataset } from "@/lib/operationalStore";

export const SERVICEABILITY_SNAPSHOT_SCHEMA = "serviceability-state-v1";

const FAULT_DETAILS_KEY = "ssacc_fault_details";

const CONFIG: LocalStorageModuleSnapshotConfig = {
  module: "serviceability",
  title: "Serviceability State",
  schema: SERVICEABILITY_SNAPSHOT_SCHEMA,
  scope: "serviceability",
  fixedStorageKeys: ["ssacc_serviceability_hidden_units"],
  storageDefaults: {
    "ssacc_serviceability_hidden_units": "[]",
  },
  restoreWarning:
    "This operation will replace the current Serviceability State with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.",
  collectOperationalExtra: (unitIds) => {
    const ds = getOperationalDataset();
    const equipment = ds.equipment.filter((item) => unitIds.has(item.unit_id));
    const equipmentIds = new Set(equipment.map((item) => item.id));
    let faultDetails: unknown[] = [];
    try {
      const raw = localStorage.getItem(FAULT_DETAILS_KEY);
      const parsed = raw ? (JSON.parse(raw) as { equipment_id?: string }[]) : [];
      faultDetails = parsed.filter((row) => row.equipment_id && equipmentIds.has(row.equipment_id));
    } catch {
      faultDetails = [];
    }
    return { equipment, faultDetails };
  },
  applyOperationalExtra: (slice) => {
    if (!Array.isArray(slice.faultDetails)) return;
    const equipmentIds = new Set((slice.equipment ?? []).map((item) => item.id));
    let kept: { equipment_id?: string }[] = [];
    try {
      const raw = localStorage.getItem(FAULT_DETAILS_KEY);
      kept = raw ? (JSON.parse(raw) as { equipment_id?: string }[]) : [];
      kept = kept.filter((row) => !row.equipment_id || !equipmentIds.has(row.equipment_id));
    } catch {
      kept = [];
    }
    localStorage.setItem(FAULT_DETAILS_KEY, JSON.stringify([...kept, ...slice.faultDetails]));
  },
};

export const exportServiceabilitySnapshot = () => exportLocalStorageModuleSnapshot(CONFIG);
export const restoreServiceabilitySnapshot = (pkg: Parameters<typeof restoreLocalStorageModuleSnapshot>[1]) =>
  restoreLocalStorageModuleSnapshot(CONFIG, pkg);
export const validateServiceabilitySnapshot = (raw: unknown) => validateLocalStorageModuleSnapshot(CONFIG, raw);
