import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { exportCsv, statusClass } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/serviceability")({ component: ServiceabilityPage });

function ServiceabilityPage() {
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["serv"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("id,name,remarks,serviceability, units:unit_id(code,name), category:category_id(name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => rows.filter((r: any) => {
    if (statusF && r.serviceability !== statusF) return false;
    if (q) {
      const hay = `${r.name} ${r.units?.code} ${r.category?.name} ${r.remarks ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, statusF]);

  const counts = useMemo(() => {
    const c = { Operational: 0, "Partially Serviceable": 0, "Under Repair": 0, "Non-Serviceable": 0 } as Record<string, number>;
    rows.forEach((r: any) => { c[r.serviceability] = (c[r.serviceability] ?? 0) + 1; });
    return c;
  }, [rows]);

  return (
    <AppShell
      title="Serviceability State"
      subtitle="Operational Readiness // All Agencies"
      actions={
        <Button variant="outline" size="sm" onClick={() => exportCsv(filtered.map((r: any) => ({ Agency: r.units?.code, Resource: r.category?.name, Equipment: r.name, Serviceability: r.serviceability, Remarks: r.remarks ?? "" })), "serviceability.csv")} className="mono text-[11px] uppercase tracking-wider h-8">
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="panel p-3">
            <div className="flex items-center gap-2"><span className={`status-dot ${statusClass(k as any)}`} /><span className="label-eyebrow truncate">{k}</span></div>
            <div className="mono text-2xl font-bold mt-1">{v}</div>
          </div>
        ))}
      </div>

      <div className="panel p-3 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search equipment, agency, remarks" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7 mono" />
        </div>
        <select className="bg-input border border-border rounded-sm px-2 py-1.5 text-sm mono" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">All statuses</option>
          {["Operational","Partially Serviceable","Under Repair","Non-Serviceable"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Empty title="No equipment found" />
      ) : (
        <div className="panel overflow-auto">
          <table className="min-w-full text-sm mono">
            <thead className="bg-secondary">
              <tr>{["Agency","Resource","Equipment","Status","Remarks"].map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider border-r border-border">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-3 py-2 font-bold">{r.units?.code}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.category?.name}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><span className={`status-dot ${statusClass(r.serviceability)}`} /><span>{r.serviceability}</span></div></td>
                  <td className="px-3 py-2 text-muted-foreground">{r.remarks ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}