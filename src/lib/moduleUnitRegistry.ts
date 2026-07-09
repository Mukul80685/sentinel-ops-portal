/**
 * Per-module unit visibility — deleting a unit in one vertical hides it there only.
 */

import {
  getOperationalDataset,
  removeOperationalIntelRows,
} from "@/lib/operationalStore";

export type ModuleScope =
  | "intel"
  | "priority"
  | "visibility"
  | "inventory"
  | "serviceability";

export const MODULE_SCOPE_LABELS: Record<ModuleScope, string> = {
  intel: "Intelligence Repository",
  priority: "Satellite Priority & Allocation",
  visibility: "Satellite Visibility Matrix",
  inventory: "Resource Inventory",
  serviceability: "Serviceability State",
};

const HIDDEN_KEY: Record<ModuleScope, string> = {
  intel: "ssacc_intel_hidden_units",
  priority: "ssacc_priority_hidden_units",
  visibility: "ssacc_visibility_hidden_units",
  inventory: "ssacc_inventory_hidden_units",
  serviceability: "ssacc_serviceability_hidden_units",
};

export const MODULE_UNITS_EVENT = "ssacc_module_units_change";

function loadHiddenSet(scope: ModuleScope): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HIDDEN_KEY[scope]);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(list);
  } catch {
    return new Set();
  }
}

function saveHiddenSet(scope: ModuleScope, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HIDDEN_KEY[scope], JSON.stringify([...ids]));
}

function hideUnitInModule(unitId: string, scope: ModuleScope): void {
  const set = loadHiddenSet(scope);
  set.add(unitId);
  saveHiddenSet(scope, set);
}

/** Restore unit visibility in a module after data is re-imported. */
export function unhideUnitInModule(unitId: string, scope: ModuleScope): void {
  const set = loadHiddenSet(scope);
  if (!set.delete(unitId)) return;
  saveHiddenSet(scope, set);
  dispatchModuleUnitsChange(scope);
}

export function isUnitHiddenInModule(unitId: string, scope: ModuleScope): boolean {
  return loadHiddenSet(scope).has(unitId);
}

export function filterUnitsForModule<T extends { id: string }>(
  units: T[],
  scope: ModuleScope,
): T[] {
  const hidden = loadHiddenSet(scope);
  if (hidden.size === 0) return units;
  return units.filter((u) => !hidden.has(u.id));
}

function dispatchModuleUnitsChange(scope: ModuleScope): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MODULE_UNITS_EVENT, { detail: { scope } }));
}

function purgeIntelModuleData(unitId: string, slot: string): void {
  const ds = getOperationalDataset();
  const intelIds = (ds.intelRows ?? [])
    .filter((r) => r.unit_id === unitId)
    .map((r) => r.id);
  if (intelIds.length > 0) removeOperationalIntelRows(intelIds);

  if (typeof window === "undefined") return;

  try {
    const prefixes = [
      `intel-repo-imports-${slot}`,
      `intel-sat-meta-${slot}-`,
      `intel-scan-overrides-${slot}`,
      `intel-setup-${slot}-`,
      `intel-suppressed-sats-${slot}`,
    ];
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefixes.some((p) => k === p || k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem("ssacc_intel_cell_edits");
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      let changed = false;
      for (const k of Object.keys(parsed)) {
        if (k.includes(slot)) {
          delete parsed[k];
          changed = true;
        }
      }
      if (changed) localStorage.setItem("ssacc_intel_cell_edits", JSON.stringify(parsed));
    }
  } catch { /* ignore */ }

  try {
    const freqKeys = [
      "ssacc_intel_freq_actions",
      "ssacc_intel_important_refs",
      "ssacc_intel_discarded_refs",
      "ssacc_intel_analysis_queue",
      "ssacc_intel_allocations",
      "ssacc_intel_integrity_overrides",
    ];
    for (const key of freqKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const next = parsed.filter(
          (e: { unitId?: string; unit_id?: string }) =>
            e?.unitId !== slot && e?.unitId !== unitId && e?.unit_id !== unitId,
        );
        if (next.length !== parsed.length) localStorage.setItem(key, JSON.stringify(next));
      }
    }
  } catch { /* ignore */ }
}

function purgePriorityModuleData(slot: string): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of [
      "ssacc_priority_user_allocations",
      "ssacc_priority_suppressed_sats",
      "ssacc_priority_p_overrides",
    ]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (slot in parsed) {
        delete parsed[slot];
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    }
    window.dispatchEvent(new Event("ssacc_priority_allocation_change"));
  } catch { /* ignore */ }
}

function purgeVisibilityModuleData(slot: string, unitId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("ssacc_visibility_overlay");
    if (raw) {
      const overlay = JSON.parse(raw) as {
        addedSats?: Record<string, unknown>;
        editedSats?: Record<string, unknown>;
      };
      let changed = false;
      for (const bucket of [overlay.addedSats, overlay.editedSats]) {
        if (!bucket) continue;
        for (const k of Object.keys(bucket)) {
          if (k.startsWith(`${slot}::`) || k.startsWith(`${unitId}::`)) {
            delete bucket[k];
            changed = true;
          }
        }
      }
      if (changed) {
        localStorage.setItem("ssacc_visibility_overlay", JSON.stringify(overlay));
        window.dispatchEvent(new Event("ssacc-visibility-overlay"));
      }
    }
  } catch { /* ignore */ }
}

/** Remove a unit from a single module only — does not affect other verticals. */
export function purgeUnitFromModule(unitId: string, scope: ModuleScope): boolean {
  const ds = getOperationalDataset();
  const unit = ds.units.find((u) => u.id === unitId);
  if (!unit) return false;

  hideUnitInModule(unitId, scope);

  switch (scope) {
    case "intel":
      purgeIntelModuleData(unitId, unit.slot);
      break;
    case "priority":
      purgePriorityModuleData(unit.slot);
      break;
    case "visibility":
      purgeVisibilityModuleData(unit.slot, unitId);
      break;
    case "inventory":
    case "serviceability":
      break;
  }

  dispatchModuleUnitsChange(scope);
  return true;
}
