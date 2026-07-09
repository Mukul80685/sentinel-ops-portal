/**
 * Canonical localStorage key namespace for per-unit Intel module data.
 * Always keyed by unit slot (alpha, bravo, uxxxx…) — never op-unit-* prefixes.
 */

import { resolveIntUnitSlug } from "@/lib/operationalSync";

/** Normalize any unit id / route param → intel storage slug. */
export function intelStorageSlug(unitIdOrSlug: string, unitCode?: string): string {
  const resolved = resolveIntUnitSlug(unitIdOrSlug, unitCode);
  if (resolved) return resolved;
  return unitIdOrSlug.replace(/^op-unit-/i, "").toLowerCase();
}

export function intelScanOverridesKey(slug: string): string {
  return `intel-scan-overrides-${intelStorageSlug(slug)}`;
}

export function intelSuppressedSatsKey(slug: string): string {
  return `intel-suppressed-sats-${intelStorageSlug(slug)}`;
}

export function intelRepoImportsKey(slug: string): string {
  return `intel-repo-imports-${intelStorageSlug(slug)}`;
}

/** Read localStorage trying canonical slug then legacy op-unit-* key. */
export function readIntelLocalJson<T>(canonicalKey: string, legacyUnitId?: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(canonicalKey);
    if (raw) return JSON.parse(raw) as T;
    if (legacyUnitId && legacyUnitId !== canonicalKey.replace(/^intel-(?:scan-overrides|suppressed-sats|repo-imports)-/, "")) {
      const legacyPrefixes = ["intel-scan-overrides-", "intel-suppressed-sats-", "intel-repo-imports-"];
      for (const prefix of legacyPrefixes) {
        if (canonicalKey.startsWith(prefix)) {
          const legacyKey = prefix + legacyUnitId;
          const legacyRaw = localStorage.getItem(legacyKey);
          if (legacyRaw) return JSON.parse(legacyRaw) as T;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
