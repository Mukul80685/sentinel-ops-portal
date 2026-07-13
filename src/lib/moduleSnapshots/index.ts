import type { ModuleSnapshotId, ModuleSnapshotAdapter, ModuleSnapshotPackage } from "@/lib/moduleSnapshots/types";
import {
  exportIntelSnapshot,
  INTEL_RESTORE_WARNING,
  restoreIntelSnapshot,
  validateIntelSnapshot,
} from "@/lib/moduleSnapshots/intelSnapshot";
import {
  exportPrioritySnapshot,
  restorePrioritySnapshot,
  validatePrioritySnapshot,
} from "@/lib/moduleSnapshots/prioritySnapshot";
import {
  exportVisibilitySnapshot,
  restoreVisibilitySnapshot,
  validateVisibilitySnapshot,
} from "@/lib/moduleSnapshots/visibilitySnapshot";
import {
  exportInventorySnapshot,
  restoreInventorySnapshot,
  validateInventorySnapshot,
} from "@/lib/moduleSnapshots/inventorySnapshot";
import {
  exportServiceabilitySnapshot,
  restoreServiceabilitySnapshot,
  validateServiceabilitySnapshot,
} from "@/lib/moduleSnapshots/serviceabilitySnapshot";
import { snapshotFilename } from "@/lib/moduleSnapshots/utils";
import { ADMIN_EXPORT_PREFIX } from "@/lib/adminExportNaming";

const intelAdapter: ModuleSnapshotAdapter = {
  id: "intel",
  title: "Intelligence Repository",
  schema: "intel-repository-v1",
  filenamePrefix: ADMIN_EXPORT_PREFIX.intel,
  exportSnapshot: exportIntelSnapshot,
  restoreSnapshot: restoreIntelSnapshot,
  validateSnapshot: validateIntelSnapshot,
  restoreWarning: INTEL_RESTORE_WARNING,
};

const priorityAdapter: ModuleSnapshotAdapter = {
  id: "priority",
  title: "Satellite Priority & Allocation",
  schema: "priority-allocation-v1",
  filenamePrefix: ADMIN_EXPORT_PREFIX.priority,
  exportSnapshot: exportPrioritySnapshot,
  restoreSnapshot: restorePrioritySnapshot,
  validateSnapshot: validatePrioritySnapshot,
  restoreWarning:
    "This operation will replace the current Satellite Priority & Allocation data with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.",
};

const visibilityAdapter: ModuleSnapshotAdapter = {
  id: "visibility",
  title: "Satellite Visibility Matrix",
  schema: "visibility-matrix-v1",
  filenamePrefix: ADMIN_EXPORT_PREFIX.visibility,
  exportSnapshot: exportVisibilitySnapshot,
  restoreSnapshot: restoreVisibilitySnapshot,
  validateSnapshot: validateVisibilitySnapshot,
  restoreWarning:
    "This operation will replace the current Satellite Visibility Matrix with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.",
};

const inventoryAdapter: ModuleSnapshotAdapter = {
  id: "inventory",
  title: "Resource Inventory",
  schema: "resource-inventory-v1",
  filenamePrefix: ADMIN_EXPORT_PREFIX.inventory,
  exportSnapshot: exportInventorySnapshot,
  restoreSnapshot: restoreInventorySnapshot,
  validateSnapshot: validateInventorySnapshot,
  restoreWarning:
    "This operation will replace the current Resource Inventory with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.",
};

const serviceabilityAdapter: ModuleSnapshotAdapter = {
  id: "serviceability",
  title: "Serviceability State",
  schema: "serviceability-state-v1",
  filenamePrefix: ADMIN_EXPORT_PREFIX.serviceability,
  exportSnapshot: exportServiceabilitySnapshot,
  restoreSnapshot: restoreServiceabilitySnapshot,
  validateSnapshot: validateServiceabilitySnapshot,
  restoreWarning:
    "This operation will replace the current Serviceability State with the selected backup snapshot. Unsaved changes made after the backup was created will be lost.",
};

const ADAPTERS: Record<ModuleSnapshotId, ModuleSnapshotAdapter> = {
  intel: intelAdapter,
  priority: priorityAdapter,
  visibility: visibilityAdapter,
  inventory: inventoryAdapter,
  serviceability: serviceabilityAdapter,
};

const IMPLEMENTED_MODULES = new Set<ModuleSnapshotId>([
  "intel",
  "priority",
  "visibility",
  "inventory",
  "serviceability",
]);

export function getModuleSnapshotAdapter(module: ModuleSnapshotId): ModuleSnapshotAdapter {
  return ADAPTERS[module];
}

export function exportModuleSnapshot(module: ModuleSnapshotId): {
  package: ModuleSnapshotPackage;
  filename: string;
} {
  const adapter = getModuleSnapshotAdapter(module);
  const pkg = adapter.exportSnapshot();
  return {
    package: pkg,
    filename: snapshotFilename(adapter.filenamePrefix, new Date(pkg.exported_at)),
  };
}

export function validateModuleSnapshot(module: ModuleSnapshotId, raw: unknown) {
  return getModuleSnapshotAdapter(module).validateSnapshot(raw);
}

export function restoreModuleSnapshot(module: ModuleSnapshotId, pkg: ModuleSnapshotPackage): void {
  getModuleSnapshotAdapter(module).restoreSnapshot(pkg);
}

export function isSnapshotModuleImplemented(module: ModuleSnapshotId): boolean {
  return IMPLEMENTED_MODULES.has(module);
}
