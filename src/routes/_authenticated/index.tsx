import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HomeLauncher } from "@/components/home/HomeLauncher";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({ meta: [{ title: "Home — SSACC" }] }),
});

function Home() {
  return (
    <AppShell isHome>
      <HomeLauncher />
    </AppShell>
  );
}
