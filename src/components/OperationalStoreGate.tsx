import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENGAGEMENTS_ALL_KEY } from "@/lib/engagementEngine";
import { resetOperationalDataSourceCache } from "@/lib/operationalDataSource";
import {
  ensureOperationalDataset,
  OPERATIONAL_STORE_EVENT,
} from "@/lib/operationalStore";

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

    // 1. Initialize SSOT
    resetOperationalDataSourceCache();
    ensureOperationalDataset();

    // 2. Notify store listeners
    window.dispatchEvent(new Event(OPERATIONAL_STORE_EVENT));

    // 3. Perform controlled cache refresh (ONLY critical domains)
    const invalidateList = [
      ENGAGEMENTS_ALL_KEY,
      ["units"],
      ["equipment-all"],
    ];

    invalidateList.forEach((key) => {
      void qc.invalidateQueries({ queryKey: key });
    });
  }, [qc]);

  return null;
}
