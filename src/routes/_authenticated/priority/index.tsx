import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/priority/")({
  component: PriorityUnits,
});

function PriorityUnits() {
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  return (
    <AppShell title="Satellite Priority & Allocation" subtitle="Module 03 // Select Agency">
      {units.length === 0 ? (
        <Empty title="No agencies registered" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {units.map((u) => (
            <Link key={u.id} to="/priority/$unitId" params={{ unitId: u.id }} className="tile flex flex-col gap-2">
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><span className="label-eyebrow">Agency</span></div>
              <div className="mono text-lg font-bold uppercase">{u.code}</div>
              <div className="text-xs text-muted-foreground">{u.name}</div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}