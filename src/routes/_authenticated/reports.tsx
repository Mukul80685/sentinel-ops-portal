import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useSidebarModules } from "@/components/sidebar/SidebarModulesProvider";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports and Returns — SSACC" }] }),
});

function ReportsPage() {
  const { openModule } = useSidebarModules();

  useEffect(() => {
    openModule("reports");
  }, [openModule]);

  return (
    <AppShell title="Reports and Returns" subtitle="Operations">
      <div className="panel p-6 text-muted-foreground mono text-[11px]">
        Reports opens in the sidebar panel. Use the sidebar if the panel was closed.
      </div>
    </AppShell>
  );
}
