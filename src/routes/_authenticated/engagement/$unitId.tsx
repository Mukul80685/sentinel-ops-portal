import { Component, type ReactNode, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { getUnitById, listEquipmentForUnit, listEngagementsForUnit, listIntelRecordsForUnit } from "@/lib/queries";
import {
  getOperationalDataset,
  getOperationalEngagements,
  ensureOperationalSatelliteByName,
  insertOperationalEngagement,
  removeOperationalEngagement,
  updateOperationalEngagement,
  backfillEngagementIntelReportTags,
} from "@/lib/operationalStore";
import { canonicalSatelliteKey, normalizeSatelliteName } from "@/lib/visibilityMatrix";
import { useCanEdit } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  ACTIVE_SCAN_STATUSES,
} from "@/lib/engagementEngine";
import {
  computeUnitCapability,
} from "@/lib/liveEngagementModel";
import {
  intelRowToAnalysis,
  listActiveIntelMonitoringSatellites,
} from "@/lib/intelLiveBridge";
import { INT_UNITS } from "@/lib/intelRepository";
import { unitDisplayLabel, unitDisplayLocation } from "@/lib/operationalDataset";
import { DASHBOARD_PANEL_LABELS, dashboardPanelBackLink, VSAT_DASHBOARD_PATH } from "@/lib/dashboardLabels";
import { loadRingPalette, useEngagementRingVisuals } from "@/lib/engagementRingVisuals";
import {
  buildIntelMonitoringEngagementRows,
  buildResourceRingStats,
  collectEngagementAllocatedIds,
  collectFormAllocatedIds,
  averageResourceEngagementPct,
  parseEquipmentIdFromRemarks,
} from "@/lib/resourceEngagementStats";
import {
  engagementTableRowKey,
  filterEngagementVisibleIntelRows,
  hideEngagementTableRow,
  mergeIntelReportIntoRemarks,
  parseIntelReportIdFromRemarks,
  pruneLegacyHiddenEngagementKeys,
  restoreEngagementTableRow,
  ENGAGEMENT_TABLE_HIDDEN_EVENT,
} from "@/lib/engagementTableStore";
import { scanRowKey } from "@/lib/intelScanStorage";
import { notifyOperationalDerivedRefresh } from "@/lib/operationalRefresh";
import { useOperationalDerivedRevision } from "@/hooks/OperationalDerivedRevisionContext";
import {
  downloadEngagementImportTemplate,
  formatEngagementImportSkipLog,
  parseEngagementImportGrid,
  readEngagementImportSpreadsheet,
  summarizeEngagementImportResult,
} from "@/lib/engagementSpreadsheetImport";
import { ACCEPTED_SPREADSHEET_ACCEPT } from "@/lib/dataTableUtils";
import { flushElectronStorage, isElectronPersistAvailable } from "@/lib/electronPersist";
import { ArrowDownToLine, Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const DEMOD_BAND_OPTIONS = ["Narrowband", "Wideband", "DVB"] as const;
type DemodBand = (typeof DEMOD_BAND_OPTIONS)[number];

function isDemodBand(value: string): value is DemodBand {
  return (DEMOD_BAND_OPTIONS as readonly string[]).includes(value);
}

function demodBandFromEquipment(e: { name?: string; specifications?: string }): DemodBand | null {
  const hay = `${e.specifications ?? ""} ${e.name ?? ""}`.toLowerCase();
  if (hay.includes("narrowband")) return "Narrowband";
  if (hay.includes("wideband")) return "Wideband";
  if (hay.includes("dvb")) return "DVB";
  return null;
}

function satelliteNamesMatch(a: string, b: string): boolean {
  return (
    normalizeSatelliteName(a) === normalizeSatelliteName(b) ||
    canonicalSatelliteKey(a) === canonicalSatelliteKey(b)
  );
}

function isIntBackedEngagementRow(row: any): boolean {
  return Boolean(row?._intelRow?.reportId) || /^[\w-]+__/.test(String(row?.id ?? ""));
}

function isSyntheticEngagementId(id: string, row?: any): boolean {
  if (row && isIntBackedEngagementRow(row)) return true;
  return id.startsWith("intel-");
}

function intelReportIdFromRow(row: any): string | null {
  const fromIntel = row._intelRow?.reportId as string | undefined;
  if (fromIntel?.trim()) return fromIntel.trim();
  return parseIntelReportIdFromRemarks(row.remarks);
}

function engagementRowStorageKey(row: any): string {
  if (row._intelRow) return engagementTableRowKey(row._intelRow);
  const reportFromRemarks = parseIntelReportIdFromRemarks(row.remarks);
  if (reportFromRemarks) return reportFromRemarks;
  if (row.id && (isIntBackedEngagementRow(row) || String(row.id).includes("__"))) {
    return String(row.id);
  }
  const satName = row.satellites?.name as string | undefined;
  if (satName?.trim()) {
    return scanRowKey(satName, row._intelRow?.polarization ?? "—");
  }
  return String(row.id ?? "");
}


function resolveChainEquipmentDisplay(row: any, equipment: any[]) {
  const demodIds = equipmentIdsFromRow(row, "DEMOD_IDS", "DEMOD_ID", row.demodulator_id);
  return {
    demodulators: equipmentNamesFromIds(demodIds, equipment),
  };
}

/** Equal % widths on `<col>` — reliable in packaged Electron (table-layout: fixed). */
const ENGAGED_RESOURCES_DATA_COL_WIDTH = "14%";
const ENGAGED_RESOURCES_ACTIONS_COL_WIDTH = "14%";
const ENGAGED_RESOURCES_COLGROUP = [
  ENGAGED_RESOURCES_DATA_COL_WIDTH,
  ENGAGED_RESOURCES_DATA_COL_WIDTH,
  ENGAGED_RESOURCES_DATA_COL_WIDTH,
  ENGAGED_RESOURCES_DATA_COL_WIDTH,
  ENGAGED_RESOURCES_DATA_COL_WIDTH,
  ENGAGED_RESOURCES_ACTIONS_COL_WIDTH,
] as const;

function resolveOperationalEngagementForTableRow(row: any, unitEngagements: any[]): any | null {
  const reportId = intelReportIdFromRow(row);
  if (reportId) {
    const byReport = unitEngagements.find(
      (eng) => parseIntelReportIdFromRemarks(eng.remarks) === reportId,
    );
    if (byReport) return byReport;
  }
  if (!isSyntheticEngagementId(row.id, row)) {
    return unitEngagements.find((eng) => eng.id === row.id) ?? null;
  }
  const satName = row.satellites?.name as string | undefined;
  if (!satName) return null;
  return (
    unitEngagements.find((eng) => {
      const name = (eng.satellites?.name ?? eng.satellite_name) as string | undefined;
      return name && satelliteNamesMatch(name, satName);
    }) ?? null
  );
}

function collectExclusiveAllocatedIds(activeRows: any[], equipment: any[]): Set<string> {
  return collectEngagementAllocatedIds(activeRows, equipment);
}


/** Parse comma-separated equipment ids embedded in engagement remarks. */
function parseRemarkIdList(remarks: string | null | undefined, key: string): string[] {
  if (!remarks) return [];
  const m = remarks.match(new RegExp(`${key}:([^|]+)`));
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveSatelliteIdFromRow(row: any): string {
  if (row.satellite_id) return row.satellite_id as string;
  const displayName = row.satellites?.name as string | undefined;
  if (!displayName) return "";
  const match = getOperationalDataset().satellites.find((s) => satelliteNamesMatch(s.name, displayName));
  return match?.id ?? "";
}

function equipmentIdsFromRow(
  row: any,
  listKey: string,
  legacyKey: string,
  columnId?: string | null,
): string[] {
  const fromList = parseRemarkIdList(row.remarks, listKey);
  if (fromList.length) return fromList;
  const legacy = parseEquipmentIdFromRemarks(row.remarks, legacyKey);
  if (legacy) return [legacy];
  if (columnId) return [columnId];
  return [];
}

function equipmentNamesFromIds(ids: string[], equipment: any[]): string {
  if (!ids.length) return "—";
  const byId = new Map(equipment.map((e) => [e.id, e]));
  const names = ids.map((id) => byId.get(id)?.name).filter(Boolean) as string[];
  return names.length ? names.join(", ") : "—";
}

const ENGAGED_RESOURCE_HEAD_CELL =
  "text-left px-2 py-2 text-[9.5px] uppercase tracking-wider text-foreground font-bold border-r border-border/50 last:border-r-0 min-w-0 max-w-0 overflow-hidden";
const ENGAGED_RESOURCE_CELL = "px-2 py-2.5 align-top min-w-0 max-w-0 overflow-hidden";

function ChainEquipmentCell({ value }: { value: string }) {
  if (value === "—") {
    return <span className="block text-[12.5px] text-foreground/60 truncate">—</span>;
  }
  const names = value.split(", ");
  if (names.length === 1) {
    return (
      <span className="block text-[12.5px] text-foreground truncate" title={names[0]}>
        {names[0]}
      </span>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {names.map((name) => (
        <span key={name} className="block text-[12.5px] text-foreground truncate" title={name}>
          {name}
        </span>
      ))}
    </div>
  );
}

function isOtherResourcesEquipment(e: { category?: { name?: string } | null }): boolean {
  return (e.category?.name ?? "").trim().toLowerCase() === "other resources";
}

function parseOtherResourceIdsFromRemarks(remarks: string | null | undefined): string[] {
  return parseRemarkIdList(remarks, "OTHER_RESOURCE_IDS");
}

function otherResourceIdsFromRow(row: any, equipment: any[] = []): string[] {
  const fromIds = parseOtherResourceIdsFromRemarks(row.remarks);
  if (fromIds.length) return fromIds;
  const legacyNames = parseOtherResourcesFromRemarks(row.remarks);
  if (!legacyNames) return [];
  const byName = new Map(equipment.map((e) => [e.name.trim().toLowerCase(), e.id as string]));
  return legacyNames
    .split(",")
    .map((part) => byName.get(part.trim().toLowerCase()))
    .filter(Boolean) as string[];
}

function otherResourceNamesFromRow(row: any, equipment: any[]): string {
  return equipmentNamesFromIds(otherResourceIdsFromRow(row, equipment), equipment);
}

function parseOtherResourcesFromRemarks(remarks: string | null | undefined): string {
  if (!remarks) return "";
  const m = remarks.match(/OTHER_RESOURCES:([^|]+)/);
  return m?.[1]?.trim() ?? "";
}

function buildChainEngagementRemarks(input: {
  remarks: string;
  demodBands: DemodBand[];
  demodIds: string[];
  otherResourceIds: string[];
  equipment: { id: string; name: string }[];
}): string {
  const otherNames = input.otherResourceIds
    .map((id) => input.equipment.find((e) => e.id === id)?.name)
    .filter(Boolean) as string[];
  const parts = [
    input.demodBands.length ? `DEMOD_TYPES:${input.demodBands.join(",")}` : null,
    input.demodBands[0] ? `DEMOD_TYPE:${input.demodBands[0]}` : null,
    input.demodIds.length ? `DEMOD_IDS:${input.demodIds.join(",")}` : null,
    input.otherResourceIds.length ? `OTHER_RESOURCE_IDS:${input.otherResourceIds.join(",")}` : null,
    otherNames.length ? `OTHER_RESOURCES:${otherNames.join(", ")}` : null,
    input.remarks.trim(),
  ].filter(Boolean);
  return parts.join(" | ");
}

function toObservationStartIso(localValue: string): string | null {
  if (!localValue.trim()) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function stripChainMetaFromRemarks(remarks: string | null | undefined): string {
  return (remarks ?? "")
    .replace(/INT_REPORT:[^|]+\s*\|\s*/g, "")
    .replace(/DEMOD_TYPE:[^|]+\s*\|\s*/g, "")
    .replace(/DEMOD_TYPES:[^|]+\s*\|\s*/g, "")
    .replace(/DEMOD_IDS:[^|]+\s*\|\s*/g, "")
    .replace(/OTHER_RESOURCE_IDS:[^|]+\s*\|\s*/g, "")
    .replace(/OTHER_RESOURCES:[^|]+\s*\|\s*/g, "")
    .trim();
}

type EngagementChainForm = {
  satellite_id: string;
  antenna_id: string;
  demod_bands: DemodBand[];
  demodulator_ids: string[];
  observation_start: string;
  remarks: string;
  other_resource_ids: string[];
};

function inferDemodBandsFromIds(ids: string[], equipment: any[]): DemodBand[] {
  const bands = new Set<DemodBand>();
  for (const id of ids) {
    const eq = equipment.find((e) => e.id === id);
    const band = eq ? demodBandFromEquipment(eq) : null;
    if (band) bands.add(band);
  }
  return [...bands];
}

function parseDemodBandsFromRemarks(
  remarks: string | null | undefined,
  demodIds: string[],
  equipment: any[],
): DemodBand[] {
  const typesMatch = remarks?.match(/DEMOD_TYPES:([^|]+)/);
  if (typesMatch) {
    const parsed = typesMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(isDemodBand);
    if (parsed.length) return parsed;
  }
  const legacyMatch = remarks?.match(/DEMOD_TYPE:([\w-]+)/);
  if (legacyMatch?.[1]) {
    const legacy = legacyMatch[1];
    if (legacy.includes("DVB")) return ["DVB"];
    if (legacy === "Wideband") return ["Wideband"];
    if (legacy === "Narrowband") return ["Narrowband"];
  }
  return inferDemodBandsFromIds(demodIds, equipment);
}

function parseEngagementFormFromRow(row: any, equipment: any[] = []): EngagementChainForm {
  const demodIds = parseRemarkIdList(row.remarks, "DEMOD_IDS");
  const resolvedDemodIds = demodIds.length ? demodIds : row.demodulator_id ? [row.demodulator_id] : [];

  return {
    satellite_id: resolveSatelliteIdFromRow(row),
    antenna_id: row.antenna_id ?? "",
    demod_bands: parseDemodBandsFromRemarks(row.remarks, resolvedDemodIds, equipment),
    demodulator_ids: resolvedDemodIds,
    observation_start: toDatetimeLocalValue(row.observation_start),
    remarks: stripChainMetaFromRemarks(row.remarks),
    other_resource_ids: otherResourceIdsFromRow(row, equipment),
  };
}

function equipmentAvailableForEdit(
  items: { id: string; name: string }[],
  allocatedElsewhere: Set<string>,
  selectedIds: string[],
): { id: string; name: string }[] {
  return items.filter((e) => !allocatedElsewhere.has(e.id) || selectedIds.includes(e.id));
}

function EquipmentMultiPick({
  items,
  selected,
  onChange,
  emptyLabel,
}: {
  items: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
}) {
  return (
    <div className="max-h-36 overflow-y-auto border border-border rounded-sm p-2 space-y-1.5 bg-secondary/5">
      {items.length === 0 ? (
        <p className="mono text-[9px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        items.map((e) => {
          const checked = selected.includes(e.id);
          return (
            <label
              key={e.id}
              className="flex items-center gap-2 cursor-pointer rounded-sm px-1 py-0.5 hover:bg-secondary/30"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => {
                  const on = v === true;
                  onChange(on ? [...selected, e.id] : selected.filter((id) => id !== e.id));
                }}
              />
              <span className="mono text-[10px] text-foreground">{e.name}</span>
            </label>
          );
        })
      )}
    </div>
  );
}

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
  }));
}

export const Route = createFileRoute("/_authenticated/engagement/$unitId")({
  component: EngagementUnitPage,
});

function unitDisplayCode(code: string): string {
  return code.replace(/^GATE[-\s]?/i, "").trim() || code;
}
function parseDemodType(remarks: string | null): string {
  const m = remarks?.match(/DEMOD_TYPES:([^|]+)/);
  if (m) return m[1].trim();
  const legacy = remarks?.match(/DEMOD_TYPE:([\w-]+)/);
  return legacy ? legacy[1] : "—";
}

function withImportWarning(
  rowKey: string | undefined,
  column: string,
  content: ReactNode,
  isEmpty: boolean,
  warnings: Map<string, Set<string>>,
): ReactNode {
  if (!rowKey || !warnings.get(rowKey)?.has(column)) return content;
  if (isEmpty) {
    return <span className="text-red-400 font-semibold">Unmatched ⚠</span>;
  }
  return <span className="text-red-400 font-semibold">{content} ⚠</span>;
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
}: {
  utilPct: number;
  resourceStats: { label: string; total: number; faulty: number; engaged: number; pct: number }[];
  unitLabel: string;
  location?: string;
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
          backLink={{ to: VSAT_DASHBOARD_PATH, search: {} }}
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
  const operationalRevision = useOperationalDerivedRevision();
  const [hiddenRevision, setHiddenRevision] = useState(0);
  const [importWarnings, setImportWarnings] = useState<Map<string, Set<string>>>(() => new Map());
  const importFileRef = useRef<HTMLInputElement>(null);
  const importBatchRef = useRef(false);

  useEffect(() => {
    pruneLegacyHiddenEngagementKeys(unitId);
    const handler = () => setHiddenRevision((n) => n + 1);
    window.addEventListener(ENGAGEMENT_TABLE_HIDDEN_EVENT, handler);
    return () => window.removeEventListener(ENGAGEMENT_TABLE_HIDDEN_EVENT, handler);
  }, [unitId]);

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

  const liveEngagements = useMemo(() => {
    void operationalRevision;
    return getOperationalEngagements();
  }, [operationalRevision]);

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
        liveEngagements.length > 0 ? liveEngagements : rows,
        equipmentRaw,
        intelRows,
      ),
    [unitId, unit?.code, liveEngagements, rows, equipmentRaw, intelRows],
  );

  /** Active monitoring rows — INT scan reports with real metrics (matches pre-migration engagement table). */
  const intelMonitoringRows = useMemo(
    () =>
      listActiveIntelMonitoringSatellites(
        unitId,
        unit?.code,
        liveEngagements,
        equipmentRaw,
        intelRows,
      ),
    [unitId, unit?.code, liveEngagements, equipmentRaw, intelRows, operationalRevision],
  );

  useEffect(() => {
    if (!unitId || intelMonitoringRows.length === 0) return;
    if (backfillEngagementIntelReportTags(unitId, intelMonitoringRows) > 0) {
      notifyOperationalDerivedRefresh();
    }
  }, [unitId, intelMonitoringRows, operationalRevision]);

  const visibleIntelMonitoringRows = useMemo(() => {
    void hiddenRevision;
    return filterEngagementVisibleIntelRows(unitId, intelMonitoringRows);
  }, [unitId, intelMonitoringRows, hiddenRevision]);

  const enrichedEngagementSource = useMemo(() => {
    void operationalRevision;
    const ds = getOperationalDataset();
    return liveEngagements.map((e: any) => {
      if (e.satellites?.name) return e;
      const sat = ds.satellites.find((s) => s.id === e.satellite_id);
      return sat ? { ...e, satellites: { name: sat.name } } : e;
    });
  }, [liveEngagements, operationalRevision]);

  const intelActiveRows = useMemo(() => {
    return attachEquipmentToEngagements(
      buildIntelMonitoringEngagementRows(unitId, visibleIntelMonitoringRows, enrichedEngagementSource),
      equipmentRaw,
    );
  }, [unitId, visibleIntelMonitoringRows, enrichedEngagementSource, equipmentRaw, operationalRevision]);

  const getAllocatedIdsForRow = useCallback(
    (row: any) => {
      void operationalRevision;
      const ids = new Set<string>();
      const ownKey = engagementRowStorageKey(row).toLowerCase();
      const unitEngagements = getOperationalEngagements().filter((e: any) => e.unit_id === unitId);

      for (const intelRow of visibleIntelMonitoringRows) {
        const rowKey = engagementTableRowKey(intelRow).toLowerCase();
        if (rowKey === ownKey) continue;

        const peerRow = {
          id: engagementTableRowKey(intelRow),
          _intelRow: intelRow,
          satellites: { name: intelRow.satelliteName },
        };
        const eng = resolveOperationalEngagementForTableRow(peerRow, unitEngagements);
        if (!eng) continue;
        collectExclusiveAllocatedIds([eng], equipmentRaw).forEach((id) => ids.add(id));
      }
      return ids;
    },
    [unitId, visibleIntelMonitoringRows, equipmentRaw, operationalRevision],
  );

  const resourceStats = useMemo(
    () => buildResourceRingStats(equipmentRaw, intelActiveRows),
    [equipmentRaw, intelActiveRows],
  );

  const utilPct = useMemo(
    () => (intelActiveRows.length > 0 ? averageResourceEngagementPct(resourceStats) : 0),
    [intelActiveRows.length, resourceStats],
  );

  const analysisByEngId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSatelliteAnalysis>>();
    for (const a of capability.assignments) {
      map.set(a.engagementId, a.analysis);
    }
    return map;
  }, [capability.assignments]);

  async function invalidateEngagementQueries() {
    await Promise.all([
      qc.refetchQueries({ queryKey: ["eng", unitId] }),
      qc.refetchQueries({ queryKey: ENGAGEMENTS_ALL_KEY }),
    ]);
    notifyOperationalDerivedRefresh();
  }

  async function saveEngagementRecord(row: any, patch: any): Promise<boolean> {
    const importBatch = importBatchRef.current;
    const reportSaveError = (message: string) => {
      if (!importBatch) toast.error(message);
    };

    const satDisplayName =
      (row.satellites?.name as string | undefined) ??
      (patch.satellite_id
        ? getOperationalDataset().satellites.find((s) => s.id === patch.satellite_id)?.name
        : undefined);

    if (!importBatchRef.current) {
      const rowStorageKey = engagementRowStorageKey(row);
      setImportWarnings((prev) => {
        const next = new Map(prev);
        next.delete(rowStorageKey);
        return next;
      });
    }

    let satelliteId = patch.satellite_id as string | undefined;
    if (!satelliteId) {
      satelliteId = resolveSatelliteIdFromRow(row);
    }
    if (satDisplayName) {
      satelliteId = ensureOperationalSatelliteByName(satDisplayName).id;
    } else if (satelliteId) {
      const match = getOperationalDataset().satellites.find((s) => s.id === satelliteId);
      if (!match) {
        reportSaveError("Could not resolve satellite for this row.");
        return false;
      }
    }

    const patchWithSat = {
      ...patch,
      satellite_id: satelliteId,
      satellite_name: satDisplayName,
      remarks: intelReportIdFromRow(row)
        ? mergeIntelReportIntoRemarks(patch.remarks, intelReportIdFromRow(row)!)
        : patch.remarks,
    };
    const rowStorageKey = engagementRowStorageKey(row);
    const intelReportId = intelReportIdFromRow(row);
    const allUnitEngagements = getOperationalEngagements().filter((e) => e.unit_id === unitId);

    if (!isSyntheticEngagementId(row.id, row) && updateOperationalEngagement(row.id, patchWithSat)) {
      restoreEngagementTableRow(unitId, rowStorageKey);
      notifyOperationalDerivedRefresh();
      if (!importBatchRef.current) await invalidateEngagementQueries();
      return true;
    }

    if (intelReportId) {
      const existingByReport = allUnitEngagements.find(
        (r) => parseIntelReportIdFromRemarks(r.remarks) === intelReportId,
      );
      if (existingByReport && updateOperationalEngagement(existingByReport.id, patchWithSat)) {
        restoreEngagementTableRow(unitId, rowStorageKey);
        notifyOperationalDerivedRefresh();
        if (!importBatchRef.current) await invalidateEngagementQueries();
        return true;
      }
    }

    const sat = satelliteId
      ? getOperationalDataset().satellites.find((s) => s.id === satelliteId)
      : undefined;
    const sameNameIntelRowCount = satDisplayName
      ? visibleIntelMonitoringRows.filter((r) => satelliteNamesMatch(r.satelliteName, satDisplayName)).length
      : 0;
    const existingBySatellite =
      sat && (!intelReportId || sameNameIntelRowCount === 1)
        ? allUnitEngagements.find((r) => {
            const name = (r.satellites?.name ?? r.satellite_name) as string | undefined;
            return name && satelliteNamesMatch(name, sat.name);
          })
        : undefined;

    if (existingBySatellite && updateOperationalEngagement(existingBySatellite.id, patchWithSat)) {
      restoreEngagementTableRow(unitId, rowStorageKey);
      notifyOperationalDerivedRefresh();
      if (!importBatchRef.current) await invalidateEngagementQueries();
      return true;
    }

    if (!isSyntheticEngagementId(row.id, row)) {
      reportSaveError("Engagement not found.");
      return false;
    }

    if (!satelliteId) {
      reportSaveError("Could not resolve satellite for this row.");
      return false;
    }

    const alreadyExists = intelReportId
      ? allUnitEngagements.some(
          (r) => parseIntelReportIdFromRemarks(r.remarks) === intelReportId,
        )
      : allUnitEngagements.some((r) => {
          const name = (r.satellites?.name ?? r.satellite_name) as string | undefined;
          return name && satDisplayName && satelliteNamesMatch(name, satDisplayName);
        });
    if (alreadyExists) {
      if (intelReportId) {
        const existingByReportId = allUnitEngagements.find(
          (r) => parseIntelReportIdFromRemarks(r.remarks) === intelReportId,
        );
        if (existingByReportId && updateOperationalEngagement(existingByReportId.id, patchWithSat)) {
          restoreEngagementTableRow(unitId, rowStorageKey);
          notifyOperationalDerivedRefresh();
          if (!importBatch) await invalidateEngagementQueries();
          return true;
        }
      }

      const legacyMatch =
        intelReportId && sameNameIntelRowCount === 1
          ? allUnitEngagements.find((r) => {
              const name = (r.satellites?.name ?? r.satellite_name) as string | undefined;
              return (
                name &&
                satDisplayName &&
                satelliteNamesMatch(name, satDisplayName) &&
                parseIntelReportIdFromRemarks(r.remarks) !== intelReportId
              );
            })
          : undefined;
      if (legacyMatch && updateOperationalEngagement(legacyMatch.id, patchWithSat)) {
        restoreEngagementTableRow(unitId, rowStorageKey);
        notifyOperationalDerivedRefresh();
        if (!importBatch) await invalidateEngagementQueries();
        return true;
      }

      reportSaveError(
        intelReportId
          ? "Resource data for this satellite scan row already exists."
          : "An engagement for this satellite already exists.",
      );
      return false;
    }

    const created = insertOperationalEngagement({
      unit_id: unitId,
      satellite_id: satelliteId,
      satellite_name: satDisplayName ?? undefined,
      antenna_id: patchWithSat.antenna_id ?? null,
      demodulator_id: patchWithSat.demodulator_id ?? null,
      processing_server_id: patchWithSat.processing_server_id ?? null,
      observation_start: patchWithSat.observation_start ?? null,
      status:
        row.status && ACTIVE_SCAN_STATUSES.has(row.status as string)
          ? (row.status as string)
          : "In Progress",
      remarks: patchWithSat.remarks ?? null,
    });
    if (!created) {
      reportSaveError("Could not save engagement for this satellite.");
      return false;
    }
    restoreEngagementTableRow(unitId, rowStorageKey);
    notifyOperationalDerivedRefresh();
    if (!importBatchRef.current) await invalidateEngagementQueries();
    return true;
  }

  async function removeEngagementForRow(row: any) {
    const satName = row.satellites?.name as string | undefined;
    const pol = row._intelRow?.polarization ?? "—";
    const label = pol && pol !== "—" ? `${satName ?? "this satellite"} (${pol})` : (satName ?? "this satellite");
    if (!confirm(`Remove this engagement row for ${label}?`)) return;

    const rowStorageKey = engagementRowStorageKey(row);

    setImportWarnings((prev) => {
      const next = new Map(prev);
      next.delete(rowStorageKey);
      return next;
    });

    const intelReportId = intelReportIdFromRow(row);
    const unitEngagements = getOperationalEngagements().filter((e) => e.unit_id === unitId);

    if (!isSyntheticEngagementId(row.id, row)) {
      removeOperationalEngagement(row.id);
    } else if (intelReportId) {
      const existing = unitEngagements.find(
        (r) => parseIntelReportIdFromRemarks(r.remarks) === intelReportId,
      );
      if (existing) removeOperationalEngagement(existing.id);
    } else {
      const sameNameRows = visibleIntelMonitoringRows.filter(
        (r) => satName && satelliteNamesMatch(r.satelliteName, satName),
      );
      if (sameNameRows.length === 1) {
        const existing = unitEngagements.find((r) => {
          const name = r.satellites?.name as string | undefined;
          return name && satName && satelliteNamesMatch(name, satName);
        });
        if (existing) removeOperationalEngagement(existing.id);
      }
    }

    await invalidateEngagementQueries();
    hideEngagementTableRow(unitId, rowStorageKey);
    toast.success("Engagement row removed.");
  }

  async function importEngagementCSV(file: File) {
    importBatchRef.current = true;
    try {
      const grid = await readEngagementImportSpreadsheet(file);
      const parseResult = parseEngagementImportGrid(
        grid,
        visibleIntelMonitoringRows,
        equipmentRaw,
        unitId,
      );

      if (!parseResult.ok) {
        toast.error(parseResult.error ?? "Could not parse engagement import file.");
        return;
      }

      let importedRows = 0;
      let saveFailures = 0;

      for (const entry of parseResult.parsed) {
        const tableRow =
          intelActiveRows.find((row: any) => row.id === entry.rowKey) ??
          {
            id: entry.rowKey,
            satellites: { name: entry.monitoringRow.satelliteName },
            _intelRow: entry.monitoringRow,
            status: entry.monitoringRow.engagementStatus ?? "In Progress",
            remarks: null,
            antenna_id: null,
            demodulator_id: null,
            processing_server_id: null,
          };

        const { resources } = entry;

        const form: EngagementChainForm = {
          satellite_id: resolveSatelliteIdFromRow(tableRow),
          antenna_id: resources.antennaIds[0] ?? "",
          demod_bands: inferDemodBandsFromIds(resources.demodIds, equipmentRaw),
          demodulator_ids: resources.demodIds,
          observation_start: "",
          remarks: "",
          other_resource_ids: resources.otherIds,
        };

        const remarks = buildRemarksFromForm(form, equipmentRaw);
        const intelReportId = intelReportIdFromRow(tableRow);
        const saved = await saveEngagementRecord(tableRow, {
          satellite_id: form.satellite_id || undefined,
          antenna_id: form.antenna_id || null,
          demodulator_id: form.demodulator_ids[0] ?? null,
          processing_server_id: null,
          observation_start: null,
          status: tableRow.status,
          remarks: intelReportId
            ? mergeIntelReportIntoRemarks(remarks || null, intelReportId)
            : remarks || null,
        });

        if (saved) {
          importedRows++;
        } else {
          saveFailures++;
        }
      }

      setImportWarnings(parseResult.warnings);
      await invalidateEngagementQueries();
      if (isElectronPersistAvailable()) {
        await flushElectronStorage();
      }

      const summary = summarizeEngagementImportResult(importedRows, saveFailures, parseResult);
      const skipLog = formatEngagementImportSkipLog(parseResult.skipped);
      const skipPreview = parseResult.skipped
        .slice(0, 3)
        .map((row) => row.detail ?? row.reason)
        .filter(Boolean)
        .join("\n");

      if (summary.variant === "success") {
        toast.success(summary.message, skipPreview ? { description: skipPreview } : undefined);
      } else if (summary.variant === "error") {
        toast.error(summary.message);
      } else {
        toast.warning(summary.message, skipPreview ? { description: skipPreview, duration: 9000 } : undefined);
      }

      if (skipLog && parseResult.skipped.length > 3) {
        console.info("[engagement import skipped rows]\n" + skipLog);
      }
    } catch (error) {
      console.error("[importEngagementCSV]", error);
      toast.error(error instanceof Error ? error.message : "Could not import engagement file.");
    } finally {
      importBatchRef.current = false;
    }
  }

  const unitLabel = unit ? unitDisplayLabel(unit) : "Unit";
  const unitLocation = unit
    ? unitDisplayLocation(unit, INT_UNITS.find((u) => u.code === unitDisplayCode(unit.code))?.location)
    : undefined;

  const RESOURCE_HEADERS = [
    "#",
    "Satellite",
    "Antenna",
    "Demodulator",
    "Other Resources",
    "",
  ];

  return (
    <AppShell
      title={DASHBOARD_PANEL_LABELS.engagement}
      subtitle={unitLabel}
      showBack
      backLink={{ to: VSAT_DASHBOARD_PATH, search: {} }}
      horizontalNav={null}
    >

      <EngagementVisualization
        utilPct={utilPct}
        resourceStats={resourceStats}
        unitLabel={unitLabel}
        location={unitLocation}
      />

      {/* Engaged resources — active monitoring sessions (no scan statistics) */}
      <div className="panel overflow-hidden mb-3">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/20">
          <span className="mono text-[12px] font-bold uppercase tracking-wider text-foreground">
            Engaged Resources
          </span>
          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 mono text-[10.5px] uppercase tracking-wider gap-1 cursor-pointer"
                  onClick={() =>
                    downloadEngagementImportTemplate(
                      unit ? unitDisplayCode(unit.code) : unitId,
                      visibleIntelMonitoringRows,
                    )
                  }
                >
                  <Download className="h-3 w-3" /> Template
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 mono text-[10.5px] uppercase tracking-wider gap-1 cursor-pointer"
                  onClick={() => importFileRef.current?.click()}
                >
                  <ArrowDownToLine className="h-3 w-3" /> Import
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept={ACCEPTED_SPREADSHEET_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (selected) void importEngagementCSV(selected);
                    event.target.value = "";
                  }}
                />
              </>
            )}
          </div>
        </div>

        {intelActiveRows.length === 0 ? (
          <div className="px-4 py-5 text-center mono text-[9px] text-foreground/70 uppercase tracking-wider">
            No satellites actively monitored in Intelligence Repository
          </div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 320 }}>
            <table className="w-full table-fixed border-collapse mono text-[12.5px]">
              <colgroup>
                {ENGAGED_RESOURCES_COLGROUP.map((width, index) => (
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr>
                  {RESOURCE_HEADERS.map((h) => (
                    <th key={h || "actions"} className={ENGAGED_RESOURCE_HEAD_CELL}>
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
                  const chain = resolveChainEquipmentDisplay(r, equipmentRaw);
                  const satName = r.satellites?.name as string | undefined;
                  const otherResources = otherResourceNamesFromRow(r, equipmentRaw);
                  const rowWarningKey = engagementRowStorageKey(r);

                  return (
                    <tr key={r.id} className="hover:bg-secondary/20 transition-colors">
                      <td className={`${ENGAGED_RESOURCE_CELL} text-[12.5px] text-foreground/70`}>{idx + 1}</td>

                      <td className={ENGAGED_RESOURCE_CELL}>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span
                            className="block text-[12.5px] font-bold text-foreground truncate"
                            title={satName ?? undefined}
                          >
                            {satName ?? "—"}
                          </span>
                          {analysis.polarization !== "—" ? (
                            <span className="mono block truncate text-[11px] text-muted-foreground">
                              {analysis.polarization}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className={ENGAGED_RESOURCE_CELL}>
                        {withImportWarning(
                          rowWarningKey,
                          "Antenna",
                          r.antenna?.name ? (
                            <span
                              className="block text-[12.5px] text-foreground truncate"
                              title={r.antenna.name}
                            >
                              {r.antenna.name}
                            </span>
                          ) : (
                            <span className="block text-[12.5px] text-foreground/60 truncate">—</span>
                          ),
                          !r.antenna?.name,
                          importWarnings,
                        )}
                      </td>

                      <td className={ENGAGED_RESOURCE_CELL}>
                        {withImportWarning(
                          rowWarningKey,
                          "Demodulator",
                          chain.demodulators !== "—" ? (
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <ChainEquipmentCell value={chain.demodulators} />
                              {parseDemodType(r.remarks) !== "—" && (
                                <span className="block truncate text-[9.5px] uppercase text-foreground/70">
                                  {parseDemodType(r.remarks)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="block truncate text-foreground/60">—</span>
                          ),
                          chain.demodulators === "—",
                          importWarnings,
                        )}
                      </td>

                      <td className={ENGAGED_RESOURCE_CELL}>
                        {withImportWarning(
                          rowWarningKey,
                          "Other Resources",
                          <ChainEquipmentCell value={otherResources} />,
                          otherResources === "—",
                          importWarnings,
                        )}
                      </td>

                      <td className={`${ENGAGED_RESOURCE_CELL} px-1`}>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <EditEngagement
                              row={r}
                              equipment={equipmentRaw}
                              getAllocatedIdsForRow={getAllocatedIdsForRow}
                              onSave={saveEngagementRecord}
                              onRemove={removeEngagementForRow}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-destructive hover:text-destructive"
                              onClick={() => removeEngagementForRow(r)}
                              title="Remove engagement resources"
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

      {engError && (
        <div className="panel mb-3 px-3 py-2 mono text-[10px] text-amber-800 border border-amber-400/30 bg-amber-400/10">
          Engagement records could not be loaded — showing available unit data only.
        </div>
      )}

      {enrichedRows.length === 0 && !engError && <Empty title="No engagements recorded" />}
    </AppShell>
  );
}

interface EngagementResourceFieldsProps {
  form: EngagementChainForm;
  setField: <K extends keyof EngagementChainForm>(k: K, v: EngagementChainForm[K]) => void;
  toggleDemodBand: (band: DemodBand, enabled: boolean) => void;
  availableAntennas: { id: string; name: string }[];
  availableDemod: { id: string; name: string; band: DemodBand | null }[];
  availableOther: { id: string; name: string }[];
  noAntenna?: boolean;
}

function EngagementResourceFields({
  form,
  setField,
  toggleDemodBand,
  availableAntennas,
  availableDemod,
  availableOther,
  noAntenna = false,
}: EngagementResourceFieldsProps) {
  return (
    <>
      <F label={`Antenna — ${availableAntennas.length} available`}>
        <Select
          value={form.antenna_id || "__none__"}
          onValueChange={(v) => setField("antenna_id", v === "__none__" ? "" : v)}
          disabled={noAntenna}
        >
          <SelectTrigger>
            <SelectValue placeholder={noAntenna ? "None available" : "Select antenna"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {availableAntennas.length === 0 ? (
              <SelectItem value="_empty" disabled>No serviceable antennas</SelectItem>
            ) : (
              availableAntennas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </F>

      <F label="Demodulators">
        <div className="space-y-3">
          {DEMOD_BAND_OPTIONS.map((band) => {
            const bandItems = availableDemod.filter((e) => e.band === band);
            const selected = form.demod_bands.includes(band);
            return (
              <div key={band} className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(v) => toggleDemodBand(band, v === true)}
                  />
                  <span className="mono text-[10px] font-semibold text-foreground">{band}</span>
                </label>
                {selected && (
                  <EquipmentMultiPick
                    items={bandItems}
                    selected={form.demodulator_ids}
                    onChange={(ids) => setField("demodulator_ids", ids)}
                    emptyLabel={`No ${band} demodulators available`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </F>

      <F label={`Other Resources — select from inventory (${availableOther.length} available)`}>
        <EquipmentMultiPick
          items={availableOther}
          selected={form.other_resource_ids}
          onChange={(ids) => setField("other_resource_ids", ids)}
          emptyLabel="No Other Resources in Resource Inventory for this unit"
        />
      </F>

      <F label="Scheduled Start">
        <Input
          type="datetime-local"
          value={form.observation_start}
          onChange={(e) => setField("observation_start", e.target.value)}
        />
      </F>

      <F label="Remarks (optional)">
        <Input value={form.remarks} onChange={(e) => setField("remarks", e.target.value)} />
      </F>
    </>
  );
}

function buildRemarksFromForm(form: EngagementChainForm, equipment: { id: string; name: string }[]): string {
  const hasResources =
    Boolean(form.antenna_id) ||
    form.demodulator_ids.length > 0 ||
    form.demod_bands.length > 0 ||
    form.other_resource_ids.length > 0 ||
    form.remarks.trim().length > 0;
  if (!hasResources) return "";
  return buildChainEngagementRemarks({
    remarks: form.remarks,
    demodBands: form.demod_bands,
    demodIds: form.demodulator_ids,
    otherResourceIds: form.other_resource_ids,
    equipment,
  });
}

function mapAvailableDemods(items: { id: string; name: string }[], equipment: any[]) {
  const byId = new Map(equipment.map((e) => [e.id, e]));
  return items.map((e) => ({
    ...e,
    band: demodBandFromEquipment(byId.get(e.id) ?? e),
  }));
}

function toggleDemodBandOnForm(
  form: EngagementChainForm,
  equipment: any[],
  band: DemodBand,
  enabled: boolean,
): EngagementChainForm {
  const demod_bands = enabled
    ? [...form.demod_bands, band].filter((b, i, arr) => arr.indexOf(b) === i)
    : form.demod_bands.filter((b) => b !== band);

  if (enabled) {
    return { ...form, demod_bands };
  }

  const removedIds = new Set(
    equipment
      .filter((e) => demodBandFromEquipment(e) === band)
      .map((e) => e.id as string),
  );
  return {
    ...form,
    demod_bands,
    demodulator_ids: form.demodulator_ids.filter((id) => !removedIds.has(id)),
  };
}

interface EditEngagementProps {
  row: any;
  equipment: any[];
  getAllocatedIdsForRow: (row: any) => Set<string>;
  onSave: (row: any, patch: any) => Promise<boolean>;
  onRemove: (row: any) => Promise<unknown>;
}

function EditEngagement({
  row,
  equipment,
  getAllocatedIdsForRow,
  onSave,
  onRemove,
}: EditEngagementProps) {
  const [open, setOpen] = useState(false);
  const allocatedOthers = useMemo(
    () => getAllocatedIdsForRow(row),
    [getAllocatedIdsForRow, row],
  );

  const serviceable = (matchStr: string) =>
    equipment.filter((e: any) => {
      const cat = (e.category?.name ?? "").toLowerCase();
      if (e.serviceability !== "Operational") return false;
      return cat.includes(matchStr);
    });

  const [form, setForm] = useState<EngagementChainForm>(() => parseEngagementFormFromRow(row, equipment));

  useEffect(() => {
    if (open) setForm(parseEngagementFormFromRow(row, equipment));
  }, [open, row, equipment, row.remarks, row.antenna_id, row.demodulator_id]);

  function setField<K extends keyof EngagementChainForm>(k: K, v: EngagementChainForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const antennaPool = serviceable("antenna");
  const demodPool = serviceable("demodulat");
  const otherPool = equipment.filter(
    (e: any) => e.serviceability === "Operational" && isOtherResourcesEquipment(e),
  );

  const availableAntennas = equipmentAvailableForEdit(antennaPool, allocatedOthers, form.antenna_id ? [form.antenna_id] : []);
  const availableDemod = mapAvailableDemods(
    equipmentAvailableForEdit(demodPool, allocatedOthers, form.demodulator_ids),
    equipment,
  );
  const availableOther = equipmentAvailableForEdit(otherPool, allocatedOthers, form.other_resource_ids);

  function toggleDemodBand(band: DemodBand, enabled: boolean) {
    setForm((f) => toggleDemodBandOnForm(f, equipment, band, enabled));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const exclusiveSelected = [...collectFormAllocatedIds(form)];
    const allocatedNow = getAllocatedIdsForRow(row);
    const conflicts = exclusiveSelected.filter((id) => allocatedNow.has(id));
    if (conflicts.length > 0) {
      const byId = new Map(equipment.map((item: any) => [item.id as string, item.name as string]));
      const names = conflicts.map((id) => byId.get(id) ?? id).join(", ");
      toast.error(`Resource(s) already committed on another row: ${names}`);
      return;
    }

    const satelliteId = resolveSatelliteIdFromRow(row) || form.satellite_id;
    const remarks = buildRemarksFromForm(form, equipment);

    const saved = await onSave(row, {
      satellite_id: satelliteId || undefined,
      antenna_id: form.antenna_id || null,
      demodulator_id: form.demodulator_ids[0] ?? null,
      processing_server_id: null,
      observation_start: toObservationStartIso(form.observation_start),
      status: row.status,
      remarks: remarks || null,
    });
    if (!saved) return;
    toast.success("Engagement updated");
    setOpen(false);
  }

  async function handleDelete() {
    await onRemove(row);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 mono text-[10.5px] uppercase tracking-wider gap-1"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle className="mono uppercase tracking-wider text-[12px]">
            Edit Engagement — {row.satellites?.name ?? "—"}
          </DialogTitle>
        </DialogHeader>

        <div className="mono text-[8.5px] text-foreground/75 border border-border/50 rounded-sm px-2 py-1.5 bg-secondary/10">
          Assign Antenna, Demodulator, and Other Resources from inventory for{" "}
          <span className="font-bold">{row.satellites?.name ?? "this satellite"}</span>.
          Resources selected on other rows are locked — deselect here and save to free them for another row.
        </div>

        <form onSubmit={submit} className="space-y-3 mt-1">
          <EngagementResourceFields
            form={form}
            setField={setField}
            toggleDemodBand={toggleDemodBand}
            availableAntennas={availableAntennas}
            availableDemod={availableDemod}
            availableOther={availableOther}
          />

          <Button type="submit" className="w-full mono uppercase tracking-wider text-[10px]">
            Save Changes
          </Button>

          <Button
            type="button"
            variant="destructive"
            className="w-full mono uppercase tracking-wider text-[10px]"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Engagement
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
