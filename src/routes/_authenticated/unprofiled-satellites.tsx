import { createFileRoute } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { UnprofiledSatellitesView } from "@/components/unprofiled-satellites/UnprofiledSatellitesView";

export const Route = createFileRoute("/_authenticated/unprofiled-satellites")({
  component: UnprofiledSatellitesPage,
  head: () => ({ meta: [{ title: "Unprofiled Satellites — SSACC" }] }),
});

function UnprofiledSatellitesPage() {
  return (
    <AppShell
      title="Unprofiled Satellites"
      headerIcon={<HomeNavIconBadge icon={Globe2} theme="visibility" size="md" />}
      horizontalNav={null}
    >
      <UnprofiledSatellitesView />
    </AppShell>
  );
}
