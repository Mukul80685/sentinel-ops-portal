import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listSatellites } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCanEdit } from "@/lib/auth";
import { Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/important")({
  component: ImportantFrequencies,
});

function ImportantFrequencies() {
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const { data: rows = [] } = useQuery({
    queryKey: ["important"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("important_frequencies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const filterFn = (r: any) =>
      !q ||
      `${r.frequency} ${r.band ?? ""} ${r.label ?? ""}`.toLowerCase().includes(q.toLowerCase());
    return sats
      .map((s) => ({ sat: s, items: rows.filter((r: any) => r.satellite_id === s.id && filterFn(r)) }))
      .filter((g) => g.items.length > 0);
  }, [sats, rows, q]);

  async function remove(id: string) {
    const { error } = await supabase.from("important_frequencies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["important"] });
  }

  return (
    <AppShell title="Important Frequencies" subtitle="INT Repository // Bookmarked" showBack>
      <div className="panel p-3 mb-3">
        <div className="relative max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search frequency, band, label" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7 mono" />
        </div>
      </div>

      {grouped.length === 0 ? (
        <Empty
          title="No important frequencies yet"
          hint='Right-click any INT record and choose "Add to Important" to bookmark it here.'
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(({ sat, items }) => (
            <section key={sat.id} className="panel p-3">
              <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                <div>
                  <div className="label-eyebrow">Satellite</div>
                  <div className="mono text-sm font-bold uppercase">{sat.name}</div>
                </div>
                <div className="text-[11px] mono text-muted-foreground">{items.length} frequency(ies)</div>
              </div>
              <ul className="divide-y divide-border">
                {items.map((r: any) => (
                  <li key={r.id} className="py-2 flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-accent shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="mono text-sm">
                        {r.frequency}
                        {r.band && <span className="text-muted-foreground"> · {r.band}</span>}
                      </div>
                      {r.label && <div className="text-[11px] mono text-muted-foreground truncate">{r.label}</div>}
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => remove(r.id)} aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}