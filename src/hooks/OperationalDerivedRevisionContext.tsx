/**
 * App-wide listener for localStorage overlay changes (Priority & Allocation, etc.).
 * Mounted once under /_authenticated so dashboard metrics rebuild even when the
 * Satellite Monitoring views are not mounted (e.g. Administrator → Priority).
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  invalidateOperationalQueries,
  subscribeOperationalSync,
} from "@/lib/operationalRefresh";

const OperationalDerivedRevisionContext = createContext(0);

export function OperationalDerivedRevisionProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      setRevision((n) => n + 1);
      invalidateOperationalQueries(queryClient);
    };
    return subscribeOperationalSync(refresh);
  }, [queryClient]);

  return (
    <OperationalDerivedRevisionContext.Provider value={revision}>
      {children}
    </OperationalDerivedRevisionContext.Provider>
  );
}

export function useOperationalDerivedRevision(): number {
  return useContext(OperationalDerivedRevisionContext);
}
