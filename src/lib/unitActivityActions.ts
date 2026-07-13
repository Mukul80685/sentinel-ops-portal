/**
 * Clear unit activity shown on the Satellite Monitoring dashboard (Unit Activity tab).
 * Suppresses INT monitoring satellites and clears scan history so optimization scores update.
 */

import {
  loadSuppressedSatNamesList,
  saveSuppressedSatNames,
} from "@/lib/intelScanStorage";
import { clearUnitScanHistory } from "@/lib/scanHistoryStore";
import { notifyOperationalDerivedRefresh } from "@/lib/operationalRefresh";

export function clearUnitActivityMonitoring(
  unitDbId: string,
  unitCode: string | undefined,
  activeSatelliteNames: string[],
): void {
  if (activeSatelliteNames.length > 0) {
    const existing = loadSuppressedSatNamesList(unitDbId, unitCode);
    const seen = new Set(existing.map((n) => n.toLowerCase()));
    const merged = [...existing];
    for (const name of activeSatelliteNames) {
      const trimmed = name.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      merged.push(trimmed);
      seen.add(trimmed.toLowerCase());
    }
    saveSuppressedSatNames(unitDbId, merged, unitCode);
  }
  clearUnitScanHistory(unitDbId);
  notifyOperationalDerivedRefresh();
}
