import { createFileRoute } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BeidouMonitoringView } from "@/components/beidou/BeidouMonitoringView";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";

export const Route = createFileRoute("/_authenticated/beidou/")({
  component: BeidouMonitoringPage,
  head: () => ({ meta: [{ title: "Beidou Monitoring System — SSACC" }] }),
});

function BeidouMonitoringPage() {
  return (
    <AppShell
      title="Beidou Monitoring System"
      headerIcon={<HomeNavIconBadge icon={Globe} theme="visibility" size="md" />}
      showBack
      backLink={{ to: "/" }}
      horizontalNav={null}
      fillMain
    >
      <BeidouMonitoringView />
    </AppShell>
  );
}
