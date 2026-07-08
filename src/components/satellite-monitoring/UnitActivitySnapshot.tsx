import { useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { DASHBOARD_PANEL_LABELS, DASHBOARD_PANEL_PURPOSE } from "@/lib/dashboardLabels";
import type { UnitActivityHistoryRow, UnitActivitySatRow } from "@/lib/operationalState";
import {
  formatBandPol,
  outcomeColor,
  scorebar,
  scoreColor,
} from "@/components/satellite-monitoring/dashboardUtils";

type UnitScanData = {
  activeSats: UnitActivitySatRow[];
  history: UnitActivityHistoryRow[];
};

function UnitRow({ unit, data, idx }: { unit: string; data: UnitScanData; idx: number }) {
  const [selSat, setSelSat] = useState(0);
  const [activeDrop, setActiveDrop] = useState(false);
  const [historyDrop, setHistoryDrop] = useState(false);

  if (data.activeSats.length === 0) {
    return (
      <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors align-top group">
        <td className="px-3 py-3 mono text-[11px] font-semibold text-foreground w-8">{idx}</td>
        <td className="px-3 py-3 w-24">
          <span className="mono text-[13px] font-bold text-foreground whitespace-nowrap">{unit}</span>
        </td>
        <td className="px-3 py-3 w-52">
          <span className="mono text-[11px] font-medium text-foreground uppercase tracking-wide">No active scans</span>
        </td>
        <td className="px-3 py-3 w-20"><span className="mono text-[14px] font-bold text-foreground">—</span></td>
        <td className="px-3 py-3 w-20"><span className="mono text-[14px] font-bold text-foreground">—</span></td>
        <td className="px-3 py-3 w-20"><span className="mono text-[14px] font-bold text-foreground">—</span></td>
        <td className="px-3 py-3 w-32"><span className="mono text-[11px] font-medium text-foreground">—</span></td>
        <td className="px-3 py-3 w-44">
          <span className="mono text-[11px] font-medium text-foreground truncate max-w-[120px]">
            {data.history[0]?.satellite ?? "—"}
          </span>
        </td>
      </tr>
    );
  }

  const sat = data.activeSats[selSat];
  const pending = sat.scanned - sat.analyzed;
  const pct = sat.analyzed > 0 ? Math.round((sat.productive / sat.analyzed) * 100) : 0;
  const bp = formatBandPol(sat.band, sat.pol);

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors align-top group">
      <td className="px-3 py-3 mono text-[11px] font-semibold text-foreground w-8">{idx}</td>
      <td className="px-3 py-3 w-24">
        <span className="mono text-[13px] font-bold text-foreground whitespace-nowrap">{unit}</span>
      </td>
      <td className="px-3 py-3 w-52 align-top">
        <button
          onClick={() => { setActiveDrop((p) => !p); setHistoryDrop(false); }}
          className="flex items-center gap-1.5 w-full text-left group/btn"
        >
          <span className="mono text-[12px] font-semibold text-foreground truncate max-w-[130px] group-hover/btn:text-primary transition-colors">
            {sat.satellite}
          </span>
          <span className="mono text-[9px] text-primary bg-primary/8 border border-primary/15 px-1 py-0.5 rounded-sm leading-none shrink-0 font-bold">
            {data.activeSats.length}
          </span>
          {activeDrop ? <ChevronUp className="h-3 w-3 shrink-0 text-foreground" /> : <ChevronDown className="h-3 w-3 shrink-0 text-foreground" />}
        </button>
        {activeDrop && (
          <div className="mt-1.5 border-t border-border pt-1.5">
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-foreground mb-1.5 font-semibold">
              Satellites Being Scanned: {data.activeSats.length}
            </div>
            {data.activeSats.map((s, i) => (
              <button
                key={s.satellite}
                onClick={() => { setSelSat(i); setActiveDrop(false); }}
                className={`flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded-sm hover:bg-secondary/50 transition-colors ${i === selSat ? "bg-primary/6" : ""}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${i === selSat ? "bg-primary" : "bg-border"}`} />
                <span className={`mono text-[11px] truncate ${i === selSat ? "text-primary font-semibold" : "text-foreground font-medium"}`}>
                  {s.satellite}
                </span>
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-3 w-20">
        <span className="mono text-[14px] font-bold text-foreground leading-none">{sat.scanned}</span>
      </td>
      <td className="px-3 py-3 w-20">
        <span className="mono text-[14px] font-bold text-foreground leading-none">{sat.analyzed}</span>
      </td>
      <td className="px-3 py-3 w-20">
        <span className={`mono text-[14px] font-bold leading-none ${pending > 0 ? "text-amber-600" : "text-foreground"}`}>{pending}</span>
      </td>
      <td className="px-3 py-3 w-32">
        <span className="mono text-[10px] font-semibold text-primary bg-primary/5 border border-primary/15 px-1.5 py-0.5 rounded-sm leading-none whitespace-nowrap">
          {bp}
        </span>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="mono text-[10px] font-bold text-emerald-600">P:{sat.productive}</span>
          <span className="mono text-[10px] font-semibold text-foreground">N:{sat.nonProductive}</span>
          <span className={`mono text-[10px] font-bold ${scoreColor(pct)}`}>{pct}%</span>
        </div>
        <div className="mt-1 w-full h-1 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full ${scorebar(pct)}`} style={{ width: `${pct}%` }} />
        </div>
      </td>
      <td className="px-3 py-3 w-44 align-top">
        <button
          onClick={() => { setHistoryDrop((p) => !p); setActiveDrop(false); }}
          className="flex items-center gap-1.5 w-full text-left group/hist"
        >
          <span className="mono text-[11px] font-medium text-foreground truncate max-w-[120px] group-hover/hist:text-primary transition-colors">
            {data.history[0]?.satellite ?? "—"}
          </span>
          {historyDrop ? <ChevronUp className="h-3 w-3 shrink-0 text-foreground" /> : <ChevronDown className="h-3 w-3 shrink-0 text-foreground" />}
        </button>
        {historyDrop && (
          <div className="mt-1.5 border-t border-border pt-1.5">
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-foreground mb-1.5 font-semibold">
              Previously Scanned
            </div>
            {data.history.map((h, i) => (
              <div key={i} className="flex items-center justify-between py-0.5 gap-1.5">
                <span className="mono text-[10px] font-medium text-foreground truncate flex-1">{h.satellite}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="mono text-[10px] font-medium text-foreground">{h.time}</span>
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${outcomeColor(h.outcome)}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

/** Live unit activity — derived from INT Repository + Visibility Metrics. */
export function UnitActivitySnapshot() {
  const [expanded, setExpanded] = useState(false);
  const { activity, isLoading } = useDashboardData();

  const unitRows = useMemo(
    () => [...activity.units].sort((a, b) => a.unitCode.localeCompare(b.unitCode)),
    [activity.units],
  );

  const activityByUnitId = useMemo(() => {
    const map = new Map<string, UnitScanData>();
    for (const entry of activity.units) {
      map.set(entry.unitDbId, { activeSats: entry.activeSats, history: entry.history });
    }
    return map;
  }, [activity.units]);

  const visible = expanded ? unitRows : unitRows.slice(0, 4);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-2.5">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span
            className="mono text-[12px] font-bold uppercase tracking-wider text-foreground"
            title={DASHBOARD_PANEL_PURPOSE.activity}
          >
            {DASHBOARD_PANEL_LABELS.activity}
          </span>
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.15em] text-foreground font-semibold">
          {unitRows.length} Units
        </span>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center mono text-[11px] text-foreground uppercase tracking-wider font-medium">
            Loading operational state…
          </div>
        ) : unitRows.length === 0 ? (
          <div className="px-4 py-8 text-center mono text-[11px] text-foreground uppercase tracking-wider font-medium">
            No units registered
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/25">
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground w-8">#</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Unit</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">
                  Active Satellites
                  <span className="ml-1.5 text-foreground/80 normal-case tracking-normal font-medium">(click ▾)</span>
                </th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Scanned</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Analyzed</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Pending</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Band · Pol</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">
                  Scan History
                  <span className="ml-1.5 text-foreground/80 normal-case tracking-normal font-medium">(click ▾)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry, idx) => (
                <UnitRow
                  key={entry.unitDbId}
                  unit={entry.unitLabel}
                  data={activityByUnitId.get(entry.unitDbId) ?? { activeSats: [], history: [] }}
                  idx={idx + 1}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {unitRows.length > 4 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-border bg-secondary/10 hover:bg-secondary/25 transition-colors"
        >
          <span className="mono text-[10px] uppercase tracking-wider text-foreground font-semibold">
            {expanded ? "Show less" : `Show all ${unitRows.length} units`}
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-foreground" />}
        </button>
      )}
    </div>
  );
}
