import { useMemo, useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";
import { DASHBOARD_PANEL_LABELS, DASHBOARD_PANEL_PURPOSE } from "@/lib/dashboardLabels";
import { useDashboardData } from "@/hooks/useDashboardData";
import { notifyOperationalDerivedRefresh } from "@/lib/operationalRefresh";
import type { UnitOptimizationData } from "@/lib/operationalState";
import { scoreColor, scorebar } from "@/components/satellite-monitoring/dashboardUtils";

type OptStatus = UnitOptimizationData["status"];
type SortKey = "unit" | "resource" | "serviceability" | "priority" | "score";

function statusLabel(data: UnitOptimizationData): string {
  if (!data.monitoringActive) return "Not Monitoring";
  if (data.status === "OPTIMIZED") return "Optimized";
  if (data.status === "SUBOPTIMAL") return "Sub-optimal";
  return "Misallocated";
}

function statusTextCls(data: UnitOptimizationData): string {
  if (!data.monitoringActive) return "text-muted-foreground";
  if (data.status === "OPTIMIZED") return "text-emerald-600";
  if (data.status === "SUBOPTIMAL") return "text-amber-600";
  return "text-destructive";
}

function SortTh({
  col,
  sortKey,
  sortDir,
  onSort,
  children,
}: {
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (col: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sortKey === col;
  return (
    <th
      className="px-3 py-2.5 text-left cursor-pointer select-none hover:bg-secondary/40 transition-colors"
      onClick={() => onSort(col)}
    >
      <div className="flex items-center gap-1 mono text-[10px] font-bold uppercase tracking-wider text-foreground">
        {children}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-primary" />
          )
        ) : (
          <span className="mono text-[10px] text-foreground/50">↕</span>
        )}
      </div>
    </th>
  );
}

function ScoreCell({ score, muted }: { score: number; muted?: boolean }) {
  const display = muted ? 0 : score;
  return (
    <td className="px-3 py-3 align-top min-w-[8.5rem]">
      <div className="flex items-center gap-2.5">
        <span
          className={`mono text-[15px] font-bold tabular-nums leading-none w-7 text-right shrink-0 ${muted ? "text-muted-foreground" : scoreColor(display)}`}
        >
          {display}
        </span>
        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden min-w-[3.5rem]">
          <div
            className={`h-full rounded-full ${muted ? "bg-muted-foreground/30" : scorebar(display)}`}
            style={{ width: `${display}%` }}
          />
        </div>
      </div>
    </td>
  );
}

function OverallScoreCell({ score, active }: { score: number; active: boolean }) {
  const display = active ? score : 0;
  return (
    <td className="px-3 py-3 align-top min-w-[9.5rem] border-l-2 border-primary/25 bg-primary/[0.04]">
      <div className="rounded-md border border-primary/20 bg-card/80 px-2.5 py-2 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span
            className={`mono text-[22px] font-bold tabular-nums leading-none w-9 text-right shrink-0 ${active ? scoreColor(display) : "text-muted-foreground"}`}
          >
            {display}
          </span>
          <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden min-w-[4rem]">
            <div
              className={`h-full rounded-full ${active ? scorebar(display) : "bg-muted-foreground/30"}`}
              style={{ width: `${display}%` }}
            />
          </div>
        </div>
      </div>
    </td>
  );
}

/** Optimization Engine — single-table view, INT-gated cross-module scores. */
export function OptimizationEngine() {
  const { fleetState, optimization, isLoading, derivedRevision } = useDashboardData();
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<OptStatus | "ALL" | "IDLE">("ALL");
  const [tableExpanded, setTableExpanded] = useState(false);

  useEffect(() => {
    notifyOperationalDerivedRefresh();
  }, []);

  const handleSort = (col: SortKey) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("desc");
    }
  };

  const rows = useMemo(() => {
    if (!fleetState) return [];
    return [...fleetState.units]
      .map((state) => ({
        state,
        data: optimization.byUnitId.get(state.unitDbId)!,
      }))
      .filter(({ data }) => {
        if (!data) return false;
        if (filterStatus === "ALL") return true;
        if (filterStatus === "IDLE") return !data.monitoringActive;
        return data.monitoringActive && data.status === filterStatus;
      })
      .sort((a, b) => {
        const da = a.data;
        const db = b.data;
        let diff = 0;
        if (sortKey === "score") diff = da.compositeScore - db.compositeScore;
        if (sortKey === "unit") diff = a.state.unitLabel.localeCompare(b.state.unitLabel);
        if (sortKey === "resource") diff = da.resource.score - db.resource.score;
        if (sortKey === "serviceability") diff = da.serviceability.score - db.serviceability.score;
        if (sortKey === "priority") diff = da.priority.score - db.priority.score;
        return sortDir === "asc" ? diff : -diff;
      });
  }, [fleetState, optimization, optimization.byUnitId, filterStatus, sortKey, sortDir, derivedRevision]);

  const visible = tableExpanded ? rows : rows.slice(0, 4);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-2.5">
          <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
          <span
            className="mono text-[12px] font-bold uppercase tracking-wider text-foreground"
            title={DASHBOARD_PANEL_PURPOSE.optimization}
          >
            {DASHBOARD_PANEL_LABELS.optimization}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(["ALL", "OPTIMIZED", "SUBOPTIMAL", "MISALLOCATED", "IDLE"] as const).map((s) => {
            const on = filterStatus === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`mono text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-sm border transition-colors ${
                  on
                    ? s === "OPTIMIZED"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700"
                      : s === "SUBOPTIMAL"
                        ? "bg-amber-400/15 border-amber-400/40 text-amber-600"
                        : s === "IDLE"
                          ? "bg-muted border-border text-muted-foreground"
                          : s === "MISALLOCATED"
                            ? "bg-destructive/12 border-destructive/30 text-destructive"
                            : "bg-secondary border-border text-secondary-foreground"
                    : "border-border text-foreground hover:bg-secondary/40 hover:text-secondary-foreground"
                }`}
              >
                {s === "ALL" ? "All" : s === "IDLE" ? "Not Monitoring" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="py-10 text-center mono text-[11px] uppercase tracking-wider text-foreground font-medium">
            Loading optimization data…
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/25">
                <th className="px-4 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground w-10">
                  #
                </th>
                <SortTh col="unit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Unit
                </SortTh>
                <SortTh col="resource" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Resource Utilization
                </SortTh>
                <SortTh col="serviceability" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Serviceability
                </SortTh>
                <SortTh col="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Satellite Prioritization
                </SortTh>
                <SortTh col="score" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Overall Score
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ state, data: d }, idx) => {
                const mutedFactors = !d.monitoringActive;
                return (
                  <tr
                    key={state.unitDbId}
                    className="border-b border-border/50 hover:bg-secondary/20 transition-colors align-top"
                  >
                    <td className="px-4 py-3">
                      <span className="mono text-[11px] font-semibold text-foreground">{idx + 1}</span>
                    </td>
                    <td className="px-3 py-3 min-w-[7rem]">
                      <div className="mono text-[14px] font-bold text-foreground whitespace-nowrap">
                        {state.unitLabel}
                      </div>
                      <div
                        className={`mono text-[9px] font-semibold uppercase tracking-wider mt-0.5 ${statusTextCls(d)}`}
                      >
                        {statusLabel(d)}
                      </div>
                    </td>
                    <ScoreCell score={d.resource.score} muted={mutedFactors} />
                    <ScoreCell score={d.serviceability.score} />
                    <ScoreCell score={d.priority.score} muted={mutedFactors} />
                    <OverallScoreCell score={d.compositeScore} active={d.monitoringActive} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!isLoading && rows.length === 0 && (
          <div className="py-10 text-center mono text-[11px] uppercase tracking-wider text-foreground font-medium">
            No units match the selected filter
          </div>
        )}
      </div>

      {rows.length > 4 && (
        <button
          type="button"
          onClick={() => setTableExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-border bg-secondary/10 hover:bg-secondary/25 transition-colors"
        >
          <span className="mono text-[10px] uppercase tracking-wider text-foreground font-semibold">
            {tableExpanded ? "Show less" : `Show all ${rows.length} units`}
          </span>
          {tableExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-foreground" />
          )}
        </button>
      )}
    </div>
  );
}
