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
import { invalidateOperationalQueries } from "@/lib/operationalRefresh";
import { useOperationalDerivedRevision } from "@/hooks/OperationalDerivedRevisionContext";

/** Offline SSOT — refetch only when operational sync events invalidate queries. */
const OPERATIONAL_QUERY_STALE_MS = Number.POSITIVE_INFINITY;

export function useOperationalState() {
  const [ready, setReady] = useState(false);
  /** Bumps when priority/visibility/module overlays change (localStorage SSOT). */
  const derivedRevision = useOperationalDerivedRevision();
  const queryClient = useQueryClient();

  useEffect(() => {
    ensureOperationalDataset();
    setReady(true);
  }, []);

  useEffect(() => {
    invalidateOperationalQueries(queryClient);
  }, [derivedRevision, queryClient]);

  const unitsQuery = useQuery({
    queryKey: ["units"],
    queryFn: listUnits,
    enabled: ready,
    staleTime: OPERATIONAL_QUERY_STALE_MS,
  });

  const equipmentQuery = useQuery({
    queryKey: ["equipment-all"],
    queryFn: listAllEquipment,
    enabled: ready,
    staleTime: OPERATIONAL_QUERY_STALE_MS,
  });

  const engagementsQuery = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    enabled: ready,
    staleTime: OPERATIONAL_QUERY_STALE_MS,
  });

  const intelQuery = useQuery({
    queryKey: INTEL_RECORDS_ALL_KEY,
    queryFn: listAllIntelRecords,
    enabled: ready,
    staleTime: OPERATIONAL_QUERY_STALE_MS,
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
