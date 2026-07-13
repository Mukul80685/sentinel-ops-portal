import { useMemo, useState } from "react";

import { Activity, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";

import { toast } from "sonner";

import { useDashboardData } from "@/hooks/useDashboardData";

import { DASHBOARD_PANEL_LABELS, DASHBOARD_PANEL_PURPOSE } from "@/lib/dashboardLabels";

import type { UnitActivityHistoryRow, UnitActivitySatRow } from "@/lib/operationalState";
import type { DuplicateMonitoringRow } from "@/lib/dashboardDataService";

import {
  clearUnitScanHistory,
  getUnitScanHistory,
  setUnitScanHistory,
  type StoredScanHistoryEntry,
} from "@/lib/scanHistoryStore";

import { notifyOperationalDerivedRefresh } from "@/lib/operationalRefresh";
import { clearUnitActivityMonitoring } from "@/lib/unitActivityActions";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import {

  outcomeColor,

  scorebar,

  scoreColor,

} from "@/components/satellite-monitoring/dashboardUtils";



type UnitScanData = {

  activeSats: UnitActivitySatRow[];

  history: UnitActivityHistoryRow[];

};



function ProductivityCell({ sat }: { sat: UnitActivitySatRow }) {

  const pct = sat.analyzed > 0 ? Math.round((sat.productive / sat.analyzed) * 100) : 0;



  return (

    <>

      <div className="flex items-center gap-1.5">

        <span className="mono text-[10px] font-bold text-emerald-600">P:{sat.productive}</span>

        <span className="mono text-[10px] font-semibold text-foreground">N:{sat.nonProductive}</span>

        <span className={`mono text-[10px] font-bold ${scoreColor(pct)}`}>{pct}%</span>

      </div>

      <div className="mt-1 w-full h-1 rounded-full bg-secondary overflow-hidden">

        <div className={`h-full rounded-full ${scorebar(pct)}`} style={{ width: `${pct}%` }} />

      </div>

    </>

  );

}



function ScanHistoryCell({

  unitDbId,

  unitLabel,

  history,

}: {

  unitDbId: string;

  unitLabel: string;

  history: UnitActivityHistoryRow[];

}) {

  const [historyDrop, setHistoryDrop] = useState(false);

  const [editing, setEditing] = useState(false);

  const [draftRows, setDraftRows] = useState<StoredScanHistoryEntry[]>([]);



  function startEdit() {

    const existing = getUnitScanHistory(unitDbId);

    const seeded =

      existing.length > 0

        ? existing

        : history.map((h) => ({

            satellite: h.satellite,

            time: h.time,

            outcome: h.outcome,

          }));

    const padded = [...seeded];

    while (padded.length < 5) {

      padded.push({ satellite: "", time: "—", outcome: "mixed" });

    }

    setDraftRows(padded.slice(0, 5));

    setEditing(true);

    setHistoryDrop(true);

  }



  function cancelEdit() {

    setEditing(false);

    setDraftRows([]);

  }



  function saveEdit() {

    const entries = draftRows

      .filter((r) => r.satellite.trim())

      .map((r) => ({

        satellite: r.satellite.trim(),

        time:

          r.time === "—"

            ? new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })

            : r.time,

        outcome: r.outcome,

      }));

    if (entries.length === 0) {
      clearUnitScanHistory(unitDbId);
      notifyOperationalDerivedRefresh();
      toast.success(`Scan history cleared for ${unitLabel}.`);
      setEditing(false);
      setDraftRows([]);
      return;
    }

    setUnitScanHistory(unitDbId, entries);

    notifyOperationalDerivedRefresh();

    toast.success(`Scan history saved for ${unitLabel}.`);

    setEditing(false);

    setDraftRows([]);

  }



  return (

    <td className="px-3 py-3 w-44 align-top">

      <div className="flex items-start gap-1">

        {!editing ? (

          <button

            type="button"

            onClick={() => setHistoryDrop((p) => !p)}

            className="flex items-center gap-1.5 flex-1 text-left group/hist min-w-0"

          >

            <span className="mono text-[11px] font-medium text-foreground truncate max-w-[100px] group-hover/hist:text-primary transition-colors">

              {history[0]?.satellite ?? "—"}

            </span>

            {historyDrop ? (

              <ChevronUp className="h-3 w-3 shrink-0 text-foreground" />

            ) : (

              <ChevronDown className="h-3 w-3 shrink-0 text-foreground" />

            )}

          </button>

        ) : (

          <span className="mono text-[10px] font-semibold uppercase tracking-wider text-primary flex-1">

            Editing…

          </span>

        )}

        {!editing ? (

          <Button

            type="button"

            variant="ghost"

            size="sm"

            className="h-6 px-1.5 mono text-[9px] uppercase tracking-wider gap-0.5 shrink-0"

            onClick={startEdit}

          >

            <Pencil className="h-3 w-3" /> Edit

          </Button>

        ) : (

          <Button

            type="button"

            variant="default"

            size="sm"

            className="h-6 px-2 mono text-[9px] uppercase tracking-wider shrink-0"

            onClick={saveEdit}

          >

            OK

          </Button>

        )}

      </div>



      {editing && (

        <div className="mt-1.5 border-t border-border pt-1.5 space-y-1.5">

          {draftRows.map((row, i) => (

            <Input

              key={i}

              value={row.satellite}

              onChange={(e) =>

                setDraftRows((prev) =>

                  prev.map((r, j) => (j === i ? { ...r, satellite: e.target.value } : r)),

                )

              }

              placeholder={`Scan ${i + 1}`}

              className="h-7 mono text-[10px]"

            />

          ))}

          <button

            type="button"

            onClick={cancelEdit}

            className="mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground"

          >

            Cancel

          </button>

        </div>

      )}



      {!editing && historyDrop && (

        <div className="mt-1.5 border-t border-border pt-1.5">

          <div className="mono text-[9px] uppercase tracking-[0.18em] text-foreground mb-1.5 font-semibold">

            Previously Scanned

          </div>

          {history.length === 0 ? (

            <p className="mono text-[10px] text-muted-foreground">No history — use Edit to add</p>

          ) : (

            history.map((h, i) => (

              <div key={i} className="flex items-center justify-between py-0.5 gap-1.5">

                <span className="mono text-[10px] font-medium text-foreground truncate flex-1">

                  {h.satellite}

                </span>

                <div className="flex items-center gap-1 shrink-0">

                  <span className="mono text-[10px] font-medium text-foreground">{h.time}</span>

                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${outcomeColor(h.outcome)}`} />

                </div>

              </div>

            ))

          )}

        </div>

      )}

    </td>

  );

}



function UnitRow({

  unitDbId,

  unitCode,

  unit,

  data,

  idx,

}: {

  unitDbId: string;

  unitCode: string;

  unit: string;

  data: UnitScanData;

  idx: number;

}) {

  const [selSat, setSelSat] = useState(0);

  const [activeDrop, setActiveDrop] = useState(false);



  function handleDeleteActivity() {

    const satNames = data.activeSats.map((s) => s.satellite);

    const message =

      satNames.length > 0

        ? `Remove activity for ${unit}? Active satellites will be suppressed and scan history cleared. Optimization scores will update.`

        : `Clear scan history for ${unit}? Optimization scores will update.`;

    if (!confirm(message)) return;

    clearUnitActivityMonitoring(unitDbId, unitCode, satNames);

    toast.success(`Activity cleared for ${unit}.`);

  }



  if (data.activeSats.length === 0) {

    return (

      <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors align-top group">

        <td className="px-3 py-3 mono text-[11px] font-semibold text-foreground w-8">{idx}</td>

        <td className="px-3 py-3 w-24">

          <span className="mono text-[13px] font-bold text-foreground whitespace-nowrap">{unit}</span>

        </td>

        <td className="px-3 py-3 w-52">

          <span className="mono text-[11px] font-medium text-foreground uppercase tracking-wide">

            No active scans

          </span>

        </td>

        <td className="px-3 py-3 w-20">

          <span className="mono text-[14px] font-bold text-foreground">—</span>

        </td>

        <td className="px-3 py-3 w-20">

          <span className="mono text-[14px] font-bold text-foreground">—</span>

        </td>

        <td className="px-3 py-3 w-20">

          <span className="mono text-[14px] font-bold text-foreground">—</span>

        </td>

        <td className="px-3 py-3 w-32">

          <span className="mono text-[11px] font-medium text-foreground">—</span>

        </td>

        <ScanHistoryCell unitDbId={unitDbId} unitLabel={unit} history={data.history} />

        <td className="px-2 py-3 align-top">

          <Button

            type="button"

            variant="ghost"

            size="sm"

            className="h-7 px-2 text-destructive hover:text-destructive"

            onClick={handleDeleteActivity}

            title="Clear unit activity"

          >

            <Trash2 className="h-3 w-3" />

          </Button>

        </td>

      </tr>

    );

  }



  const sat = data.activeSats[selSat];

  const pending = sat.scanned - sat.analyzed;



  return (

    <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors align-top group">

      <td className="px-3 py-3 mono text-[11px] font-semibold text-foreground w-8">{idx}</td>

      <td className="px-3 py-3 w-24">

        <span className="mono text-[13px] font-bold text-foreground whitespace-nowrap">{unit}</span>

      </td>

      <td className="px-3 py-3 w-52 align-top">

        <button

          type="button"

          onClick={() => setActiveDrop((p) => !p)}

          className="flex items-center gap-1.5 w-full text-left group/btn"

        >

          <span className="mono text-[12px] font-semibold text-foreground truncate max-w-[130px] group-hover/btn:text-primary transition-colors">

            {sat.satellite}

          </span>

          <span className="mono text-[9px] text-primary bg-primary/8 border border-primary/15 px-1 py-0.5 rounded-sm leading-none shrink-0 font-bold">

            {data.activeSats.length}

          </span>

          {activeDrop ? (

            <ChevronUp className="h-3 w-3 shrink-0 text-foreground" />

          ) : (

            <ChevronDown className="h-3 w-3 shrink-0 text-foreground" />

          )}

        </button>

        {activeDrop && (

          <div className="mt-1.5 border-t border-border pt-1.5">

            <div className="mono text-[9px] uppercase tracking-[0.18em] text-foreground mb-1.5 font-semibold">

              Satellites Being Scanned: {data.activeSats.length}

            </div>

            {data.activeSats.map((s, i) => (

              <button

                key={s.satellite}

                type="button"

                onClick={() => {

                  setSelSat(i);

                  setActiveDrop(false);

                }}

                className={`flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded-sm hover:bg-secondary/50 transition-colors ${i === selSat ? "bg-primary/6" : ""}`}

              >

                <span

                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${i === selSat ? "bg-primary" : "bg-border"}`}

                />

                <span

                  className={`mono text-[11px] truncate ${i === selSat ? "text-primary font-semibold" : "text-foreground font-medium"}`}

                >

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

        <span

          className={`mono text-[14px] font-bold leading-none ${pending > 0 ? "text-amber-600" : "text-foreground"}`}

        >

          {pending}

        </span>

      </td>

      <td className="px-3 py-3 w-32">

        <ProductivityCell sat={sat} />

      </td>

      <ScanHistoryCell unitDbId={unitDbId} unitLabel={unit} history={data.history} />

      <td className="px-2 py-3 align-top">

        <Button

          type="button"

          variant="ghost"

          size="sm"

          className="h-7 px-2 text-destructive hover:text-destructive"

          onClick={handleDeleteActivity}

          title="Clear unit activity"

        >

          <Trash2 className="h-3 w-3" />

        </Button>

      </td>

    </tr>

  );

}



function StackedCell({ lines }: { lines: string[] }) {
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "—")) {
    return <span className="mono text-[11px] text-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, i) => (
        <span key={`${line}-${i}`} className="mono text-[11px] text-foreground leading-snug">
          {line || "—"}
        </span>
      ))}
    </div>
  );
}



function DuplicateMonitoringTable({ rows }: { rows: DuplicateMonitoringRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center mono text-[11px] text-foreground uppercase tracking-wider font-medium">
        No duplicate monitoring efforts detected across units
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border bg-secondary/25">
          <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground w-8">
            #
          </th>
          <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">
            Satellite
          </th>
          <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">
            Units
          </th>
          <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">
            Band &amp; Polarisation
          </th>
          <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">
            Beam
          </th>
          <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">
            Scan Date
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={row.satellite} className="border-b border-border/50 hover:bg-secondary/20 transition-colors align-top">
            <td className="px-3 py-3 mono text-[11px] font-semibold text-foreground w-8">{idx + 1}</td>
            <td className="px-3 py-3 mono text-[12px] font-semibold text-foreground whitespace-nowrap">
              {row.satellite}
            </td>
            <td className="px-3 py-3">
              <StackedCell lines={row.units.map((u) => u.unitLabel)} />
            </td>
            <td className="px-3 py-3">
              <StackedCell lines={row.units.map((u) => u.bandPolarisation)} />
            </td>
            <td className="px-3 py-3 max-w-xs">
              <StackedCell lines={row.units.map((u) => u.beams)} />
            </td>
            <td className="px-3 py-3 whitespace-nowrap">
              <StackedCell lines={row.units.map((u) => u.scanDate)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}



/** Live unit activity — derived from INT Repository. */

export function UnitActivitySnapshot() {

  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"active" | "duplicates">("active");

  const { activity, duplicateMonitoring, isLoading } = useDashboardData();



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
          {view === "active"
            ? `${unitRows.length} Units`
            : `${duplicateMonitoring.rows.length} Duplicate${duplicateMonitoring.rows.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-secondary/10">
        <button
          type="button"
          onClick={() => setView("active")}
          className={`mono text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-sm border transition-colors ${
            view === "active"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-foreground/70 hover:bg-secondary/40"
          }`}
        >
          Unit Activity
        </button>
        <button
          type="button"
          onClick={() => setView("duplicates")}
          className={`mono text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-sm border transition-colors ${
            view === "duplicates"
              ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border text-foreground/70 hover:bg-secondary/40"
          }`}
        >
          Duplicate Efforts
        </button>
      </div>



      <div className="overflow-x-auto">

        {isLoading ? (

          <div className="px-4 py-8 text-center mono text-[11px] text-foreground uppercase tracking-wider font-medium">

            Loading operational state…

          </div>

        ) : view === "duplicates" ? (

          <DuplicateMonitoringTable rows={duplicateMonitoring.rows} />

        ) : unitRows.length === 0 ? (

          <div className="px-4 py-8 text-center mono text-[11px] text-foreground uppercase tracking-wider font-medium">

            No units registered

          </div>

        ) : (

          <table className="w-full">

            <thead>

              <tr className="border-b border-border bg-secondary/25">

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground w-8">

                  #

                </th>

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">

                  Unit

                </th>

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">

                  Active Satellites

                  <span className="ml-1.5 text-foreground/80 normal-case tracking-normal font-medium">

                    (click ▾)

                  </span>

                </th>

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">

                  Scanned

                </th>

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">

                  Analyzed

                </th>

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">

                  Pending

                </th>

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">

                  Productivity

                </th>

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">

                  Scan History

                  <span className="ml-1.5 text-foreground/80 normal-case tracking-normal font-medium">

                    (click ▾)

                  </span>

                </th>

                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground w-16">

                  Actions

                </th>

              </tr>

            </thead>

            <tbody>

              {visible.map((entry, idx) => (

                <UnitRow

                  key={entry.unitDbId}

                  unitDbId={entry.unitDbId}

                  unitCode={entry.unitCode}

                  unit={entry.unitLabel}

                  data={activityByUnitId.get(entry.unitDbId) ?? { activeSats: [], history: [] }}

                  idx={idx + 1}

                />

              ))}

            </tbody>

          </table>

        )}

      </div>



      {view === "active" && unitRows.length > 4 && (

        <button

          type="button"

          onClick={() => setExpanded((e) => !e)}

          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-border bg-secondary/10 hover:bg-secondary/25 transition-colors"

        >

          <span className="mono text-[10px] uppercase tracking-wider text-foreground font-semibold">

            {expanded ? "Show less" : `Show all ${unitRows.length} units`}

          </span>

          {expanded ? (

            <ChevronUp className="h-3.5 w-3.5 text-foreground" />

          ) : (

            <ChevronDown className="h-3.5 w-3.5 text-foreground" />

          )}

        </button>

      )}

    </div>

  );

}


