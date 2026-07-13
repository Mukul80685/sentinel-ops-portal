import { VISIBILITY_OVERLAY_EVENT } from "@/lib/visibilityOverlay";
import {
  exportLocalStorageModuleSnapshot,
  restoreLocalStorageModuleSnapshot,
  validateLocalStorageModuleSnapshot,
  type LocalStorageModuleSnapshotConfig,
} from "@/lib/moduleSnapshots/moduleSnapshotCommon";

export const VISIBILITY_SNAPSHOT_SCHEMA = "visibility-matrix-v1";

const CONFIG: LocalStorageModuleSnapshotConfig = {
  module: "visibility",
  title: "Satellite Visibility Matrix",
  schema: VISIBILITY_SNAPSHOT_SCHEMA,
  scope: "visibility",
  fixedStorageKeys: [
    "ssacc_visibility_overlay",
    "ssacc_visibility_hidden_units",
  ],
  storageDefaults: {
    "ssacc_visibility_overlay": JSON.stringify({
      addedSats: {},
      editedSats: {},
      deletedSatIds: [],
    }),
    "ssacc_visibility_hidden_units": "[]",
  },
  restoreWarning:
    "This operation will replace the current Satellite Visibility Matrix with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.",
  extraRestoreEvents: [VISIBILITY_OVERLAY_EVENT],
};

export const exportVisibilitySnapshot = () => exportLocalStorageModuleSnapshot(CONFIG);
export const restoreVisibilitySnapshot = (pkg: Parameters<typeof restoreLocalStorageModuleSnapshot>[1]) =>
  restoreLocalStorageModuleSnapshot(CONFIG, pkg);
export const validateVisibilitySnapshot = (raw: unknown) => validateLocalStorageModuleSnapshot(CONFIG, raw);
