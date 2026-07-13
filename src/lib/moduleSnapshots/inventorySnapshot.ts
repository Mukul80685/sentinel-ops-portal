import {
  exportLocalStorageModuleSnapshot,
  restoreLocalStorageModuleSnapshot,
  validateLocalStorageModuleSnapshot,
  type LocalStorageModuleSnapshotConfig,
} from "@/lib/moduleSnapshots/moduleSnapshotCommon";
import { getOperationalDataset } from "@/lib/operationalStore";

export const INVENTORY_SNAPSHOT_SCHEMA = "resource-inventory-v1";

const CONFIG: LocalStorageModuleSnapshotConfig = {
  module: "inventory",
  title: "Resource Inventory",
  schema: INVENTORY_SNAPSHOT_SCHEMA,
  scope: "inventory",
  fixedStorageKeys: ["ssacc_inventory_hidden_units"],
  storageDefaults: {
    "ssacc_inventory_hidden_units": "[]",
  },
  restoreWarning:
    "This operation will replace the current Resource Inventory with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.",
  collectOperationalExtra: (unitIds) => {
    const ds = getOperationalDataset();
    return {
      equipment: ds.equipment.filter((item) => unitIds.has(item.unit_id)),
      categories: ds.categories,
    };
  },
};

export const exportInventorySnapshot = () => exportLocalStorageModuleSnapshot(CONFIG);
export const restoreInventorySnapshot = (pkg: Parameters<typeof restoreLocalStorageModuleSnapshot>[1]) =>
  restoreLocalStorageModuleSnapshot(CONFIG, pkg);
export const validateInventorySnapshot = (raw: unknown) => validateLocalStorageModuleSnapshot(CONFIG, raw);
