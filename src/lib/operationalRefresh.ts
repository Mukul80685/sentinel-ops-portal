/**
 * Central invalidation + refresh signals for cross-module operational data.
 * Satellite Monitoring Dashboard and useOperationalState subscribe here so
 * priority, visibility, inventory, intel, and engagement changes propagate.
 */

import type { QueryClient } from "@tanstack/react-query";
import { ENGAGEMENTS_ALL_KEY } from "@/lib/engagementEngine";
import { INTEL_RECORDS_ALL_KEY } from "@/lib/queries";
import { INTEL_CELL_EDITS_EVENT } from "@/lib/intelCellStore";
import { INTEL_FREQ_EVENT } from "@/lib/intelFrequencyActions";
import { OPERATIONAL_STORE_EVENT } from "@/lib/operationalConstants";
import { PRIORITY_ALLOCATION_EVENT } from "@/lib/priorityAllocation";
import { VISIBILITY_OVERLAY_EVENT } from "@/lib/visibilityOverlay";
import { MODULE_UNITS_EVENT } from "@/lib/moduleUnitRegistry";
import { SCAN_HISTORY_EVENT } from "@/lib/scanHistoryStore";
import { PLANNED_SATELLITES_EVENT } from "@/lib/plannedSatelliteStore";
import { ENGAGEMENT_TABLE_HIDDEN_EVENT } from "@/lib/engagementTableStore";

/** Fired after derived fleet metrics should be recomputed (localStorage-only sources). */
export const OPERATIONAL_DERIVED_REFRESH_EVENT = "ssacc-operational-derived-refresh";

/** All window events that should trigger operational query refresh + derived rebuild. */
export const OPERATIONAL_SYNC_EVENTS = [
  OPERATIONAL_STORE_EVENT,
  PRIORITY_ALLOCATION_EVENT,
  VISIBILITY_OVERLAY_EVENT,
  MODULE_UNITS_EVENT,
  SCAN_HISTORY_EVENT,
  PLANNED_SATELLITES_EVENT,
  ENGAGEMENT_TABLE_HIDDEN_EVENT,
  OPERATIONAL_DERIVED_REFRESH_EVENT,
  INTEL_CELL_EDITS_EVENT,
  INTEL_FREQ_EVENT,
] as const;

export function invalidateOperationalQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["units"] });
  void queryClient.invalidateQueries({ queryKey: ["equipment-all"] });
  void queryClient.invalidateQueries({ queryKey: ["inv-all-equipment"] });
  void queryClient.invalidateQueries({ queryKey: ["intel-all-equipment"] });
  void queryClient.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
  void queryClient.invalidateQueries({ queryKey: INTEL_RECORDS_ALL_KEY });
}

export function notifyOperationalDerivedRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPERATIONAL_DERIVED_REFRESH_EVENT));
}

export function subscribeOperationalSync(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  for (const event of OPERATIONAL_SYNC_EVENTS) {
    window.addEventListener(event, onChange);
  }
  return () => {
    for (const event of OPERATIONAL_SYNC_EVENTS) {
      window.removeEventListener(event, onChange);
    }
  };
}
