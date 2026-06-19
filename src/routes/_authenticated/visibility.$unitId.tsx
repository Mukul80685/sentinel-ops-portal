import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listSatellites, listUnits, exportCsv } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCanEdit } from "@/lib/auth";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/visibility/$unitId")({
  component: Visibility,
});

function Visibility() {
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [satFilter, setSatFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");

  const { data: sats = [] } = useQuery({ queryKey: ["sats"], queryFn: listSatellites });
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const { data: vis = [] } = useQuery({
    queryKey: ["vis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visibility").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    vis.forEach((v: any) => {
      m[v.satellite_id] ??= {};
      m[v.satellite_id][v.unit_id] = Number(v.eirp);
    });
    return m;
  }, [vis]);

  const filteredSats = sats.filter((s) =>
    (!q || s.name.toLowerCase().includes(q.toLowerCase()) || String(s.orbital_position).includes(q)) &&
    (!satFilter || s.id === satFilter)
  );
  const filteredUnits = units.filter((u) => !unitFilter || u.id === unitFilter);

  async function setEirp(satId: string, unitId: string, value: string) {
    const eirp = value === "" ? 0 : Number(value);
    if (Number.isNaN(eirp)) return;
    const { error } = await supabase
      .from("visibility")
      .upsert({ satellite_id: satId, unit_id: unitId, eirp }, { onConflict: "satellite_id,unit_id" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["vis"] });
  }

  function exportData() {
    const rows = filteredSats.map((s) => {
      const row: any = { Satellite: s.name, "Orbital Position": s.orbital_position };
      filteredUnits.forEach((u) => (row[u.code] = matrix[s.id]?.[u.id] ?? 0));
      return row;
    });
    exportCsv(rows, "visibility-matrix.csv");
  }

  return (
    <AppShell
      title="Satellite Visibility Metrics"
      subtitle="Module 02 // EIRP Matrix"
      actions={
        <Button variant="outline" size="sm" onClick={exportData} className="mono text-[11px] uppercase tracking-wider h-8">
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
      }
    >
      <div className="panel p-3 mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search satellite" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7 mono" />
        </div>
        <select className="bg-input border border-border rounded-sm px-2 py-1.5 text-sm mono" value={satFilter} onChange={(e) => setSatFilter(e.target.value)}>
          <option value="">All satellites</option>
          {sats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="bg-input border border-border rounded-sm px-2 py-1.5 text-sm mono" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
          <option value="">All agencies</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
        </select>
      </div>

      {sats.length === 0 || units.length === 0 ? (
        <Empty title="Matrix unavailable" hint="Register satellites and units to populate the visibility matrix." />
      ) : (
        <div className="panel overflow-auto">
          <table className="min-w-full text-sm mono">
            <thead className="bg-secondary text-foreground">
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 bg-secondary z-10 border-r border-border">Satellite</th>
                <th className="text-left px-3 py-2 border-r border-border">Orbit</th>
                {filteredUnits.map((u) => (
                  <th key={u.id} className="text-left px-3 py-2 border-r border-border uppercase text-[11px]">{u.code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSats.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-3 py-2 sticky left-0 bg-card z-10 border-r border-border font-bold">{s.name}</td>
                  <td className="px-3 py-2 border-r border-border text-muted-foreground">{Number(s.orbital_position).toFixed(1)}°E</td>
                  {filteredUnits.map((u) => {
                    const val = matrix[s.id]?.[u.id] ?? 0;
                    return (
                      <td key={u.id} className="px-3 py-1 border-r border-border">
                        {canEdit ? (
                          <input
                            defaultValue={val || ""}
                            placeholder="—"
                            onBlur={(e) => {
                              const cur = matrix[s.id]?.[u.id] ?? 0;
                              const next = Number(e.target.value || 0);
                              if (cur !== next) setEirp(s.id, u.id, e.target.value);
                            }}
                            className="w-16 bg-transparent border border-transparent hover:border-border focus:border-primary px-2 py-1 rounded-sm text-right"
                          />
                        ) : (
                          <span className={val ? "text-foreground" : "text-muted-foreground"}>{val || "—"}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] mono text-muted-foreground mt-3">0 or blank = not visible. EIRP values in dBW.</p>
    </AppShell>
  );
}