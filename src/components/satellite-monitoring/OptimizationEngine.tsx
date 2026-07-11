import { useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Zap,
} from "lucide-react";
import { DASHBOARD_PANEL_LABELS, DASHBOARD_PANEL_PURPOSE } from "@/lib/dashboardLabels";
import { useDashboardData } from "@/hooks/useDashboardData";
import type { OperationalFleetState, UnitOptimizationData } from "@/lib/operationalState";
import { scoreRingPalette, useEngagementRingVisuals } from "@/lib/engagementRingVisuals";
import {
  OPT_FACTOR_DEFS,
  riskLevel,
  scoreColor,
  scorebar,
  unitNavKey,
} from "@/components/satellite-monitoring/dashboardUtils";

type OptStatus = UnitOptimizationData["status"];

function formatOptStatus(status: OptStatus): string {
  if (status === "NOT_ALLOTTED") return "Not Allotted";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function optStatusBadgeCls(status: OptStatus): string {
  if (status === "OPTIMIZED") return "text-emerald-700 bg-emerald-500/10 border-emerald-500/25";
  if (status === "SUBOPTIMAL") return "text-amber-600 bg-amber-400/10 border-amber-400/25";
  if (status === "NOT_ALLOTTED") return "text-secondary-foreground bg-secondary/50 border-border";
  return "text-destructive bg-destructive/10 border-destructive/25";
}

function SortThOpt({
  col,
  sortKey,
  sortDir,
  onSort,
  children,
}: {
  col: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (col: string) => void;
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

function RadialGauge({ score, label, size = 96 }: { score: number; label: string; size?: number }) {
  const sw = 9;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const palette = scoreRingPalette(score);
  const { trackStroke, arcStroke, defs } = useEngagementRingVisuals(palette);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="le-progress-ring relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          {defs}
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackStroke} strokeWidth={sw} />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={arcStroke}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - score / 100)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`mono text-[17px] font-bold leading-none ${scoreColor(score)}`}>{score}</span>
        </div>
      </div>
      <div className="text-center space-y-0.5">
        <div className="mono text-[10px] font-semibold uppercase tracking-wide text-foreground leading-tight">{label}</div>
        <div className={`mono text-[10px] font-bold ${scoreColor(score)}`}>
          {score >= 70 ? "Good" : score >= 45 ? "Average" : "Poor"}
        </div>
      </div>
    </div>
  );
}

function CompositeScoreRing({ score }: { score: number }) {
  const sz = 120;
  const sw = 12;
  const r = (sz - sw) / 2;
  const c = 2 * Math.PI * r;
  const cx = sz / 2;
  const palette = scoreRingPalette(score);
  const { trackStroke, arcStroke, defs } = useEngagementRingVisuals(palette);
  return (
    <div className="le-progress-ring relative" style={{ width: sz, height: sz }}>
      <svg width={sz} height={sz} style={{ transform: "rotate(-90deg)" }}>
        {defs}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackStroke} strokeWidth={sw} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={arcStroke}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`mono text-[28px] font-bold leading-none ${scoreColor(score)}`}>{score}</span>
        <span className="mono text-[11px] font-semibold text-foreground">/100</span>
      </div>
    </div>
  );
}

function resolveSelectedUnit(
  fleetState: OperationalFleetState | null,
  selectedUnitKey: string | undefined,
) {
  if (!fleetState || !selectedUnitKey) return null;
  return (
    fleetState.units.find(
      (u) =>
        u.unitDbId === selectedUnitKey ||
        unitNavKey(u.unitDbId, u.unitCode).toUpperCase() === selectedUnitKey.toUpperCase(),
    ) ?? null
  );
}

function UnitDetailView({ data, onBack }: { data: UnitOptimizationData; onBack: () => void }) {
  const entries = OPT_FACTOR_DEFS.map((f) => ({ ...f, entry: data[f.key] }));
  const risk = riskLevel(data);
  const statusBadgeCls =
    data.status === "OPTIMIZED"
      ? "text-emerald-600 bg-emerald-500/8 border-emerald-500/20"
      : data.status === "SUBOPTIMAL"
        ? "text-amber-500 bg-amber-400/8 border-amber-400/20"
        : data.status === "NOT_ALLOTTED"
          ? "text-secondary-foreground bg-secondary/50 border-border"
          : "text-destructive bg-destructive/8 border-destructive/20";

  return (
    <div className="space-y-3">
      <div className="panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-secondary/20 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 mono text-[11px] font-semibold uppercase tracking-wide text-foreground hover:text-primary transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Optimization Table
          </button>
          <span className="text-border">·</span>
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="mono text-[13px] font-bold uppercase tracking-wider text-foreground">
            {data.unitLabel} — Optimization Detail
          </span>
        </div>
        <div className="px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex flex-col items-center shrink-0">
            <CompositeScoreRing score={data.compositeScore} />
            <span className={`inline-block mt-2 mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${statusBadgeCls}`}>
              {formatOptStatus(data.status)}
            </span>
          </div>
          <div className="flex-1 space-y-2.5 w-full">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(
                [
                  { label: "Satellite Load", value: `${data.satelliteLoad}/${data.maxCapacity}`, warn: data.satelliteLoad > data.maxCapacity },
                  { label: "Risk Level", value: risk, warn: risk === "High" },
                  { label: "Active Parameters", value: "3 factors", warn: false },
                ] as const
              ).map((m) => (
                <div key={m.label} className="bg-secondary/30 rounded-sm border border-border px-3 py-2.5">
                  <div className={`mono text-[15px] font-bold leading-none ${m.warn ? "text-destructive" : "text-foreground"}`}>{m.value}</div>
                  <div className="mono text-[10px] font-semibold uppercase tracking-wider text-foreground mt-1">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-secondary/20 flex items-center gap-3">
          <span className="mono text-[12px] font-bold uppercase tracking-wider text-foreground">Score Breakdown</span>
          <span className="mono text-[10px] font-medium text-foreground">Equal weight across three parameters</span>
        </div>
        <div className="px-4 pt-4 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-6 border-b border-border">
          {entries.map(({ key, label, weight, entry }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <RadialGauge score={entry.score} label={label} />
              <span className="mono text-[10px] font-semibold text-foreground">{Math.round(weight * 100)}% wt</span>
              {entry.severity !== "ok" && (
                <div className={`flex items-center gap-0.5 mono text-[10px] font-bold uppercase ${entry.severity === "critical" ? "text-destructive" : "text-amber-600"}`}>
                  <AlertTriangle className="h-3 w-3" />
                  {entry.severity === "critical" ? "Critical" : "Warn"}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-3">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-foreground font-bold mb-2">Detected Issues</div>
          {entries.filter((e) => e.entry.severity !== "ok").length === 0 ? (
            <p className="mono text-[11px] font-medium text-emerald-600 py-1">All factors within optimal thresholds</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {entries
                .filter((e) => e.entry.severity !== "ok")
                .map(({ label, entry }) => (
                  <div
                    key={label}
                    className={`rounded-sm border px-3 py-2.5 ${
                      entry.severity === "critical"
                        ? "border-destructive/20 bg-destructive/4"
                        : "border-amber-400/20 bg-amber-400/4"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`mono text-[11px] font-bold uppercase tracking-wide ${entry.severity === "critical" ? "text-destructive" : "text-amber-600"}`}>
                        {label}
                      </span>
                      <span className={`mono text-[12px] font-bold ${scoreColor(entry.score)}`}>{entry.score}/100</span>
                    </div>
                    {entry.issues.map((iss, i) => (
                      <div key={i} className="mono text-[10px] font-medium text-foreground leading-snug">
                        · {iss}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Live optimization scores — Resource Inventory + Priority + Serviceability. */
export function OptimizationEngine() {
  const navigate = useNavigate();
  const selectedUnitKey = useRouterState({
    select: (s) => (s.location.search as { unit?: string }).unit,
  });
  const { fleetState, optimization, isLoading } = useDashboardData();
  const [sortKey, setSortKey] = useState<"unit" | "score" | "status" | "risk">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<OptStatus | "ALL">("ALL");
  const [tableExpanded, setTableExpanded] = useState(false);

  const handleSort = (col: string) => {
    const k = col as typeof sortKey;
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const statusOrder: Record<OptStatus, number> = {
    NOT_ALLOTTED: 0,
    MISALLOCATED: 1,
    SUBOPTIMAL: 2,
    OPTIMIZED: 3,
  };
  const riskOrder: Record<"High" | "Medium" | "Low", number> = { High: 0, Medium: 1, Low: 2 };

  const rows = useMemo(() => {
    if (!fleetState) return [];
    return [...fleetState.units]
      .map((state) => ({
        state,
        data: optimization.byUnitId.get(state.unitDbId)!,
      }))
      .filter(({ data }) => data && (filterStatus === "ALL" || data.status === filterStatus))
      .sort((a, b) => {
        const da = a.data;
        const db = b.data;
        let diff = 0;
        if (sortKey === "score") diff = da.compositeScore - db.compositeScore;
        if (sortKey === "unit") diff = a.state.unitLabel.localeCompare(b.state.unitLabel);
        if (sortKey === "status") diff = statusOrder[da.status] - statusOrder[db.status];
        if (sortKey === "risk") diff = riskOrder[riskLevel(da)] - riskOrder[riskLevel(db)];
        return sortDir === "asc" ? diff : -diff;
      });
  }, [fleetState, optimization.byUnitId, filterStatus, sortKey, sortDir]);

  const selectedUnit = resolveSelectedUnit(fleetState, selectedUnitKey);
  const selectedOpt = selectedUnit ? optimization.byUnitId.get(selectedUnit.unitDbId) : undefined;

  if (selectedUnit && selectedOpt) {
    return (
      <UnitDetailView
        data={selectedOpt}
        onBack={() =>
          navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, unit: undefined }) })
        }
      />
    );
  }

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
          <span className="mono text-[10px] font-semibold text-secondary-foreground bg-secondary border border-border px-1.5 py-0.5 rounded-sm leading-none uppercase tracking-[0.15em]">
            Unit Ranking
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(["ALL", "OPTIMIZED", "SUBOPTIMAL", "MISALLOCATED", "NOT_ALLOTTED"] as const).map((s) => {
            const on = filterStatus === s;
            const label =
              s === "ALL" ? "All" : s === "NOT_ALLOTTED" ? "Not Allotted" : formatOptStatus(s);
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`mono text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-sm border transition-colors ${
                  on
                    ? s === "OPTIMIZED"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700"
                      : s === "SUBOPTIMAL"
                        ? "bg-amber-400/15 border-amber-400/40 text-amber-600"
                        : s === "MISALLOCATED"
                          ? "bg-destructive/12 border-destructive/30 text-destructive"
                          : s === "NOT_ALLOTTED"
                            ? "bg-secondary border-border text-secondary-foreground"
                            : "bg-secondary border-border text-secondary-foreground"
                    : "border-border text-foreground hover:bg-secondary/40 hover:text-secondary-foreground"
                }`}
              >
                {label}
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
                <th className="px-4 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground w-10">#</th>
                <SortThOpt col="unit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Unit</SortThOpt>
                <SortThOpt col="score" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Opt. Score</SortThOpt>
                <SortThOpt col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Status</SortThOpt>
                <SortThOpt col="risk" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Risk Level</SortThOpt>
                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {(tableExpanded ? rows : rows.slice(0, 4)).map(({ state, data: d }, idx) => {
                const risk = riskLevel(d);
                const sb = optStatusBadgeCls(d.status);
                const rb =
                  risk === "Low"
                    ? "text-emerald-700 bg-emerald-500/8 border-emerald-500/20"
                    : risk === "Medium"
                      ? "text-amber-600 bg-amber-400/8 border-amber-400/20"
                      : "text-destructive bg-destructive/8 border-destructive/20";
                const navKey = unitNavKey(state.unitDbId, state.unitCode);
                return (
                  <tr
                    key={state.unitDbId}
                    onClick={() =>
                      navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, unit: navKey }) })
                    }
                    className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <span className="mono text-[11px] font-semibold text-foreground">{idx + 1}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="mono text-[14px] font-bold text-foreground whitespace-nowrap">{state.unitLabel}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`mono text-[15px] font-bold ${scoreColor(d.compositeScore)}`}>{d.compositeScore}</span>
                        <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className={`h-full rounded-full ${scorebar(d.compositeScore)}`} style={{ width: `${d.compositeScore}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${sb}`}>
                        {formatOptStatus(d.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${rb}`}>{risk}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-foreground/40 group-hover:text-primary transition-colors ml-auto" />
                    </td>
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
          onClick={() => setTableExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-border bg-secondary/10 hover:bg-secondary/25 transition-colors"
        >
          <span className="mono text-[10px] uppercase tracking-wider text-foreground font-semibold">
            {tableExpanded ? "Show less" : `Show all ${rows.length} units`}
          </span>
          {tableExpanded ? <ChevronUp className="h-3.5 w-3.5 text-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-foreground" />}
        </button>
      )}
    </div>
  );
}
