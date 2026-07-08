import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resetOperationalDataSourceCache } from "@/lib/operationalDataSource";
import {
  ensureOperationalDataset,
  OPERATIONAL_STORE_EVENT,
  resetOperationalDataset,
} from "@/lib/operationalStore";
import { OPERATIONAL_DATASET_VERSION } from "@/lib/operationalConstants";
import { invalidateOperationalQueries } from "@/lib/operationalRefresh";

/**
 * OperationalStoreGate
 * Ensures SSOT initialization and performs a controlled cache sync.
 */
export function OperationalStoreGate() {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    resetOperationalDataSourceCache();

    // Regenerate if version stale or inventory too small (prior cached datasets).
    try {
      const raw = localStorage.getItem("ssacc_operational_store_v2");
      if (raw) {
        const parsed = JSON.parse(raw) as { version?: number; equipment?: unknown[] };
        if (
          parsed.version !== OPERATIONAL_DATASET_VERSION ||
          (parsed.equipment?.length ?? 0) < 300
        ) {
          resetOperationalDataset();
        } else {
          ensureOperationalDataset();
        }
      } else {
        ensureOperationalDataset();
      }
    } catch {
      resetOperationalDataset();
    }

    window.dispatchEvent(new Event(OPERATIONAL_STORE_EVENT));

    invalidateOperationalQueries(qc);
    void qc.invalidateQueries({ queryKey: ["cats"] });
    void qc.invalidateQueries({ queryKey: ["categories"] });
    void qc.invalidateQueries({ queryKey: ["equipment-all-cat"] });
    void qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        return k === "eq-counts" || k === "eq" || k === "eq-detail" || k === "unit-equipment-detail";
      },
    });
  }, [qc]);

  return null;
}
