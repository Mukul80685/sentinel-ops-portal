import type { ModuleSnapshotId, ModuleSnapshotAdapter, ModuleSnapshotPackage } from "@/lib/moduleSnapshots/types";
import {
  exportIntelSnapshot,
  INTEL_RESTORE_WARNING,
  restoreIntelSnapshot,
  validateIntelSnapshot,
} from "@/lib/moduleSnapshots/intelSnapshot";
import { snapshotFilename } from "@/lib/moduleSnapshots/utils";
import { ADMIN_EXPORT_PREFIX } from "@/lib/adminExportNaming";

function notImplemented(id: ModuleSnapshotId): ModuleSnapshotAdapter {
  const titles: Record<ModuleSnapshotId, string> = {
    intel: "Intelligence Repository",
    priority: "Satellite Priority & Allocation",
    visibility: "Satellite Visibility Matrix",
    inventory: "Resource Inventory",
    serviceability: "Serviceability State",
  };

  return {
    id,
    title: titles[id],
    schema: `${id}-snapshot-v0`,
    filenamePrefix: ADMIN_EXPORT_PREFIX[id as keyof typeof ADMIN_EXPORT_PREFIX] ?? id,
    exportSnapshot: () => {
      throw new Error(`${titles[id]} snapshots are not implemented yet.`);
    },
    restoreSnapshot: () => {
      throw new Error(`${titles[id]} snapshots are not implemented yet.`);
    },
    validateSnapshot: () => ({
      ok: false,
      error: `${titles[id]} snapshot restore is not available yet.`,
    }),
    restoreWarning: `Snapshot restore for ${titles[id]} is not available yet.`,
  };
}

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

const ADAPTERS: Record<ModuleSnapshotId, ModuleSnapshotAdapter> = {
  intel: intelAdapter,
  priority: notImplemented("priority"),
  visibility: notImplemented("visibility"),
  inventory: notImplemented("inventory"),
  serviceability: notImplemented("serviceability"),
};

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
  return module === "intel";
}
