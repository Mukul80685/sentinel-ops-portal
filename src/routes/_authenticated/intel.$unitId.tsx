import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { IntelSatelliteDrillDown } from "@/components/intel/IntelSatelliteDrillDown";
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Database, Satellite } from "lucide-react";
import { ccModuleBackLink } from "@/lib/controlCenter";
import {
  buildIntelDrillDownReport,
  buildIntelLinkageContext,
  buildIntelSatelliteTable,
  formatIntelCompactDate,
  hasIntelData,
} from "@/lib/intelAnalysisData";
import { INT_UNITS } from "@/lib/intelRepository";
import { ENGAGEMENTS_ALL_KEY, fetchAllEngagements } from "@/lib/engagementEngine";

export const Route = createFileRoute("/_authenticated/intel/$unitId")({
  validateSearch: (search: Record<string, unknown>) => ({
    satellite: typeof search.satellite === "string" ? search.satellite : undefined,
  }),
  component: IntelUnitView,
});

function TableSkeleton() {
  return (
    <div className="panel flex-1 flex flex-col min-h-0 overflow-hidden animate-pulse">
      <div className="px-3 py-1.5 border-b border-border bg-secondary/20 h-8" />
      <div className="flex-1 divide-y divide-border">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="px-3 py-2.5 flex gap-3">
            <div className="h-3 w-5 bg-secondary/50 rounded" />
            <div className="h-3 flex-1 bg-secondary/40 rounded" />
            <div className="h-3 w-16 bg-secondary/40 rounded" />
            <div className="h-3 w-16 bg-secondary/40 rounded" />
            <div className="h-3 w-14 bg-secondary/40 rounded" />
            <div className="h-3 w-12 bg-secondary/40 rounded" />
            <div className="h-3 w-28 bg-secondary/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function IntelUnitView() {
  const { unitId } = Route.useParams();
  const { satellite: searchSatellite } = Route.useSearch();
  const navigate = useNavigate();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const unit = useMemo(() => {
    const local = INT_UNITS.find((u) => u.id === unitId);
    if (local) return local;
    const db = dbUnits.find((u) => u.id === unitId);
    if (db) return { id: db.id, code: db.code, name: db.name, location: db.description ?? "—" };
    return null;
  }, [unitId, dbUnits]);

  const resolvedUnitId = unit?.id ?? unitId;
  const dataAvailable = hasIntelData(resolvedUnitId);

  const dbUnitId = useMemo(() => {
    if (!unit) return unitId;
    const db = dbUnits.find((u) => u.code === unit.code || u.id === unit.id);
    return db?.id ?? unit.id;
  }, [unit, unitId, dbUnits]);

  const { data: engagements = [], isLoading: engLoading } = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    staleTime: 30_000,
    enabled: dataAvailable,
  });

  const unitEngagements = useMemo(
    () => engagements.filter((e: any) => e.unit_id === dbUnitId),
    [engagements, dbUnitId],
  );

  const { data: visibilityRows = [], isLoading: visLoading } = useQuery({
    queryKey: ["visibility", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("unit_beam_visibility")
        .select("beam_id, visible, beams:beam_id(band, satellite_id, satellites:satellite_id(name))")
        .eq("unit_id", dbUnitId)
        .eq("visible", true);
      return data ?? [];
    },
    enabled: dataAvailable && !!dbUnitId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: equipment = [], isLoading: eqLoading } = useQuery({
    queryKey: ["unit-equipment-intel", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment")
        .select("id, serviceability, category:category_id(name)")
        .eq("unit_id", dbUnitId);
      return data ?? [];
    },
    enabled: dataAvailable && !!dbUnitId,
    staleTime: 30_000,
  });

  const linkageCtx = useMemo(
    () => buildIntelLinkageContext(resolvedUnitId, unitEngagements, visibilityRows, equipment),
    [resolvedUnitId, unitEngagements, visibilityRows, equipment],
  );

  const tableRows = useMemo(
    () => (dataAvailable && unit ? buildIntelSatelliteTable(resolvedUnitId, linkageCtx, unitEngagements) : []),
    [dataAvailable, unit, resolvedUnitId, linkageCtx, unitEngagements],
  );

  const drillDown = useMemo(
    () =>
      selectedReportId && unit
        ? buildIntelDrillDownReport(resolvedUnitId, selectedReportId, linkageCtx, unitEngagements)
        : null,
    [selectedReportId, unit, resolvedUnitId, linkageCtx, unitEngagements],
  );

  const isLoading = dataAvailable && (engLoading || visLoading || eqLoading);

  useEffect(() => {
    if (!searchSatellite || !dataAvailable || tableRows.length === 0) return;
    const target = searchSatellite.trim().toLowerCase();
    const match = tableRows.find((r) => r.satelliteName.toLowerCase() === target);
    if (match) setSelectedReportId(match.reportId);
  }, [searchSatellite, tableRows, dataAvailable]);

  if (!unit) {
    return (
      <AppShell title="INT Repository" showBack backLink={ccModuleBackLink("intel")} horizontalNav={null}>
        <Empty title="Unit not found" hint="Return to the repository home and select a valid unit." />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`INT Repository — Unit ${unit.code}`}
      subtitle={unit.name}
      showBack
      backLink={ccModuleBackLink("intel")}
      headerIcon={<Satellite className="h-4 w-4 shrink-0" />}
      horizontalNav={null}
    >
      <div className="flex flex-col h-[calc(100vh-6.5rem)] min-h-0 gap-1">
        <div className="shrink-0 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate({ to: "/control-center", search: { module: "intel" } })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-border bg-card
                       hover:bg-secondary/60 hover:border-primary/40 mono text-[10px] uppercase tracking-wider text-foreground
                       transition-all cursor-pointer"
          >
            <ArrowLeft className="h-3 w-3" /> All Units
          </button>
          {dataAvailable && (
            <span className="mono text-[10px] text-foreground/80">
              {tableRows.length} satellite report{tableRows.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {!dataAvailable ? (
          <div className="panel p-4 flex flex-col items-center justify-center text-center gap-2 flex-1">
            <Database className="h-7 w-7 text-foreground/30" />
            <div>
              <p className="mono text-[12px] font-bold uppercase tracking-wider text-foreground">
                No data uploaded
              </p>
              <p className="mono text-[10px] text-foreground/75 mt-1 max-w-sm">
                Unit {unit.code} has no intelligence records in the repository yet.
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <TableSkeleton />
        ) : tableRows.length === 0 ? (
          <Empty
            title="No satellite reports"
            hint={
              !linkageCtx.resourcesServiceable
                ? "Resources are unserviceable — scans cannot produce INT output."
                : "No intelligence data for this unit."
            }
          />
        ) : (
          <div className="panel flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="shrink-0 px-2.5 py-1 border-b border-border bg-secondary/25 flex items-center gap-2">
              <Satellite className="h-3.5 w-3.5 text-primary" />
              <span className="mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                Satellite Scan Reports
              </span>
              {!linkageCtx.resourcesServiceable && (
                <span className="mono text-[9px] text-destructive ml-auto uppercase">
                  Resources unserviceable
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1">
              {/* Column template: # | satellite (slightly wider) | 3 equal numeric | productivity | date */}
              <div
                className="grid items-center gap-x-2 sticky top-0 z-10 bg-secondary/30 backdrop-blur-sm border-b border-border
                           [grid-template-columns:2rem_minmax(0,1.35fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,0.9fr)]"
              >
                <Th align="center">#</Th>
                <Th align="left">Satellite</Th>
                <Th align="center">Scanned</Th>
                <Th align="center">Analyzed</Th>
                <Th align="center">Pending</Th>
                <Th align="center">Productivity</Th>
                <Th align="center">Last Updated</Th>
              </div>
              <div className="divide-y divide-border/50">
                {tableRows.map((row, idx) => (
                  <div
                    key={row.reportId}
                    role="row"
                    tabIndex={0}
                    onClick={() => setSelectedReportId(row.reportId)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedReportId(row.reportId)}
                    className="grid items-center gap-x-2 cursor-pointer hover:bg-primary/8 transition-colors
                               [grid-template-columns:2rem_minmax(0,1.35fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,0.9fr)]"
                  >
                    <div className="px-1 py-2 mono text-[11px] text-foreground tabular-nums text-center">
                      {idx + 1}
                    </div>
                    <div className="px-1 py-2 min-w-0 text-left">
                      <div className="mono text-[12px] font-bold text-foreground uppercase leading-tight">
                        {row.satelliteName}
                      </div>
                      <div className="mono text-[10px] text-foreground/75 leading-tight">{row.polarization}</div>
                      {!row.scanEligible && (
                        <span className="inline-block mt-0.5 mono text-[8px] font-bold uppercase px-1 py-px rounded-sm border border-muted-foreground/30 text-muted-foreground bg-secondary/40">
                          No visibility
                        </span>
                      )}
                      {row.engagementStatus && row.scanEligible && (
                        <span className="inline-block mt-0.5 mono text-[8px] font-bold uppercase px-1 py-px rounded-sm border border-primary/30 text-primary bg-primary/8">
                          {row.engagementStatus}
                        </span>
                      )}
                    </div>
                    <div className={`px-1 py-2 mono text-[12px] text-center font-semibold tabular-nums ${!row.scanEligible ? "text-muted-foreground" : "text-foreground"}`}>
                      {row.totalScanned.toLocaleString()}
                    </div>
                    <div className={`px-1 py-2 mono text-[12px] text-center font-semibold tabular-nums ${!row.scanEligible ? "text-muted-foreground" : "text-foreground"}`}>
                      {row.analyzed.toLocaleString()}
                    </div>
                    <div className={`px-1 py-2 mono text-[12px] text-center font-semibold tabular-nums ${!row.scanEligible ? "text-muted-foreground" : "text-foreground"}`}>
                      {row.pending.toLocaleString()}
                    </div>
                    <div className="px-1 py-2 text-center">
                      {row.productivityScore === null ? (
                        <span className="mono text-[10px] font-bold uppercase text-muted-foreground">N/A</span>
                      ) : (
                        <span
                          className={`mono text-[12px] font-bold tabular-nums ${
                            row.productivityScore >= 60
                              ? "text-emerald-700"
                              : row.productivityScore >= 35
                                ? "text-amber-700"
                                : "text-foreground"
                          }`}
                        >
                          {row.productivityScore}%
                        </span>
                      )}
                    </div>
                    <div className="px-1 py-2 mono text-[11px] text-muted-foreground tabular-nums text-center">
                      {row.reportTimestamp ? formatIntelCompactDate(row.reportTimestamp) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0 px-2.5 py-1 border-t border-border bg-secondary/10">
              <span className="mono text-[9px] uppercase tracking-wider text-foreground/80">
                Click a row for detailed intelligence analysis
              </span>
            </div>
          </div>
        )}
      </div>

      <IntelSatelliteDrillDown
        report={drillDown}
        open={!!selectedReportId && !!drillDown}
        onClose={() => setSelectedReportId(null)}
      />
    </AppShell>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
}) {
  const alignCls =
    align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  return (
    <div
      className={`px-1 py-2 mono text-[9px] uppercase tracking-wide text-foreground font-bold ${alignCls}`}
    >
      {children}
    </div>
  );
}
