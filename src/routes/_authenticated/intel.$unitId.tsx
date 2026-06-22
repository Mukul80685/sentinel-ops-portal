import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Satellite } from "lucide-react";
import {
  INT_UNITS,
  mergeRecords,
  normalizeDbRow,
  groupBySatellite,
  formatDisplayDate,
  productivityColor,
} from "@/lib/intelRepository";

export const Route = createFileRoute("/_authenticated/intel/$unitId")({
  component: IntelUnitView,
});

function IntelUnitView() {
  const { unitId } = Route.useParams();
  const navigate = useNavigate();

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const unit = useMemo(() => {
    const local = INT_UNITS.find((u) => u.id === unitId);
    if (local) return local;
    const db = dbUnits.find((u) => u.id === unitId);
    if (db) return { id: db.id, code: db.code, name: db.name, location: db.location ?? "—" };
    return null;
  }, [unitId, dbUnits]);

  const { data: dbRows = [], isLoading } = useQuery({
    queryKey: ["intel", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intel_records")
        .select("*, satellites:satellite_id(name), units:unit_id(code)")
        .eq("unit_id", unitId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!unitId,
  });

  const records = useMemo(() => {
    if (!unit) return [];
    const normalized = dbRows.map((r) =>
      normalizeDbRow(r as Record<string, unknown>, unit.name),
    );
    return mergeRecords(normalized, unitId, unit.name);
  }, [dbRows, unitId, unit]);

  const satelliteSummaries = useMemo(() => groupBySatellite(records), [records]);

  if (!unit) {
    return (
      <AppShell title="INT Repository" showBack>
        <Empty title="Unit not found" hint="Return to the repository home and select a valid unit." />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`INT Repository — ${unit.name}`}
      subtitle="Satellite Exploitation Summaries"
      showBack
      headerIcon={<Satellite className="h-4 w-4 shrink-0" />}
    >
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => navigate({ to: "/intel" })}
          className="mono text-[11px] uppercase tracking-wider flex items-center gap-1
                     text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Units
        </button>
        <span className="text-muted-foreground/40">·</span>
        <span className="mono text-[11px] text-muted-foreground">
          {satelliteSummaries.length} satellite profile{satelliteSummaries.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="panel p-3 mb-4">
        <div className="label-eyebrow">Unit Intelligence Overview</div>
        <p className="mono text-[11px] text-muted-foreground mt-1 leading-relaxed">
          Longitudinal exploitation summaries for satellites collected by {unit.name}.
          Select a satellite profile to access the full intelligence repository.
        </p>
      </div>

      {isLoading ? (
        <div className="panel p-6 text-center mono text-[11px] text-muted-foreground">Loading collection data…</div>
      ) : satelliteSummaries.length === 0 ? (
        <Empty
          title="No satellite profiles"
          hint="Import collection data via CSV or Excel to begin building the intelligence archive."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {satelliteSummaries.map((summary) => (
            <button
              key={summary.key}
              type="button"
              onClick={() =>
                navigate({
                  to: "/intel/$unitId/$satelliteKey",
                  params: { unitId, satelliteKey: summary.key },
                })
              }
              className="panel text-left p-4 hover:border-primary/60 hover:shadow-md
                         transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="mono text-sm font-bold uppercase tracking-tight text-foreground leading-tight">
                  {summary.satellite}
                </div>
                <Satellite className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              </div>

              <div className="mt-3 space-y-1.5 text-[10px] mono">
                <CardRow label="Polarization" value={summary.polarization} />
                <CardRow label="Total Frequencies Scanned" value={summary.totalScanned.toLocaleString()} />
                <CardRow
                  label="Productive"
                  value={summary.productive.toLocaleString()}
                  className="text-emerald-400"
                />
                <CardRow label="Non-Productive" value={summary.nonProductive.toLocaleString()} />
                {summary.partiallyProductive > 0 && (
                  <CardRow
                    label="Partially Productive"
                    value={summary.partiallyProductive.toLocaleString()}
                    className="text-amber-400"
                  />
                )}
                <CardRow
                  label="Latest Update"
                  value={summary.latestUpdate ? formatDisplayDate(summary.latestUpdate) : "—"}
                />
              </div>

              <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between">
                <span className="text-[10px] mono text-muted-foreground">{summary.country}</span>
                <span className={`text-[10px] mono font-medium ${productivityColor(
                  summary.productive > summary.nonProductive ? "productive" : "non-productive",
                )}`}>
                  {summary.totalScanned > 0
                    ? `${Math.round((summary.productive / summary.totalScanned) * 100)}% success`
                    : "—"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function CardRow({
  label,
  value,
  className = "text-foreground",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={`font-medium ${className}`}>{value}</span>
    </div>
  );
}
