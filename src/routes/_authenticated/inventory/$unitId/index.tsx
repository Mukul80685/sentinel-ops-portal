import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { listCategories } from "@/lib/queries";
import { Boxes } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory/$unitId/")({
  component: InventoryCategories,
});

function InventoryCategories() {
  const { unitId } = Route.useParams();
  const { data: unit } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: async () => {
      const { data } = await supabase.from("units").select("*").eq("id", unitId).maybeSingle();
      return data;
    },
  });
  const { data: cats = [] } = useQuery({ queryKey: ["cats"], queryFn: listCategories });
  const { data: counts = {} } = useQuery({
    queryKey: ["eq-counts", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment")
        .select("category_id")
        .eq("unit_id", unitId);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => (map[r.category_id] = (map[r.category_id] ?? 0) + 1));
      return map;
    },
  });

  return (
    <AppShell
      title={unit ? `${unit.code} — ${unit.name}` : "Agency"}
      subtitle="Resource Inventory // Categories"
      showBack
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
        {cats.map((c) => (
          <Link
            key={c.id}
            to="/inventory/$unitId/$categoryId"
            params={{ unitId, categoryId: c.id }}
            className="tile flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 grid place-items-center rounded-sm border border-border bg-secondary text-primary">
                <Boxes className="h-4 w-4" />
              </div>
              <div>
                <div className="label-eyebrow">Category</div>
                <div className="mono text-sm font-bold uppercase">{c.name}</div>
              </div>
            </div>
            <div className="mono text-xl font-bold">{counts[c.id] ?? 0}</div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}