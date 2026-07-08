import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits } from "@/lib/queries";
import {
  filterUnitsForModule,
  MODULE_UNITS_EVENT,
  type ModuleScope,
} from "@/lib/moduleUnitRegistry";

/** Units visible in a specific module (respects per-module delete/hide). */
export function useModuleUnits(scope: ModuleScope) {
  const [hiddenTick, setHiddenTick] = useState(0);

  useEffect(() => {
    const refresh = () => setHiddenTick((t) => t + 1);
    window.addEventListener(MODULE_UNITS_EVENT, refresh);
    return () => window.removeEventListener(MODULE_UNITS_EVENT, refresh);
  }, []);

  const query = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const units = useMemo(
    () => filterUnitsForModule(query.data ?? [], scope),
    [query.data, scope, hiddenTick],
  );

  return { ...query, units };
}
