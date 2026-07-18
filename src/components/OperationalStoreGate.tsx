import { useEffect, useRef } from "react";
import { resetOperationalDataSourceCache } from "@/lib/operationalDataSource";
import {
  ensureOperationalDataset,
  resetOperationalDataset,
} from "@/lib/operationalStore";
import { OPERATIONAL_DATASET_VERSION } from "@/lib/operationalConstants";
import { whenElectronStorageReady } from "@/lib/electronPersist";

/**
 * OperationalStoreGate
 * Ensures SSOT initialization and performs a controlled cache sync.
 */
export function OperationalStoreGate() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      await whenElectronStorageReady();

      resetOperationalDataSourceCache();

      // Regenerate only for stale auto-seeded datasets — never wipe user-managed stores.
      try {
        const raw = localStorage.getItem("ssacc_operational_store_v2");
        if (raw) {
          const parsed = JSON.parse(raw) as {
            version?: number;
            equipment?: unknown[];
            userManaged?: boolean;
          };
          if (parsed.userManaged) {
            ensureOperationalDataset();
          } else if (
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
    })();
  }, []);

  return null;
}
