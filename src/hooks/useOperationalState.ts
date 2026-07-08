import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ensureOperationalDataset } from "@/lib/operationalStore";
import {
  invalidateOperationalQueries,
  subscribeOperationalSync,
} from "@/lib/operationalRefresh";

export function useOperationalState() {
  const [ready, setReady] = useState(false);
  /** Bumps when priority/visibility/module overlays change (localStorage SSOT). */
  const [derivedRevision, setDerivedRevision] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    ensureOperationalDataset();
    setReady(true);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setDerivedRevision((n) => n + 1);
      invalidateOperationalQueries(queryClient);
    };
    return subscribeOperationalSync(refresh);
  }, [queryClient]);

  const unitsQuery = useQuery({
    queryKey: ["units"],
    queryFn: listUnits,
    enabled: ready,
    staleTime: 0,
  });

  const equipmentQuery = useQuery({
    queryKey: ["equipment-all"],
    queryFn: listAllEquipment,
    enabled: ready,
    staleTime: 0,
  });

  const engagementsQuery = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    enabled: ready,
    staleTime: 0,
  });

  const intelQuery = useQuery({
    queryKey: INTEL_RECORDS_ALL_KEY,
    queryFn: listAllIntelRecords,
    enabled: ready,
    staleTime: 0,
  });

  const units = unitsQuery.data ?? [];
  const equipment = equipmentQuery.data ?? [];
  const engagements = engagementsQuery.data ?? [];
  const intelRows = intelQuery.data ?? [];

  const fleetState: OperationalFleetState | null = useMemo(() => {
    if (!ready) return null;
    if (units.length === 0) return null;

    return buildOperationalFleetState({
      dbUnits: units,
      equipment,
      engagements,
      intelRows,
    });
    // derivedRevision forces rebuild when priority/visibility overlays change
  }, [ready, units, equipment, engagements, intelRows, derivedRevision]);

  const isLoading =
    !ready ||
    unitsQuery.isLoading ||
    equipmentQuery.isLoading ||
    engagementsQuery.isLoading ||
    intelQuery.isLoading;

  const isFetching =
    unitsQuery.isFetching ||
    equipmentQuery.isFetching ||
    engagementsQuery.isFetching ||
    intelQuery.isFetching;

  return {
    fleetState,
    units,
    equipment,
    engagements,
    intelRows,
    isLoading,
    isFetching,
    derivedRevision,
  };
}
