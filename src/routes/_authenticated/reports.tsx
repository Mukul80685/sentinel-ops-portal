import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports and Returns — SSACC" }] }),
});

function ReportsPage() {
  return (
    <AppShell title="Reports and Returns" subtitle="Operations">
      <div className="panel p-6 text-muted-foreground">Reports and returns module — coming soon.</div>
    </AppShell>
  );
}
