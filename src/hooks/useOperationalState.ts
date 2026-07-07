import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildOperationalFleetState,
  type OperationalFleetState,
} from "@/lib/operationalState";
import {
  listAllEquipment,
  listAllIntelRecords,
  listUnits,
  INTEL_RECORDS_ALL_KEY,
} from "@/lib/queries";
import {
  fetchAllEngagements,
  ENGAGEMENTS_ALL_KEY,
} from "@/lib/engagementEngine";
import { useQuery } from "@tanstack/react-query";
import {
  OPERATIONAL_STORE_EVENT,
  ensureOperationalDataset,
} from "@/lib/operationalStore";

export function useOperationalState() {
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    ensureOperationalDataset();
    setReady(true);
  }, []);

  useEffect(() => {
    const sync = () => {
      void queryClient.invalidateQueries({ queryKey: ["units"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment-all"] });
      void queryClient.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
      void queryClient.invalidateQueries({ queryKey: INTEL_RECORDS_ALL_KEY });
    };
    window.addEventListener(OPERATIONAL_STORE_EVENT, sync);
    return () => window.removeEventListener(OPERATIONAL_STORE_EVENT, sync);
  }, [queryClient]);

  const { data: units = [] } = useQuery({
    queryKey: ["units"],
    queryFn: listUnits,
    enabled: ready,
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-all"],
    queryFn: listAllEquipment,
    enabled: ready,
  });

  const { data: engagements = [] } = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    enabled: ready,
  });

  const { data: intelRows = [] } = useQuery({
    queryKey: INTEL_RECORDS_ALL_KEY,
    queryFn: listAllIntelRecords,
    enabled: ready,
  });

  const fleetState: OperationalFleetState | null = useMemo(() => {
    if (!ready) return null;
    if (units.length === 0) return null;

    return buildOperationalFleetState({
      dbUnits: units,
      equipment,
      engagements,
      intelRows,
    });
  }, [ready, units, equipment, engagements, intelRows]);

  return {
    fleetState,
    units,
    equipment,
    engagements,
    intelRows,
    isLoading: !ready,
  };
}
