import { useEffect, useMemo, useState } from "react";
import {
buildOperationalFleetState,
type OperationalFleetState,
} from "@/lib/operationalState";
import {
listAllEquipment,
listUnits,
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

useEffect(() => {
ensureOperationalDataset();
setReady(true);
}, []);

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

const intelRows: any[] = [];

const fleetState: OperationalFleetState | null = useMemo(() => {
if (!ready) return null;
if (units.length === 0) return null;

return buildOperationalFleetState({  
  dbUnits: units,  
  equipment,  
  engagements,  
  intelRows,  
});

}, [ready, units, equipment, engagements]);

return {
fleetState,
units,
equipment,
engagements,
intelRows,
isLoading: !ready,
};
}