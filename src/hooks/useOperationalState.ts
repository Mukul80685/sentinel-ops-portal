import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ENGAGEMENTS_ALL_KEY, fetchAllEngagements } from "@/lib/engagementEngine";
import { listAllEquipment, listUnits } from "@/lib/queries";
import { buildOperationalFleetState, type OperationalFleetState } from "@/lib/operationalState";
import { OPERATIONAL_STORE_EVENT, ensureOperationalDataset } from "@/lib/operationalStore";

export function useOperationalState() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    ensureOperationalDataset();
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener(OPERATIONAL_STORE_EVENT, refresh);
    return () => window.removeEventListener(OPERATIONAL_STORE_EVENT, refresh);
  }, []);

  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ["units", tick],
    queryFn: listUnits,
  });

  const { data: equipment = [], isLoading: equipmentLoading } = useQuery({
    queryKey: ["equipment-all-cat", tick],
    queryFn: listAllEquipment,
    staleTime: 30_000,
  });

  const { data: engagements = [], isLoading: engagementsLoading } = useQuery({
    queryKey: [...ENGAGEMENTS_ALL_KEY, tick],
    queryFn: fetchAllEngagements,
    staleTime: 30_000,
  });

  const intelRows: any[] = [];

  const fleetState: OperationalFleetState | null = useMemo(() => {
    if (units.length === 0) return null;
    return buildOperationalFleetState({ dbUnits: units, equipment, engagements, intelRows });
  }, [units, equipment, engagements]);

  return {
    fleetState,
    units,
    equipment,
    engagements,
    intelRows,
    isLoading: unitsLoading || equipmentLoading || engagementsLoading,
  };
}
