import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/engagement/")({
  component: EngagementUnits,
});

function EngagementUnits() {
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const { data: counts = {} } = useQuery({
    queryKey: ["eng-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("engagements").select("unit_id,status");
      const m: Record<string, number> = {};
      (data ?? []).forEach((e: any) => { if (e.status !== "Completed") m[e.unit_id] = (m[e.unit_id] ?? 0) + 1; });
      return m;
    },
  });
  return (
    <AppShell title="Present Engagement Status" subtitle="Module 04 // Select Agency">
      {units.length === 0 ? <Empty title="No agencies registered" /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {units.map((u) => (
            <Link key={u.id} to="/engagement/$unitId" params={{ unitId: u.id }} className="tile flex items-center justify-between">
              <div>
                <div className="label-eyebrow">Agency</div>
                <div className="mono text-lg font-bold uppercase">{u.code}</div>
                <div className="text-xs text-muted-foreground">{u.name}</div>
              </div>
              <div className="text-right">
                <Activity className="h-4 w-4 text-primary ml-auto" />
                <div className="mono text-xl font-bold mt-1">{counts[u.id] ?? 0}</div>
                <div className="label-eyebrow">Active</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}