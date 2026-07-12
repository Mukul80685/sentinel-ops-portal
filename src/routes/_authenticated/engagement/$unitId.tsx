import { Component, type ReactNode, useMemo, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { getUnitById, listEquipmentForUnit, listEngagementsForUnit, listIntelRecordsForUnit, listSatellites } from "@/lib/queries";
import {
  insertOperationalEngagement,
  removeOperationalEngagement,
  updateOperationalEngagement,
} from "@/lib/operationalStore";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  computeSatelliteAnalysis,
  ENGAGEMENTS_ALL_KEY,
  fetchAllEngagements,
  ACTIVE_SCAN_STATUSES,
} from "@/lib/engagementEngine";
import {
  computeUnitCapability,
} from "@/lib/liveEngagementModel";
import {
  intelRowToAnalysis,
  listIntelMonitoringSatellites,
  computeGatedResourceEngagementPct,
} from "@/lib/intelLiveBridge";
import { INT_UNITS } from "@/lib/intelRepository";
import { unitDisplayLabel, unitDisplayLocation } from "@/lib/operationalDataset";
import { DASHBOARD_PANEL_LABELS, dashboardPanelBackLink } from "@/lib/dashboardLabels";
import { loadRingPalette, useEngagementRingVisuals } from "@/lib/engagementRingVisuals";
import {
  buildInventoryAllocatedIds,
  buildResourceRingStats,
  resolveLnaLnbFromRow,
  appendEquipmentMetaToRemarks,
  parseEquipmentIdFromRemarks,
} from "@/lib/resourceEngagementStats";
import {
  getPlannedSatellites,
  newPlannedSatelliteRow,
  setPlannedSatellites,
  type PlannedSatelliteRow,
} from "@/lib/plannedSatelliteStore";
import { notifyOperationalDerivedRefresh } from "@/lib/operationalRefresh";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["Planned", "In Progress", "Completed", "Paused", "Failed"] as const;
const DEMOD_TYPES = ["Narrowband", "Wideband", "DVB-S2", "DVB-S2X"] as const;

function attachEquipmentToEngagements(rows: any[], equipment: any[]) {
  const byId = new Map(equipment.map((e) => [e.id, e]));
  return rows.map((r) => ({
    ...r,
    antenna: r.antenna_id
      ? { id: r.antenna_id, name: byId.get(r.antenna_id)?.name ?? null }
      : null,
    demodulator: r.demodulator_id
      ? { id: r.demodulator_id, name: byId.get(r.demodulator_id)?.name ?? null }
      : null,
    server: r.processing_server_id
      ? { id: r.processing_server_id, name: byId.get(r.processing_server_id)?.name ?? null }
      : null,
  }));
}

export const Route = createFileRoute("/_authenticated/engagement/$unitId")({
  component: EngagementUnitPage,
});

function unitDisplayCode(code: string): string {
  return code.replace(/^GATE[-\s]?/i, "").trim() || code;
}
function parseDemodType(remarks: string | null): string {
  const m = remarks?.match(/DEMOD_TYPE:([\w-]+)/);
  return m ? m[1] : "—";
}

// ─── Resource rings ───────────────────────────────────────────────────────────

function SmallRing({
  pct, label, engaged, faulty, total,
}: {
  pct: number; label: string; engaged: number;
  faulty: number; total: number;
}) {
  const sz = 48, sw = 4.5, r = (sz - sw) / 2, c = 2 * Math.PI * r;
  const palette = total === 0 ? loadRingPalette(0) : loadRingPalette(pct);
  const { trackStroke, arcStroke, defs } = useEngagementRingVisuals(palette);
  const textColor = total === 0 ? "#374151" : palette.base;
  return (
    <div className="flex flex-col items-center gap-1 px-1 py-0.5">
      <div className="le-progress-ring relative" style={{ width: sz, height: sz }}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="-rotate-90">
          {defs}
          <circle cx={sz / 2} cy={sz / 2} r={r} stroke={trackStroke} strokeWidth={sw} fill="none" />
          {total > 0 && (
            <circle cx={sz / 2} cy={sz / 2} r={r} stroke={arcStroke} strokeWidth={sw} fill="none"
              strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="mono font-bold leading-none text-[11px]" style={{ color: textColor }}>
            {total === 0 ? "—" : `${pct}%`}
          </span>
        </div>
      </div>
      <div className="text-center space-y-0.5">
        <div className="mono text-[12px] font-bold uppercase tracking-wide text-foreground leading-tight">
          {label}
        </div>
        {total === 0
          ? <div className="mono text-[11px] text-foreground leading-none">No inventory</div>
          : <div className="mono text-[11px] font-semibold text-foreground leading-none">{engaged}/{total} Engaged</div>
        }
        {faulty > 0 && (
          <div className="mono text-[9px] text-destructive leading-none">{faulty} unserviceable</div>
        )}
      </div>
    </div>
  );
}

function LargeEngagementRing({ pct }: { pct: number }) {
  const sz = 108, sw = 8, r = (sz - sw) / 2, c = 2 * Math.PI * r;
  const palette = loadRingPalette(pct);
  const { trackStroke, arcStroke, defs } = useEngagementRingVisuals(palette);
  return (
    <div className="flex flex-col items-center justify-center shrink-0">
      <div className="le-progress-ring relative" style={{ width: sz, height: sz }}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="-rotate-90">
          {defs}
          <circle cx={sz / 2} cy={sz / 2} r={r} stroke={trackStroke} strokeWidth={sw} fill="none" />
          <circle cx={sz / 2} cy={sz / 2} r={r} stroke={arcStroke} strokeWidth={sw} fill="none"
            strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="mono text-[22px] font-bold leading-none" style={{ color: palette.base }}>{pct}%</span>
        </div>
      </div>
      <div className="mono text-[10px] font-bold uppercase tracking-[0.15em] text-foreground mt-1.5">
        Engaged
      </div>
    </div>
  );
}

function ResourceHoneycomb({
  resourceStats,
}: {
  resourceStats: { label: string; total: number; faulty: number; engaged: number; pct: number }[];
}) {
  return (
    <div className="flex-1 min-w-0 grid grid-cols-3 gap-x-1 gap-y-3 items-start justify-items-center">
      {resourceStats.map((stat) => (
        <SmallRing key={stat.label} {...stat} />
      ))}
    </div>
  );
}

function EngagementVisualization({
  utilPct,
  resourceStats,
  unitLabel,
  location,
  canEdit,
  newEngagement,
}: {
  utilPct: number;
  resourceStats: { label: string; total: number; faulty: number; engaged: number; pct: number }[];
  unitLabel: string;
  location?: string;
  canEdit: boolean;
  newEngagement?: ReactNode;
}) {
  return (
    <div className="panel overflow-hidden mb-2">
      <div className="px-4 pt-3 pb-2.5 text-center border-b border-border/40 bg-secondary/10">
        <div className="mono text-[14px] font-bold uppercase tracking-tight text-foreground leading-tight">
          {unitLabel}
        </div>
        {location && (
          <div className="mono text-[10px] text-foreground mt-0.5">{location}</div>
        )}
        {canEdit && newEngagement && (
          <div className="mt-2.5 flex justify-center">{newEngagement}</div>
        )}
      </div>

      <div className="px-3 py-2.5 flex items-center gap-3">
        <div className="shrink-0 pr-3 border-r border-border/50">
          <LargeEngagementRing pct={utilPct} />
        </div>
        <ResourceHoneycomb resourceStats={resourceStats} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

class EngagementErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[EngagementUnit]", error);
  }

  render() {
    if (this.state.error) {
      return (
        <AppShell
          title={DASHBOARD_PANEL_LABELS.engagement}
          subtitle="Unit detail"
          showBack
          backLink={dashboardPanelBackLink("engagement")}
          horizontalNav={null}
        >
          <div className="panel p-6 text-center space-y-3">
            <p className="mono text-sm font-bold text-foreground">Unable to load unit engagement view</p>
            <p className="mono text-[10px] text-foreground/70">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-border rounded-sm hover:bg-secondary/50"
            >
              Retry
            </button>
          </div>
        </AppShell>
      );
    }
    return this.props.children;
  }
}

function EngagementUnitPage() {
  return (
    <EngagementErrorBoundary>
      <EngagementUnit />
    </EngagementErrorBoundary>
  );
}

function EngagementUnit() {
  const { unitId } = Route.useParams();
  const canEdit    = useCanEdit();
  const qc         = useQueryClient();

  const { data: unit } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: () => getUnitById(unitId),
  });

  const { data: engResult } = useQuery({
    queryKey: ["eng", unitId],
    queryFn: async () => {
      const rows = await listEngagementsForUnit(unitId);
      return { rows, failed: false };
    },
    retry: false,
  });

  const rows = engResult?.rows ?? [];
  const engError = engResult?.failed ?? false;

  const { data: equipmentRaw = [] } = useQuery({
    queryKey: ["unit-equipment-detail", unitId],
    queryFn: () => listEquipmentForUnit(unitId),
  });

  const { data: allEngagements = [] } = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    staleTime: 30 * 1000,
  });

  const enrichedRows = useMemo(
    () => attachEquipmentToEngagements(rows, equipmentRaw),
    [rows, equipmentRaw],
  );

  const { data: intelRows = [] } = useQuery({
    queryKey: ["intel-eng", unitId],
    queryFn: () => listIntelRecordsForUnit(unitId),
    staleTime: 30 * 1000,
  });

  const capability = useMemo(
    () =>
      computeUnitCapability(
        unitId,
        unit?.code,
        allEngagements.length > 0 ? allEngagements : rows,
        equipmentRaw,
        intelRows,
      ),
    [unitId, unit?.code, allEngagements, rows, equipmentRaw, intelRows],
  );

  /** Active monitoring rows — full INT Repository satellite list with scan data. */
  const intelMonitoringRows = useMemo(
    () =>
      listIntelMonitoringSatellites(
        unitId,
        unit?.code,
        allEngagements.length > 0 ? allEngagements : rows,
        equipmentRaw,
        intelRows,
      ),
    [unitId, unit?.code, allEngagements, rows, equipmentRaw, intelRows],
  );

  const intelActiveRows = useMemo(() => {
    const engBySatName = new Map<string, any>();
    for (const r of enrichedRows) {
      const name = r.satellites?.name as string | undefined;
      if (name) engBySatName.set(name, r);
    }

    return intelMonitoringRows.map((satRow) => {
      const existing = engBySatName.get(satRow.satelliteName);
      if (existing) {
        return {
          ...existing,
          satellites: { name: satRow.satelliteName },
          _intelRow: satRow,
        };
      }

      const assignment = capability.assignments.find((a) => a.name === satRow.satelliteName);
      if (assignment?.engagement) {
        return {
          ...assignment.engagement,
          id: assignment.engagementId,
          satellites: { name: satRow.satelliteName },
          _intelRow: satRow,
        };
      }

      return {
        id: `intel-${unitId}-${satRow.satelliteName.replace(/\s+/g, "-")}`,
        satellites: { name: satRow.satelliteName },
        remarks: null,
        antenna_id: null,
        demodulator_id: null,
        processing_server_id: null,
        status: satRow.engagementStatus ?? "In Progress",
        _intelRow: satRow,
      };
    });
  }, [intelMonitoringRows, enrichedRows, capability.assignments, unitId]);

  const rawInProgressRows = useMemo(
    () => enrichedRows.filter((r: any) => ACTIVE_SCAN_STATUSES.has(r.status)),
    [enrichedRows],
  );

  const hasIntMonitoring = intelMonitoringRows.length > 0;

  const allocatedIds = useMemo(
    () =>
      hasIntMonitoring
        ? buildInventoryAllocatedIds(rawInProgressRows)
        : new Set<string>(),
    [hasIntMonitoring, rawInProgressRows],
  );

  const resourceStats = useMemo(
    () => buildResourceRingStats(equipmentRaw, allocatedIds),
    [equipmentRaw, allocatedIds],
  );

  const utilPct = useMemo(
    () =>
      computeGatedResourceEngagementPct(
        unitId,
        unit?.code,
        equipmentRaw,
        allEngagements.length > 0 ? allEngagements : rows,
        intelRows,
      ),
    [unitId, unit?.code, equipmentRaw, allEngagements, rows, intelRows],
  );

  const analysisByEngId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSatelliteAnalysis>>();
    for (const a of capability.assignments) {
      map.set(a.engagementId, a.analysis);
    }
    return map;
  }, [capability.assignments]);

  async function update(id: string, patch: any) {
    if (!updateOperationalEngagement(id, patch)) {
      return toast.error("Engagement not found.");
    }
    qc.invalidateQueries({ queryKey: ["eng", unitId] });
    qc.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
  }
  async function remove(id: string) {
    if (!confirm("Remove engagement?")) return;
    if (!removeOperationalEngagement(id)) {
      return toast.error("Engagement not found.");
    }
    qc.invalidateQueries({ queryKey: ["eng", unitId] });
    qc.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
  }

  const unitLabel = unit ? unitDisplayLabel(unit) : "Unit";
  const unitLocation = unit
    ? unitDisplayLocation(unit, INT_UNITS.find((u) => u.code === unitDisplayCode(unit.code))?.location)
    : undefined;

  const RESOURCE_HEADERS = [
    "#",
    "Satellite",
    "Polarization",
    "Antenna",
    "LNA",
    "LNB",
    "Demodulator",
    "Processor",
    "",
  ];

  return (
    <AppShell
      title={DASHBOARD_PANEL_LABELS.engagement}
      showBack
      backLink={dashboardPanelBackLink("engagement")}
      horizontalNav={null}
    >

      <EngagementVisualization
        utilPct={utilPct}
        resourceStats={resourceStats}
        unitLabel={unitLabel}
        location={unitLocation}
        canEdit={canEdit}
        newEngagement={
          <AddEngagement unitId={unitId} activeRows={rawInProgressRows} equipment={equipmentRaw} primary />
        }
      />

      {/* Engaged resources — active monitoring sessions (no scan statistics) */}
      <div className="panel overflow-hidden mb-3">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/20">
          <span className="mono text-[10.5px] font-bold uppercase tracking-wider text-foreground">
            Engaged Resources — Active Monitoring
          </span>
          <span className="mono text-[7.5px] uppercase tracking-[0.15em] text-foreground/70">
            {intelActiveRows.length} sessions · synced with Intelligence Repository
          </span>
        </div>

        {intelActiveRows.length === 0 ? (
          <div className="px-4 py-5 text-center mono text-[9px] text-foreground/70 uppercase tracking-wider">
            No satellites actively monitored in Intelligence Repository
          </div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 320 }}>
            <table className="w-full mono text-[11px]">
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr>
                  {RESOURCE_HEADERS.map((h) => (
                    <th
                      key={h || "actions"}
                      className="text-left px-3 py-2 text-[8px] uppercase tracking-wider text-foreground
                                 font-bold whitespace-nowrap border-r border-border/50 last:border-r-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {intelActiveRows.map((r: any, idx: number) => {
                  const analysis = r._intelRow
                    ? intelRowToAnalysis(r._intelRow)
                    : analysisByEngId.get(r.id) ?? computeSatelliteAnalysis(r, intelRows);
                  const { lna, lnb } = resolveLnaLnbFromRow(r, equipmentRaw);

                  return (
                    <tr key={r.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2.5 text-foreground/70">{idx + 1}</td>

                      <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                        {r.satellites?.name ?? "—"}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {analysis.polarization !== "—" ? (
                          <span className="mono text-[9px] font-semibold text-primary bg-primary/5 border border-primary/15 px-1.5 py-0.5 rounded-sm">
                            {analysis.polarization}
                          </span>
                        ) : (
                          <span className="text-foreground/60">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.antenna?.name ? (
                          <span className="text-foreground">{r.antenna.name}</span>
                        ) : (
                          <span className="text-destructive italic text-[9px]">missing</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap text-foreground">
                        {lna}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap text-foreground">
                        {lnb}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.demodulator?.name ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-foreground">{r.demodulator.name}</span>
                            {parseDemodType(r.remarks) !== "—" && (
                              <span className="text-[8px] text-foreground/70 uppercase">
                                {parseDemodType(r.remarks)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-destructive italic text-[9px]">missing</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-foreground whitespace-nowrap">
                        {r.server?.name ? (
                          r.server.name
                        ) : (
                          <span className="text-destructive italic text-[9px]">missing</span>
                        )}
                      </td>

                      <td className="px-2 py-2.5">
                        {canEdit && (
                          <EditEngagement
                            row={r}
                            activeRows={rawInProgressRows}
                            equipment={equipmentRaw}
                            onUpdate={update}
                            onRemove={remove}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PlannedSatellitesTable unitId={unitId} canEdit={canEdit} />

      {engError && (
        <div className="panel mb-3 px-3 py-2 mono text-[10px] text-amber-800 border border-amber-400/30 bg-amber-400/10">
          Engagement records could not be loaded — showing available unit data only.
        </div>
      )}

      {enrichedRows.length === 0 && !engError && <Empty title="No engagements recorded" />}
    </AppShell>
  );
}

function PlannedSatellitesTable({ unitId, canEdit }: { unitId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<PlannedSatelliteRow[]>(() => getPlannedSatellites(unitId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlannedSatelliteRow | null>(null);

  useEffect(() => {
    setRows(getPlannedSatellites(unitId));
  }, [unitId]);

  function persist(next: PlannedSatelliteRow[]) {
    setRows(next);
    setPlannedSatellites(unitId, next);
    notifyOperationalDerivedRefresh();
  }

  function startEdit(row: PlannedSatelliteRow) {
    setEditingId(row.id);
    setDraft({ ...row });
  }

  function saveEdit() {
    if (!draft) return;
    persist(rows.map((r) => (r.id === draft.id ? draft : r)));
    setEditingId(null);
    setDraft(null);
    toast.success("Planned satellite row saved.");
  }

  function addRow() {
    const row = newPlannedSatelliteRow();
    persist([...rows, row]);
    startEdit(row);
  }

  function removeRow(id: string) {
    persist(rows.filter((r) => r.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setDraft(null);
    }
  }

  return (
    <div className="panel overflow-hidden mb-3">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/20">
        <span className="mono text-[10.5px] font-bold uppercase tracking-wider text-foreground">
          Planned Satellite — Next Three Months
        </span>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mono text-[9px] uppercase tracking-wider h-7"
            onClick={addRow}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Row
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-5 text-center mono text-[9px] text-foreground/70 uppercase tracking-wider">
          No planned satellites — use Add Row to enter upcoming missions
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full mono text-[11px]">
            <thead className="bg-card border-b border-border">
              <tr>
                {["Serial Number", "Satellite", "Date of Launch", "Last Scanned Date", ""].map((h) => (
                  <th
                    key={h || "actions"}
                    className="text-left px-3 py-2 text-[8.5px] uppercase tracking-wider text-foreground
                               font-bold whitespace-nowrap border-r border-border/50 last:border-r-0"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const isEditing = editingId === row.id && draft != null;
                const data = isEditing ? draft : row;

                return (
                  <tr key={row.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Input
                          value={data.serialNumber}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, serialNumber: e.target.value } : d))
                          }
                          className="h-8 mono text-[11px]"
                        />
                      ) : (
                        <span className="text-foreground">{row.serialNumber || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Input
                          value={data.satellite}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, satellite: e.target.value } : d))
                          }
                          className="h-8 mono text-[11px]"
                        />
                      ) : (
                        <span className="font-bold text-foreground">{row.satellite || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Input
                          type="date"
                          value={data.launchDate}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, launchDate: e.target.value } : d))
                          }
                          className="h-8 mono text-[11px]"
                        />
                      ) : (
                        <span className="text-foreground">{row.launchDate || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Input
                          type="date"
                          value={data.lastScannedDate}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, lastScannedDate: e.target.value } : d))
                          }
                          className="h-8 mono text-[11px]"
                        />
                      ) : (
                        <span className="text-foreground">{row.lastScannedDate || "—"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          {isEditing ? (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="h-7 px-2 mono text-[9px] uppercase tracking-wider"
                              onClick={saveEdit}
                            >
                              OK
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 mono text-[9px] uppercase tracking-wider gap-1"
                              onClick={() => startEdit(row)}
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => removeRow(row.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface EditEngagementProps {
  row: any;
  activeRows: any[];
  equipment: any[];
  onUpdate: (id: string, patch: any) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

function EditEngagement({
  row,
  activeRows,
  equipment,
  onUpdate,
  onRemove,
}: EditEngagementProps) {
  const [open, setOpen] = useState(false);
  const { data: sats = [] } = useQuery({
    queryKey: ["sats"],
    queryFn: async () => {
      try {
        return await listSatellites();
      } catch {
        return [];
      }
    },
    retry: false,
  });

  const otherActive = activeRows.filter((r: any) => r.id !== row.id);
  const allocatedAntennaIds = useMemo(
    () => new Set(otherActive.map((r: any) => r.antenna_id).filter(Boolean)),
    [otherActive],
  );
  const allocatedDemodIds = useMemo(
    () => new Set(otherActive.map((r: any) => r.demodulator_id).filter(Boolean)),
    [otherActive],
  );
  const allocatedServerIds = useMemo(
    () => new Set(otherActive.map((r: any) => r.processing_server_id).filter(Boolean)),
    [otherActive],
  );

  const serviceable = (matchStr: string) =>
    equipment.filter((e: any) =>
      (e.category?.name ?? "").toLowerCase().includes(matchStr) && e.serviceability === "Operational",
    );

  const availableAntennas = serviceable("antenna").filter(
    (e: any) => !allocatedAntennaIds.has(e.id) || e.id === row.antenna_id,
  );
  const availableDemod = serviceable("demodulat").filter(
    (e: any) => !allocatedDemodIds.has(e.id) || e.id === row.demodulator_id,
  );
  const availableServers = serviceable("processing").filter(
    (e: any) => !allocatedServerIds.has(e.id) || e.id === row.processing_server_id,
  );
  const availableLNA = equipment.filter(
    (e: any) =>
      (e.category?.name ?? "").toLowerCase() === "lna" &&
      e.serviceability === "Operational",
  );
  const availableLNB = equipment.filter(
    (e: any) =>
      (e.category?.name ?? "").toLowerCase().includes("lnb") &&
      e.serviceability === "Operational",
  );

  const initialLnaType = (() => {
    const m = row.remarks?.match(/LNA\/LNB:(LNA|LNB)/);
    return (m?.[1] ?? "LNA") as "LNA" | "LNB";
  })();
  const initialDemodType = (() => {
    const m = row.remarks?.match(/DEMOD_TYPE:([\w-]+)/);
    return m?.[1] ?? "DVB-S2";
  })();

  const [form, setForm] = useState({
    satellite_id: row.satellite_id ?? "",
    antenna_id: row.antenna_id ?? "",
    lna_type: initialLnaType,
    lna_id: parseEquipmentIdFromRemarks(row.remarks, "LNA_ID") ?? "",
    lnb_id: parseEquipmentIdFromRemarks(row.remarks, "LNB_ID") ?? "",
    demodulator_type: initialDemodType,
    demodulator_id: row.demodulator_id ?? "",
    processing_server_id: row.processing_server_id ?? "",
    observation_start: row.observation_start
      ? new Date(row.observation_start).toISOString().slice(0, 16)
      : "",
    status: row.status ?? "Planned",
    remarks: (row.remarks ?? "")
      .replace(/LNA\/LNB:(LNA|LNB)\s*\|\s*/g, "")
      .replace(/LNA_ID:[^\s|]+\s*\|\s*/g, "")
      .replace(/LNB_ID:[^\s|]+\s*\|\s*/g, "")
      .replace(/DEMOD_TYPE:[\w-]+\s*\|\s*/g, "")
      .trim(),
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      satellite_id: row.satellite_id ?? "",
      antenna_id: row.antenna_id ?? "",
      lna_type: initialLnaType,
      lna_id: parseEquipmentIdFromRemarks(row.remarks, "LNA_ID") ?? "",
      lnb_id: parseEquipmentIdFromRemarks(row.remarks, "LNB_ID") ?? "",
      demodulator_type: initialDemodType,
      demodulator_id: row.demodulator_id ?? "",
      processing_server_id: row.processing_server_id ?? "",
      observation_start: row.observation_start
        ? new Date(row.observation_start).toISOString().slice(0, 16)
        : "",
      status: row.status ?? "Planned",
      remarks: (row.remarks ?? "")
        .replace(/LNA\/LNB:(LNA|LNB)\s*\|\s*/g, "")
        .replace(/LNA_ID:[^\s|]+\s*\|\s*/g, "")
        .replace(/LNB_ID:[^\s|]+\s*\|\s*/g, "")
        .replace(/DEMOD_TYPE:[\w-]+(\s*\|\s*)?/g, "")
        .trim(),
    });
  }, [open, row.id]);

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  const inProgressMissingResources =
    form.status === "In Progress" &&
    (!form.antenna_id || !form.demodulator_id || !form.processing_server_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inProgressMissingResources) return;
    const metaParts = appendEquipmentMetaToRemarks(
      form.remarks,
      form.lna_type,
      form.demodulator_type,
      form.lna_id || undefined,
      form.lnb_id || undefined,
    );
    await onUpdate(row.id, {
      satellite_id: form.satellite_id,
      antenna_id: form.antenna_id || null,
      demodulator_id: form.demodulator_id || null,
      processing_server_id: form.processing_server_id || null,
      observation_start: form.observation_start || null,
      status: form.status,
      remarks: metaParts || null,
    });
    toast.success("Engagement updated");
    setOpen(false);
  }

  async function handleDelete() {
    await onRemove(row.id);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 mono text-[9px] uppercase tracking-wider gap-1">
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider text-[12px]">
            Edit Engagement — {row.satellites?.name ?? "—"}
          </DialogTitle>
        </DialogHeader>

        {inProgressMissingResources && (
          <div className="flex items-start gap-2 rounded-sm border border-amber-400/30 bg-amber-400/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="mono text-[9px] text-amber-700">
              "In Progress" requires Antenna, Demodulator, and Processor.
            </p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3 mt-1">
          <F label="Satellite">
            <Select value={form.satellite_id} onValueChange={(v) => set("satellite_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select satellite" /></SelectTrigger>
              <SelectContent>{sats.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>

          <F label="Antenna">
            <Select value={form.antenna_id} onValueChange={(v) => set("antenna_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select antenna" /></SelectTrigger>
              <SelectContent>
                {availableAntennas.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <div className="grid grid-cols-2 gap-2">
            <F label="LNA">
              <Select value={form.lna_id} onValueChange={(v) => set("lna_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select LNA" /></SelectTrigger>
                <SelectContent>
                  {availableLNA.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <F label="LNB">
              <Select value={form.lnb_id} onValueChange={(v) => set("lnb_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select LNB" /></SelectTrigger>
                <SelectContent>
                  {availableLNB.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <F label="Demodulator Type">
              <Select value={form.demodulator_type} onValueChange={(v) => set("demodulator_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEMOD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Demodulator">
              <Select value={form.demodulator_id} onValueChange={(v) => set("demodulator_id", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {availableDemod.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>

          <F label="Processor">
            <Select value={form.processing_server_id} onValueChange={(v) => set("processing_server_id", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {availableServers.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <F label="Scheduled Start">
            <Input type="datetime-local" value={form.observation_start}
              onChange={(e) => set("observation_start", e.target.value)} />
          </F>

          <F label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <F label="Remarks (optional)">
            <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </F>

          <Button type="submit" disabled={inProgressMissingResources}
            className="w-full mono uppercase tracking-wider text-[10px]">
            Save Changes
          </Button>

          <Button type="button" variant="destructive"
            className="w-full mono uppercase tracking-wider text-[10px]"
            onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Engagement
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AddEngagementProps { unitId: string; activeRows: any[]; equipment: any[]; primary?: boolean; }

function AddEngagement({ unitId, activeRows, equipment, primary }: AddEngagementProps) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: sats = [] } = useQuery({
    queryKey: ["sats"],
    queryFn: async () => {
      try {
        return await listSatellites();
      } catch (e) {
        console.error("[engagement] satellites fetch failed:", e);
        return [];
      }
    },
    retry: false,
  });

  const allocatedAntennaIds = useMemo(
    () => new Set(activeRows.map((r: any) => r.antenna_id).filter(Boolean)), [activeRows],
  );
  const allocatedDemodIds = useMemo(
    () => new Set(activeRows.map((r: any) => r.demodulator_id).filter(Boolean)), [activeRows],
  );
  const allocatedServerIds = useMemo(
    () => new Set(activeRows.map((r: any) => r.processing_server_id).filter(Boolean)), [activeRows],
  );

  const serviceable = (matchStr: string) =>
    equipment.filter((e: any) =>
      (e.category?.name ?? "").toLowerCase().includes(matchStr) && e.serviceability === "Operational",
    );

  const availableAntennas = serviceable("antenna").filter((e: any) => !allocatedAntennaIds.has(e.id));
  const availableLNA      = serviceable("lna").filter((e: any) => !allocatedAntennaIds.has(e.id));
  const availableLNB      = serviceable("lnb").filter((e: any) => !allocatedAntennaIds.has(e.id));
  const availableDemod    = serviceable("demodulat").filter((e: any) => !allocatedDemodIds.has(e.id));
  const availableServers  = serviceable("processing").filter((e: any) => !allocatedServerIds.has(e.id));

  const noAntenna = availableAntennas.length === 0;

  const [form, setForm] = useState({
    satellite_id: "",
    antenna_id: "",
    lna_type: "LNA" as "LNA" | "LNB",
    lna_id: "",
    lnb_id: "",
    demodulator_type: "DVB-S2",
    demodulator_id: "",
    processing_server_id: "",
    observation_start: "",
    status: "Planned",
    remarks: "",
  });

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  const inProgressMissingResources =
    form.status === "In Progress" &&
    (!form.antenna_id || !form.demodulator_id || !form.processing_server_id);

  const canSubmit = !noAntenna && !!form.satellite_id && !inProgressMissingResources;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const metaParts = appendEquipmentMetaToRemarks(
      form.remarks,
      form.lna_type,
      form.demodulator_type,
      form.lna_id || undefined,
      form.lnb_id || undefined,
    );
    const created = insertOperationalEngagement({
      unit_id: unitId,
      satellite_id: form.satellite_id,
      antenna_id: form.antenna_id || null,
      demodulator_id: form.demodulator_id || null,
      processing_server_id: form.processing_server_id || null,
      observation_start: form.observation_start || null,
      status: form.status as any,
      remarks: metaParts || null,
    });
    if (!created) return toast.error("Unknown satellite.");
    toast.success("Engagement created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["eng", unitId] });
    qc.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={primary ? "default" : "sm"}
          className={`mono uppercase tracking-wider ${
            primary
              ? "text-[11px] h-9 px-6 font-bold"
              : "text-[11px] h-7 px-3"
          }`}
        >
          <Plus className={`${primary ? "h-4 w-4" : "h-3.5 w-3.5"} mr-1.5`} /> New Engagement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider text-[12px]">New Engagement</DialogTitle>
        </DialogHeader>

        {noAntenna && (
          <div className="flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="mono text-[10px] font-bold text-destructive uppercase tracking-wide">
                No Antennas Available
              </p>
              <p className="mono text-[9px] text-foreground/75 mt-0.5">
                All serviceable antennas are currently allocated.
              </p>
            </div>
          </div>
        )}

        {!noAntenna && (
          <div className="mono text-[8.5px] text-foreground/75 border border-border/50 rounded-sm px-2 py-1.5 bg-secondary/10">
            Antenna capacity: <span className="font-bold text-foreground">{availableAntennas.length}</span> of{" "}
            <span className="font-bold text-foreground">{serviceable("antenna").length}</span> serviceable unallocated
            &nbsp;·&nbsp; Max concurrent = {serviceable("antenna").length}
          </div>
        )}

        {inProgressMissingResources && (
          <div className="flex items-start gap-2 rounded-sm border border-amber-400/30 bg-amber-400/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="mono text-[9px] text-amber-700">
              "In Progress" requires all of: Antenna, Demodulator, Processor.
              Missing: {[!form.antenna_id && "Antenna", !form.demodulator_id && "Demodulator", !form.processing_server_id && "Processor"].filter(Boolean).join(", ")}
            </p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3 mt-1">
          <F label="Satellite">
            <Select value={form.satellite_id} onValueChange={(v) => set("satellite_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select satellite" /></SelectTrigger>
              <SelectContent>{sats.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>

          <F label={`Antenna * — ${availableAntennas.length} available`}>
            <Select value={form.antenna_id} onValueChange={(v) => set("antenna_id", v)} disabled={noAntenna}>
              <SelectTrigger><SelectValue placeholder={noAntenna ? "None available" : "Select antenna *"} /></SelectTrigger>
              <SelectContent>
                {availableAntennas.length === 0
                  ? <SelectItem value="_none" disabled>No serviceable antennas</SelectItem>
                  : availableAntennas.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <div className="grid grid-cols-2 gap-2">
            <F label="LNA">
              <Select value={form.lna_id} onValueChange={(v) => set("lna_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select LNA" /></SelectTrigger>
                <SelectContent>
                  {availableLNA.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <F label="LNB">
              <Select value={form.lnb_id} onValueChange={(v) => set("lnb_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select LNB" /></SelectTrigger>
                <SelectContent>
                  {availableLNB.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <F label="Demodulator Type *">
              <Select value={form.demodulator_type} onValueChange={(v) => set("demodulator_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEMOD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label={`Device * — ${availableDemod.length} available`}>
              <Select value={form.demodulator_id} onValueChange={(v) => set("demodulator_id", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {availableDemod.length === 0
                    ? <SelectItem value="_none" disabled>None available</SelectItem>
                    : availableDemod.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>

          <F label={`Processor * — ${availableServers.length} available`}>
            <Select value={form.processing_server_id} onValueChange={(v) => set("processing_server_id", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {availableServers.length === 0
                  ? <SelectItem value="_none" disabled>None available</SelectItem>
                  : availableServers.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <F label="Scheduled Start">
            <Input type="datetime-local" value={form.observation_start}
              onChange={(e) => set("observation_start", e.target.value)} />
          </F>

          <F label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <F label="Remarks (optional)">
            <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </F>

          <Button type="submit" disabled={!canSubmit} className="w-full mono uppercase tracking-wider text-[10px]">
            {noAntenna
              ? "Blocked — No Antenna Available"
              : inProgressMissingResources
                ? "Assign Required Resources First"
                : "Create Engagement"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="label-eyebrow">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
