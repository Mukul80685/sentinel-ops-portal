import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Orbit } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { getUnitById } from "@/lib/queries";
import { unitDisplayLabel } from "@/lib/operationalDataset";
import { THURAYA_HOME_PATH } from "@/lib/dashboardLabels";

export const Route = createFileRoute("/_authenticated/thuraya/$unitId/")({
  component: ThurayaUnitPlaceholder,
});

function ThurayaUnitPlaceholder() {
  const { unitId } = Route.useParams();
  const { data: unit, isLoading } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: () => getUnitById(unitId),
  });

  const unitLabel = unit ? unitDisplayLabel(unit) : undefined;

  return (
    <AppShell
      title="Thuraya"
      subtitle={unitLabel}
      headerIcon={<HomeNavIconBadge icon={Orbit} theme="important" size="md" />}
      showBack
      backLink={{ to: THURAYA_HOME_PATH }}
      horizontalNav={null}
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading unit…</p>
      ) : !unit ? (
        <Empty title="Unit not found" hint="Return to Thuraya and select a valid unit." />
      ) : (
        <Empty
          title={`${unitLabel} workspace`}
          hint="Unit-specific Thuraya features will be added here."
        />
      )}
    </AppShell>
  );
}
