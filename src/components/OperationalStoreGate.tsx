import { useEffect, useRef } from "react";
import { resetOperationalDataSourceCache } from "@/lib/operationalDataSource";
import {
  ensureOperationalDataset,
  hasPersistedUserWorkbenchData,
  resetOperationalDataset,
} from "@/lib/operationalStore";
import { OPERATIONAL_DATASET_VERSION } from "@/lib/operationalConstants";
import { whenElectronStorageReady } from "@/lib/electronPersist";
import { sanitizeIntelCellEditsStorage } from "@/lib/intelCellStore";
import { sanitizeIntelScanOverridesStorage } from "@/lib/intelScanStorage";
import { sanitizeVisibilityOverlayDuplicateSatellites } from "@/lib/visibilityOverlay";

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
          if (parsed.userManaged || hasPersistedUserWorkbenchData()) {
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
        sanitizeVisibilityOverlayDuplicateSatellites();
        sanitizeIntelCellEditsStorage();
        sanitizeIntelScanOverridesStorage();
      } catch {
        // Never wipe persisted data on a transient parse failure (common during EXE hydration).
        ensureOperationalDataset();
      }
    })();
  }, []);

  return null;
}
