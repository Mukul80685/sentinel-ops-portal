import type { ModuleScope } from "@/lib/moduleUnitRegistry";

/** Modules that support point-in-time snapshot backup/restore. */
export type ModuleSnapshotId = ModuleScope;

export const SNAPSHOT_FORMAT_VERSION = "1.0";

export type ModuleSnapshotOperationalSlice = {
  intelRows: unknown[];
  engagements: unknown[];
  satellites: unknown[];
  units: unknown[];
};

export type ModuleSnapshotPackage = {
  snapshot_version: typeof SNAPSHOT_FORMAT_VERSION;
  module: ModuleSnapshotId;
  module_title: string;
  schema: string;
  exported_at: string;
  storage: Record<string, string>;
  operational: ModuleSnapshotOperationalSlice;
  checksum: string;
};

export type SnapshotValidationResult =
  | { ok: true; package: ModuleSnapshotPackage }
  | { ok: false; error: string };

export type SnapshotExportResult = {
  package: ModuleSnapshotPackage;
  filename: string;
};

export interface ModuleSnapshotAdapter {
  id: ModuleSnapshotId;
  title: string;
  schema: string;
  filenamePrefix: string;
  exportSnapshot: () => ModuleSnapshotPackage;
  restoreSnapshot: (pkg: ModuleSnapshotPackage) => void;
  validateSnapshot: (raw: unknown) => SnapshotValidationResult;
  restoreWarning: string;
}
