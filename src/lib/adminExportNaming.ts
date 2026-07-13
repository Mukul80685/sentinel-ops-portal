/** Shared export filename prefixes for Administrator data modules. */
export const ADMIN_EXPORT_PREFIX = {
  intel: "int_repo",
  priority: "Satl_Allo",
  visibility: "vis_matrix",
  inventory: "res_inv",
  serviceability: "serv_state",
} as const;

export type AdminExportModule = keyof typeof ADMIN_EXPORT_PREFIX;

/** `YYYY-MM-DD_HH-MM-SS` */
export function formatAdminExportStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
  const timePart = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("-");
  return `${datePart}_${timePart}`;
}

/**
 * Build a standardized Administrator export filename:
 * `{prefix}_{date}_{time}.{ext}` — e.g. `int_repo_2026-07-09_11-24-30.csv`
 */
export function adminExportFilename(
  module: AdminExportModule,
  extension = "csv",
  date: Date = new Date(),
): string {
  const prefix = ADMIN_EXPORT_PREFIX[module];
  const stamp = formatAdminExportStamp(date);
  const ext = extension.replace(/^\./, "");
  return `${prefix}_${stamp}.${ext}`;
}
