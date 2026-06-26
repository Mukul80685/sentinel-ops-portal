import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useSidebarModules } from "@/components/sidebar/SidebarModulesProvider";

export const Route = createFileRoute("/_authenticated/minutes")({
  component: MinutesPage,
  head: () => ({ meta: [{ title: "Recent Discussions — SSACC" }] }),
});

function MinutesPage() {
  const { openModule } = useSidebarModules();

  useEffect(() => {
    openModule("discussions");
  }, [openModule]);

  return (
    <AppShell title="Recent Discussions" subtitle="Operations">
      <div className="panel p-6 text-muted-foreground mono text-[11px]">
        Recent Discussions opens in the sidebar panel. Use the sidebar if the panel was closed.
      </div>
    </AppShell>
  );
}
