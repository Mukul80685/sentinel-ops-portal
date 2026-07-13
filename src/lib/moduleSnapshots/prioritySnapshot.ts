import {
  exportLocalStorageModuleSnapshot,
  restoreLocalStorageModuleSnapshot,
  validateLocalStorageModuleSnapshot,
  type LocalStorageModuleSnapshotConfig,
} from "@/lib/moduleSnapshots/moduleSnapshotCommon";
import { PRIORITY_ALLOCATION_EVENT } from "@/lib/priorityAllocation";

export const PRIORITY_SNAPSHOT_SCHEMA = "priority-allocation-v1";

const CONFIG: LocalStorageModuleSnapshotConfig = {
  module: "priority",
  title: "Satellite Priority & Allocation",
  schema: PRIORITY_SNAPSHOT_SCHEMA,
  scope: "priority",
  fixedStorageKeys: [
    "ssacc_priority_user_allocations",
    "ssacc_priority_suppressed_sats",
    "ssacc_priority_p_overrides",
    "ssacc_priority_hidden_units",
  ],
  storageDefaults: {
    "ssacc_priority_user_allocations": "{}",
    "ssacc_priority_suppressed_sats": "{}",
    "ssacc_priority_p_overrides": "{}",
    "ssacc_priority_hidden_units": "[]",
  },
  restoreWarning:
    "This operation will replace the current Satellite Priority & Allocation data with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.",
  extraRestoreEvents: [PRIORITY_ALLOCATION_EVENT],
};

export const exportPrioritySnapshot = () => exportLocalStorageModuleSnapshot(CONFIG);
export const restorePrioritySnapshot = (pkg: Parameters<typeof restoreLocalStorageModuleSnapshot>[1]) =>
  restoreLocalStorageModuleSnapshot(CONFIG, pkg);
export const validatePrioritySnapshot = (raw: unknown) => validateLocalStorageModuleSnapshot(CONFIG, raw);
