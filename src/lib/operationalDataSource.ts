/**
 * Unified data-source resolver — local operational SSOT only (offline).
 */

/** Always use the local operational store. */
export async function shouldUseOperationalStore(): Promise<boolean> {
  return true;
}

export function resetOperationalDataSourceCache(): void {
  // No-op — operational store is always the data source.
}

export function isOperationalStoreActive(): boolean {
  return true;
}
