import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/minutes")({
  component: MinutesPage,
  head: () => ({ meta: [{ title: "Minutes — SSACC" }] }),
});

function MinutesPage() {
  return (
    <AppShell title="Minutes" subtitle="Operations">
      <div className="panel p-6 text-muted-foreground">Meeting minutes — coming soon.</div>
    </AppShell>
  );
}
