import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft, ExternalLink, Globe, Radar, Satellite, Star, Trash2, Microscope,
  FileInput, AlertTriangle, FileSpreadsheet, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IntRepositoryFrequencyCell } from "@/components/intel/FrequencyStateSymbols";
import type { IntelDrillDownReport } from "@/lib/intelAnalysisData";
import { getUnitIntelName } from "@/lib/intelAnalysisData";
import { buildVisibilityDeepLinkSearch } from "@/lib/visibilityMatrix";
import { evaluateFrequencyAllocationEligibility } from "@/lib/intelIntegrity";
import {
  allocateToUnit,
  clearImportant,
  clearTechnicalAnalysis,
  discardFrequency,
  frequencyKey,
  getEligibleAllocationUnits,
  getFrequencyState,
  INTEL_FREQ_EVENT,
  markImportant,
  requestTechnicalAnalysis,
  type FrequencySection,
} from "@/lib/intelFrequencyActions";
import { useAuth } from "@/lib/auth";
import { listUnits, listEquipmentForUnit } from "@/lib/queries";
import { toast } from "sonner";
import { ENGAGEMENTS_ALL_KEY, fetchAllEngagements } from "@/lib/engagementEngine";
import { useQuery } from "@tanstack/react-query";
import {
  getReportCellEdits,
  setReportCellEdits,
  emptyReportEdits,
  INTEL_CELL_EDITS_EVENT,
  type ReportCellEdits,
} from "@/lib/intelCellStore";
import {
  gridToRecords,
  parseIntelSpreadsheet,
  SpreadsheetHeaderError,
} from "@/lib/intelSpreadsheetImport";

// ─── Types ─────────────────────────────────────────────────────────────────

type Props = { report: IntelDrillDownReport | null; open: boolean; onClose: () => void };
type FreqRowSnapshot = {
  outputType?: string;
  details?: string;
  protocol?: string;
  level?: string;
  remarks?: string;
};
type MenuState = {
  key: string;
  freqId: string;
  x: number;
  y: number;
  techActive: boolean;
  importantActive: boolean;
  rowSnapshot: FreqRowSnapshot;
};
type PendingAction = {
  action: string;
  key: string;
  frequencyId: string;
  actionLabel: string;
  rowSnapshot: FreqRowSnapshot;
};
type ColDef = { field: string; label: string; width: string; isFreqId?: boolean };
type MergedRow = { id: string; isExtra: boolean } & Record<string, string>;

function downloadCsvFile(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((c) => (c.includes(",") || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\r\n");
  // UTF-8 BOM ensures special characters (°, etc.) render correctly in Excel / Google Sheets.
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Template definitions ──────────────────────────────────────────────────

const TEMPLATES = {
  satellite: {
    filename: "template-satellite-details.csv",
    headers: ["Satellite Name", "Origin Country", "Launch Date", "Orbital Position", "Total Transponders"],
    example: ["Example Satellite", "Country Name", "YYYY-MM-DD", "XX.X°E", "32"],
  },
  scan: {
    filename: "template-scan-summary.csv",
    headers: ["Polarization", "Scan Start Date", "Frequencies Scanned", "Frequencies Analyzed", "Frequencies Pending"],
    example: ["V/H", "YYYY-MM-DD", "0", "0", "0"],
  },
  productive: {
    filename: "template-productive-frequencies.csv",
    headers: ["Frequency ID", "Output Type", "Details of Interception", "Protocol"],
    example: ["14.500 GHz", "Voice", "Clear audio signal detected on uplink", "TDMA"],
  },
  nonProductive: {
    filename: "template-non-productive-frequencies.csv",
    headers: ["Frequency ID", "Level", "Protocol", "Remarks"],
    example: ["12.100 GHz", "3", "OFDM", "Encrypted — unable to decode beyond layer 3"],
  },
  novel: {
    filename: "template-novel-protocols.csv",
    headers: ["Frequency", "Protocol", "Remarks"],
    example: ["14.500 GHz", "TDMA-X", "Novel TDMA variant — frequency must match a Freq ID in C1 or C2"],
  },
} as const;

function downloadTemplate(section: keyof typeof TEMPLATES) {
  const t = TEMPLATES[section];
  downloadCsvFile(t.filename, [t.headers, t.example]);
}

// ─── Misc helpers ───────────────────────────────────────────────────────────

function resolveFrequencyBeamContext(report: IntelDrillDownReport, frequencyId: string) {
  const ctx = evaluateFrequencyAllocationEligibility(report.satelliteName, report.unitId, frequencyId);
  return { band: ctx.band, beamName: ctx.matchingBeams[0] ?? report.beamsVisibleToUnit[0] ?? "—" };
}
function preventDialogDismissOnFreqMenu(e: Event) {
  if ((e.target as HTMLElement | null)?.closest("[data-freq-action-menu]")) e.preventDefault();
}

function buildImportantNotes(
  section: FrequencySection,
  row: FreqRowSnapshot,
  reportId: string,
): string {
  if (section === "productive") {
    const parts = [row.outputType, row.protocol, row.details].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : `INT ref · ${reportId}`;
  }
  const parts = [
    row.level ? `Level ${row.level}` : "",
    row.protocol,
    row.remarks,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : `INT ref · ${reportId}`;
}

function rowToSnapshot(row: MergedRow): FreqRowSnapshot {
  return {
    outputType: row.outputType,
    details: row.details,
    protocol: row.protocol,
    level: row.level,
    remarks: row.remarks,
  };
}

// ─── Color scheme ───────────────────────────────────────────────────────────

type ColorScheme = "sky" | "teal" | "emerald" | "amber" | "violet";

const COLOR = {
  sky: {
    border:  "border-l-4 border-l-sky-500/60",
    header:  "bg-sky-500/8",
    badge:   "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    toggle:  "text-sky-600 dark:text-sky-400 hover:bg-sky-500/10",
    row:     "hover:bg-sky-500/5",
  },
  teal: {
    border:  "border-l-4 border-l-teal-500/60",
    header:  "bg-teal-500/8",
    badge:   "bg-teal-500/15 text-teal-700 dark:text-teal-400",
    toggle:  "text-teal-600 dark:text-teal-400 hover:bg-teal-500/10",
    row:     "hover:bg-teal-500/5",
  },
  emerald: {
    border:  "border-l-4 border-l-emerald-500/60",
    header:  "bg-emerald-500/8",
    badge:   "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    toggle:  "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10",
    row:     "hover:bg-emerald-500/5",
  },
  amber: {
    border:  "border-l-4 border-l-amber-500/60",
    header:  "bg-amber-500/8",
    badge:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    toggle:  "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10",
    row:     "hover:bg-amber-500/5",
  },
  violet: {
    border:  "border-l-4 border-l-violet-500/60",
    header:  "bg-violet-500/8",
    badge:   "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    toggle:  "text-violet-600 dark:text-violet-400 hover:bg-violet-500/10",
    row:     "hover:bg-violet-500/5",
  },
} satisfies Record<ColorScheme, Record<string, string>>;

// ─── SectionImportBar ──────────────────────────────────────────────────────

function SectionImportBar({
  templateSection, onImport, importedMode, onClearImport,
  accept = ".csv,.xlsx,.xls,.ods",
}: {
  templateSection: keyof typeof TEMPLATES;
  onImport: (file: File) => void;
  importedMode?: boolean;
  onClearImport?: () => void;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {importedMode && onClearImport && (
        <button type="button" onClick={onClearImport}
          className="mono text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1">
          Clear
        </button>
      )}
      <button type="button" onClick={() => downloadTemplate(templateSection)}
        title="Download CSV template"
        className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-foreground/60 hover:text-foreground
                   border border-border/50 hover:border-border px-1.5 py-0.5 rounded-sm transition-colors">
        Template
      </button>
      <button type="button" onClick={() => ref.current?.click()}
        title="Import from CSV / Excel"
        className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-primary border border-primary/40
                   hover:bg-primary/10 px-1.5 py-0.5 rounded-sm transition-colors">
        <FileInput className="h-2.5 w-2.5" /> Import
      </button>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onImport(f); e.target.value = ""; } }} />
    </div>
  );
}

// ─── DisplayTable — read-only spreadsheet-style table ──────────────────────

const PREVIEW_ROWS = 3;

function DisplayTable({
  title, badge, color = "sky", section, columns, rows, invalidRowIds,
  collapsible = false,
  report, freqTick, userLabel, visibilityBlocked, blockedMessage,
  onAllocate, onAction,
  templateSection, onImport, importedMode, onClearImport,
}: {
  title: string; badge?: string; color?: ColorScheme; section: FrequencySection | null;
  columns: ColDef[]; rows: MergedRow[];
  invalidRowIds?: Set<string>;
  collapsible?: boolean;
  report: IntelDrillDownReport; freqTick: number; userLabel: string;
  visibilityBlocked?: boolean; blockedMessage?: string;
  onAllocate: (key: string, freq: string) => void; onAction: () => void;
  templateSection: keyof typeof TEMPLATES;
  onImport: (file: File) => void;
  importedMode?: boolean;
  onClearImport: () => void;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [collapsed, setCollapsed] = useState(collapsible);
  const unitLabel = getUnitIntelName(report.unitId);
  const freqIdField = columns.find((c) => c.isFreqId)?.field;
  const c = COLOR[color];

  const allRows = rows.filter((row) => {
    if (!section || !freqIdField) return true;
    const fid = row[freqIdField] ?? "";
    if (!fid) return true;
    return !getFrequencyState(frequencyKey(report.reportId, fid, section)).flags.discarded;
  });

  const displayRows = collapsible && collapsed ? allRows.slice(0, PREVIEW_ROWS) : allRows;
  const hiddenCount = allRows.length - PREVIEW_ROWS;

  function openMenu(e: React.MouseEvent, key: string, freqId: string, row: MergedRow) {
    if (visibilityBlocked) return;
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 300);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    const state = getFrequencyState(key);
    setMenu({
      key,
      freqId,
      x,
      y,
      techActive: state.flags.techAnalysis,
      importantActive: state.flags.important,
      rowSnapshot: rowToSnapshot(row),
    });
  }
  function queueAction(action: string, actionLabel: string) {
    if (!menu) return;
    setPending({
      action,
      key: menu.key,
      frequencyId: menu.freqId,
      actionLabel,
      rowSnapshot: menu.rowSnapshot,
    });
    setMenu(null);
  }
  function runAction(key: string, freqId: string, action: string, rowSnapshot: FreqRowSnapshot) {
    if (!section) return;
    const beamCtx = resolveFrequencyBeamContext(report, freqId);
    if (action === "important") {
      if (getFrequencyState(key).flags.important) {
        clearImportant(key, userLabel);
        toast.success("Removed from Important Frequencies");
      } else {
        markImportant(key, {
          frequency: freqId,
          satelliteName: report.satelliteName,
          unitLabel,
          reportId: report.reportId,
          userLabel,
          sourceUnitId: report.unitId,
          beamName: beamCtx.beamName,
          band: beamCtx.band,
          polarization: report.scanSummary.polarization,
          notes: buildImportantNotes(section, rowSnapshot, report.reportId),
        });
        toast.success("Added to Important Frequencies");
      }
    } else if (action === "discard") {
      discardFrequency(key, userLabel, {
        frequencyId: freqId,
        satelliteName: report.satelliteName,
        section,
        sourceUnitId: report.unitId,
        beamName: beamCtx.beamName,
        band: beamCtx.band,
      });
      toast.success("Moved to Discarded Frequencies");
    } else if (action === "tech") {
      if (getFrequencyState(key).flags.techAnalysis) {
        clearTechnicalAnalysis(key, userLabel);
        toast.success("Detailed analysis request cleared");
      } else {
        requestTechnicalAnalysis(key, userLabel, {
          sourceUnitId: report.unitId,
          frequencyId: freqId,
          satelliteName: report.satelliteName,
          beamName: beamCtx.beamName,
          band: beamCtx.band,
        });
        toast.success("Detailed analysis requested");
      }
    }
    onAction();
  }

  const hasInvalid = invalidRowIds && invalidRowIds.size > 0;

  return (
    <div className={`border border-border rounded-sm overflow-hidden ${c.border}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-2 py-1.5 border-b border-border gap-2 flex-wrap ${c.header}`}>
        <div className="flex items-center gap-2 min-w-0">
          {badge && (
            <span className={`mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${c.badge}`}>
              {badge}
            </span>
          )}
          <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground truncate">{title}</span>
          <span className="mono text-[9px] text-foreground/55 shrink-0">
            ({visibilityBlocked ? 0 : allRows.length})
          </span>
          {hasInvalid && (
            <span className="flex items-center gap-1 mono text-[9px] text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="h-3 w-3" /> {invalidRowIds!.size} invalid
            </span>
          )}
        </div>
        <SectionImportBar
          templateSection={templateSection} onImport={onImport}
          importedMode={importedMode} onClearImport={onClearImport}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className={`border-b border-border ${c.header}`}>
              <th className="w-8 text-center px-1 py-1 border-r border-border/40 mono text-[9px] text-foreground font-bold select-none">#</th>
              {columns.map((col) => (
                <th key={col.field} style={{ width: col.width }}
                  className="px-2 py-1 text-left mono text-[9px] uppercase tracking-wider text-foreground font-bold border-r border-border/30 last:border-r-0">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {allRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-5 text-center bg-white">
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-6 w-6 text-foreground/20" />
                    <p className="mono text-[11px] text-foreground/50">No data yet.</p>
                    <p className="mono text-[9px] text-foreground/40">
                      Click <span className="font-bold">Template</span> to download the format, fill it in and click <span className="font-bold">Import</span>.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              displayRows.map((row, rowIdx) => {
                const freqId = freqIdField ? (row[freqIdField] ?? "") : "";
                const key = section && freqId ? frequencyKey(report.reportId, freqId, section) : "";
                const isInvalid = invalidRowIds?.has(row.id);
                return (
                  <tr key={row.id}
                    className={`border-b border-border/25 bg-white hover:bg-gray-50 ${isInvalid ? "border-l-2 border-l-amber-500" : ""}`}>
                    <td className="w-8 text-center px-1 py-1.5 border-r border-border/25 mono text-[10px] text-foreground/50 select-none align-middle bg-white">
                      {isInvalid ? <AlertTriangle className="h-3 w-3 text-amber-500 mx-auto" /> : rowIdx + 1}
                    </td>
                    {columns.map((col) => (
                      <td key={col.field} className="border-r border-border/25 last:border-r-0 align-middle px-2 py-1.5 bg-white text-foreground"
                        onContextMenu={col.isFreqId && key && !visibilityBlocked ? (e) => openMenu(e, key, freqId, row) : undefined}>
                        {col.isFreqId && key ? (
                          <div className="mono text-[11px]">
                            <IntRepositoryFrequencyCell
                              stateKey={key}
                              frequencyId={freqId}
                              tick={freqTick}
                              actionsDisabled={visibilityBlocked}
                              onFrequencyClick={(e) => openMenu(e, key, freqId, row)}
                            />
                          </div>
                        ) : (
                          <span className="mono text-[11px] text-foreground break-words leading-snug">
                            {row[col.field] || <span className="text-foreground/35">—</span>}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Collapse / expand toggle */}
      {collapsible && allRows.length > PREVIEW_ROWS && (
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={`w-full flex items-center justify-center gap-1.5 py-1.5 border-t border-border/40 mono text-[9px] uppercase tracking-wider transition-colors ${c.toggle}`}
        >
          {collapsed ? (
            <><ChevronDown className="h-3 w-3" /> Show all {allRows.length} frequencies ({hiddenCount} more)</>
          ) : (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          )}
        </button>
      )}

      {menu && <FreqActionMenu menu={menu} onClose={() => setMenu(null)} onAction={(a, l) => queueAction(a, l)} />}
      <ActionConfirmDialog pending={pending} satelliteName={report.satelliteName}
        onConfirm={() => {
          if (pending) runAction(pending.key, pending.frequencyId, pending.action, pending.rowSnapshot);
          setPending(null);
        }}
        onCancel={() => setPending(null)} />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function IntelSatelliteDrillDown({ report, open, onClose }: Props) {
  const { user } = useAuth();
  const userLabel = user?.email ?? "Operator";
  const [freqTick, setFreqTick] = useState(0);
  const [allocateOpen, setAllocateOpen] = useState<{ key: string; frequency: string } | null>(null);
  const parentCloseGuardRef = useRef(false);
  const prevAllocateRef = useRef<typeof allocateOpen>(null);
  const [edits, setEditsState] = useState<ReportCellEdits>(emptyReportEdits);

  useEffect(() => {
    if (open && report?.reportId) setEditsState(getReportCellEdits(report.reportId));
  }, [open, report?.reportId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ reportId: string }>).detail;
      if (report?.reportId && detail?.reportId === report.reportId) {
        setEditsState(getReportCellEdits(report.reportId));
      }
    };
    window.addEventListener(INTEL_CELL_EDITS_EVENT, handler);
    return () => window.removeEventListener(INTEL_CELL_EDITS_EVENT, handler);
  }, [report?.reportId]);

  const saveEdits = useCallback(
    (updater: ReportCellEdits | ((prev: ReportCellEdits) => ReportCellEdits)) => {
      if (!report) return false;
      let saved = false;
      setEditsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saved = setReportCellEdits(report.reportId, next);
        return next;
      });
      return saved;
    },
    [report],
  );

  function handleClearImport(table: "productive" | "nonProductive" | "novel") {
    saveEdits((prev) => ({
      ...prev,
      [table]: { ...prev[table], importedMode: false, extra: [] },
    }));
  }
  function handleClearSatelliteImport() {
    saveEdits((prev) => ({ ...prev, satellite: {} }));
  }
  function handleClearScanImport() {
    saveEdits((prev) => ({ ...prev, scan: {} }));
  }

  // ── Import handlers ───────────────────────────────────────────────────────

  async function handleImportSatellite(file: File) {
    try {
      const grid = await parseIntelSpreadsheet(file);
      const objs = gridToRecords(grid, TEMPLATES.satellite.headers);
      if (!objs.length) return toast.error("No data rows found in file");
      const row = objs[0]!;
      const ok = saveEdits((prev) => ({
        ...prev,
        satellite: {
          name: row["Satellite Name"] ?? "",
          originCountry: row["Origin Country"] ?? "",
          launchDate: row["Launch Date"] ?? "",
          orbitalPosition: row["Orbital Position"] ?? "",
          totalTransponders: row["Total Transponders"] ?? "",
        },
      }));
      if (!ok) return toast.error("Could not save imported data — storage may be full");
      toast.success("Satellite details imported");
    } catch (err) {
      toast.error(
        err instanceof SpreadsheetHeaderError
          ? err.message
          : "Failed to parse file — check format matches the template",
      );
    }
  }

  async function handleImportScan(file: File) {
    try {
      const grid = await parseIntelSpreadsheet(file);
      const objs = gridToRecords(grid, TEMPLATES.scan.headers);
      if (!objs.length) return toast.error("No data rows found in file");
      const row = objs[0]!;
      const ok = saveEdits((prev) => ({
        ...prev,
        scan: {
          polarization: row["Polarization"] ?? "",
          scanStartDate: row["Scan Start Date"] ?? "",
          totalScanned: row["Frequencies Scanned"] ?? "",
          analyzed: row["Frequencies Analyzed"] ?? "",
          pending: row["Frequencies Pending"] ?? "",
        },
      }));
      if (!ok) return toast.error("Could not save imported data — storage may be full");
      toast.success("Scan summary imported");
    } catch (err) {
      toast.error(
        err instanceof SpreadsheetHeaderError
          ? err.message
          : "Failed to parse file — check format matches the template",
      );
    }
  }

  async function handleImportTable(table: "productive" | "nonProductive" | "novel", file: File) {
    try {
      const templateKey = table;
      const grid = await parseIntelSpreadsheet(file);
      const objs = gridToRecords(grid, TEMPLATES[templateKey].headers);
      if (!objs.length) return toast.error("No data rows found in file");

      const stamp = Date.now();
      const extra = objs.map((row, i) => {
        const id = `imp-${table}-${stamp}-${i}`;
        if (table === "productive") {
          return {
            id,
            frequencyId: row["Frequency ID"] ?? "",
            outputType: row["Output Type"] ?? "",
            details: row["Details of Interception"] ?? "",
            protocol: row["Protocol"] ?? "",
          };
        }
        if (table === "nonProductive") {
          return {
            id,
            frequencyId: row["Frequency ID"] ?? "",
            level: row["Level"] ?? "",
            protocol: row["Protocol"] ?? "",
            remarks: row["Remarks"] ?? "",
          };
        }
        return {
          id,
          frequency: row["Frequency"] ?? "",
          protocol: row["Protocol"] ?? "",
          remarks: row["Remarks"] ?? "",
        };
      });

      const ok = saveEdits((prev) => ({
        ...prev,
        [table]: { cells: {}, extra, importedMode: true },
      }));
      if (!ok) return toast.error("Could not save imported data — storage may be full");
      toast.success(`Imported ${extra.length} row${extra.length !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(
        err instanceof SpreadsheetHeaderError
          ? err.message
          : "Failed to parse file — check format matches the template",
      );
    }
  }

  // ── Build display rows ────────────────────────────────────────────────────

  function usesImportedRows(tbl: ReportCellEdits["productive"]): boolean {
    return tbl.importedMode === true || tbl.extra.length > 0;
  }

  function buildProductiveRows(): MergedRow[] {
    if (!report) return [];
    const tbl = edits.productive;
    if (usesImportedRows(tbl)) return tbl.extra.map((r) => ({ ...r, isExtra: true })) as MergedRow[];
    return report.productive.map((f) => ({
      id: f.id, isExtra: false,
      frequencyId: f.frequencyId, outputType: f.outputType,
      details: f.detailsOfInterception, protocol: f.protocolEncountered ?? "",
    }));
  }

  function buildNonProductiveRows(): MergedRow[] {
    if (!report) return [];
    const tbl = edits.nonProductive;
    if (usesImportedRows(tbl)) return tbl.extra.map((r) => ({ ...r, isExtra: true })) as MergedRow[];
    return report.nonProductive.map((f) => ({
      id: f.id, isExtra: false,
      frequencyId: f.frequencyId, level: f.level,
      protocol: f.protocolEncountered ?? "", remarks: f.remarks,
    }));
  }

  function buildNovelRows(): MergedRow[] {
    if (!report) return [];
    const tbl = edits.novel;
    if (usesImportedRows(tbl)) return tbl.extra.map((r) => ({ ...r, isExtra: true })) as MergedRow[];
    return report.novelProtocols.map((p, i) => ({
      id: `novel-${i}`, isExtra: false,
      frequency: p.frequency, protocol: p.protocol, remarks: p.remarks,
    }));
  }

  function buildNovelInvalidIds(): Set<string> {
    const prodFreqs  = new Set(buildProductiveRows().map((r)    => (r.frequencyId ?? "").trim().toLowerCase()).filter(Boolean));
    const npFreqs    = new Set(buildNonProductiveRows().map((r) => (r.frequencyId ?? "").trim().toLowerCase()).filter(Boolean));
    const invalid = new Set<string>();
    for (const row of buildNovelRows()) {
      const freq = (row.frequency ?? "").trim().toLowerCase();
      if (freq && !prodFreqs.has(freq) && !npFreqs.has(freq)) invalid.add(row.id);
    }
    return invalid;
  }

  // ── Other hooks / effects ─────────────────────────────────────────────────

  useEffect(() => {
    const wasOpen = prevAllocateRef.current;
    prevAllocateRef.current = allocateOpen;
    if (!wasOpen || allocateOpen) return;
    parentCloseGuardRef.current = true;
    const t = window.setTimeout(() => { parentCloseGuardRef.current = false; }, 200);
    return () => window.clearTimeout(t);
  }, [allocateOpen]);

  const { data: allEngagements = [] } = useQuery({ queryKey: ENGAGEMENTS_ALL_KEY, queryFn: fetchAllEngagements, staleTime: 30_000, enabled: open });
  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits, enabled: open });

  useEffect(() => {
    const handler = () => setFreqTick((t) => t + 1);
    window.addEventListener(INTEL_FREQ_EVENT, handler);
    return () => window.removeEventListener(INTEL_FREQ_EVENT, handler);
  }, []);

  const bump = useCallback(() => setFreqTick((t) => t + 1), []);

  if (!report) return null;

  const {
    baseProfile, scanSummary, totalBeamsAvailable, totalBeamCount,
    beamsVisibleToUnit, visibilityBlocked, visibilityConstraint,
  } = report;
  const unitName = getUnitIntelName(report.unitId);
  const visibilityDeepLink = buildVisibilityDeepLinkSearch(report.unitId, report.satelliteName);
  const blockedMsg = visibilityConstraint || "Scanning blocked — Visibility Matrix reports zero beams visible to this unit.";

  // Effective display values (imported takes priority over computed)
  const satName         = edits.satellite.name             ?? baseProfile.name;
  const satCountry      = edits.satellite.originCountry    ?? baseProfile.originCountry;
  const satLaunch       = edits.satellite.launchDate       ?? baseProfile.launchDate;
  const satOrbit        = edits.satellite.orbitalPosition  ?? baseProfile.orbitalPosition;
  const satTransponders = edits.satellite.totalTransponders ?? baseProfile.totalTransponders;
  const scanPolarization = edits.scan.polarization   ?? scanSummary.polarization;
  const scanDate         = edits.scan.scanStartDate   ?? scanSummary.scanStartDate;
  const scanTotal        = edits.scan.totalScanned    ?? scanSummary.totalScanned.toLocaleString();
  const scanAnalyzed     = edits.scan.analyzed        ?? scanSummary.analyzed.toLocaleString();
  const scanPending      = edits.scan.pending         ?? scanSummary.pending.toLocaleString();

  const hasSatImport  = Object.values(edits.satellite).some(Boolean);
  const hasScanImport = Object.values(edits.scan).some(Boolean);

  const productiveCols: ColDef[] = [
    { field: "frequencyId", label: "Frequency ID",           width: "20%", isFreqId: true },
    { field: "outputType",  label: "Output Type",            width: "16%" },
    { field: "details",     label: "Details of Interception",width: "42%" },
    { field: "protocol",    label: "Protocol",               width: "22%" },
  ];
  const nonProductiveCols: ColDef[] = [
    { field: "frequencyId", label: "Frequency ID", width: "22%", isFreqId: true },
    { field: "level",       label: "Level",        width: "10%" },
    { field: "protocol",    label: "Protocol",     width: "18%" },
    { field: "remarks",     label: "Remarks",      width: "50%" },
  ];
  const novelCols: ColDef[] = [
    { field: "frequency", label: "Frequency", width: "25%" },
    { field: "protocol",  label: "Protocol",  width: "25%" },
    { field: "remarks",   label: "Remarks",   width: "50%" },
  ];

  const novelInvalidIds = buildNovelInvalidIds();

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !allocateOpen && !parentCloseGuardRef.current) onClose(); }}>
        <DialogContent
          className="max-w-[98vw] w-full sm:max-w-7xl h-[96vh] max-h-[96vh] overflow-hidden flex flex-col p-0 gap-0 sm:rounded-lg border-border shadow-2xl"
          onPointerDownOutside={preventDialogDismissOnFreqMenu}
          onInteractOutside={preventDialogDismissOnFreqMenu}
        >
          {/* ── Header ── */}
          <div className="shrink-0 border-b border-border bg-card px-3 py-1.5">
            <DialogHeader className="space-y-0 text-left">
              <button type="button" onClick={onClose}
                className="inline-flex items-center gap-1 mono text-[10px] uppercase tracking-wider text-foreground hover:text-primary transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to satellite list
              </button>
              <DialogTitle className="mono text-sm font-bold uppercase tracking-wide text-foreground flex items-center gap-2 mt-0.5">
                <Satellite className="h-4 w-4 text-primary" />
                {report.satelliteName}
                <span className="text-foreground/50 font-normal">·</span>
                <span className="text-[11px] font-normal text-foreground/70">Intelligence Analysis</span>
              </DialogTitle>
              <p className="mono text-[10px] text-foreground/70 mt-0.5">
                {getUnitIntelName(report.unitId)}{!visibilityBlocked && <> · {scanPolarization}</>}
              </p>
            </DialogHeader>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">

            {visibilityBlocked && (
              <div className="rounded border border-amber-500/45 bg-amber-500/10 px-2 py-1.5" role="status">
                <p className="mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Visibility Constraint — Scan Blocked
                </p>
                <p className="mono text-[10px] text-foreground/85 mt-0.5">{blockedMsg}</p>
                <p className="mono text-[9px] text-foreground/60 mt-0.5">
                  All tables remain importable. Frequency actions are disabled until visibility is restored.
                </p>
              </div>
            )}

            {/* ── A · Satellite Details ── */}
            <SectionCard badge="A" color="sky" title="Satellite Details" icon={<Globe className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
              actions={
                <div className="flex items-center gap-1.5">
                  {hasSatImport && (
                    <button type="button" onClick={handleClearSatelliteImport}
                      className="mono text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1">Clear</button>
                  )}
                  <button type="button" onClick={() => downloadTemplate("satellite")}
                    className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-foreground/60 hover:text-foreground border border-border/50 hover:border-border px-1.5 py-0.5 rounded-sm transition-colors">
                    Template
                  </button>
                  <SectionImportFileButton templateSection="satellite" onImport={handleImportSatellite} />
                </div>
              }
            >
              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2 p-2.5 bg-white">
                <DisplayField label="Satellite Name" value={satName} emphasis />
                <DisplayField label="Origin Country" value={satCountry} />
                <DisplayField label="Launch Date" value={satLaunch} />
                <DisplayField label="Orbital Position" value={satOrbit} />
                <DisplayField label="Total Transponders" value={satTransponders} />
              </dl>
            </SectionCard>

            {/* ── B · Scanning Analysis Summary ── */}
            <SectionCard badge="B" color="teal" title="Scanning Analysis Summary" icon={<Radar className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />}
              actions={
                <div className="flex items-center gap-1.5">
                  {hasScanImport && (
                    <button type="button" onClick={handleClearScanImport}
                      className="mono text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1">Clear</button>
                  )}
                  <button type="button" onClick={() => downloadTemplate("scan")}
                    className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-foreground/60 hover:text-foreground border border-border/50 hover:border-border px-1.5 py-0.5 rounded-sm transition-colors">
                    Template
                  </button>
                  <SectionImportFileButton templateSection="scan" onImport={handleImportScan} />
                </div>
              }
            >
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-2.5 py-2 border-b border-border/30 bg-white">
                <StripItem label="Polarization"           value={scanPolarization} />
                <StripItem label="Scan Start Date"        value={scanDate} />
                <StripItem label="Frequencies Scanned"    value={scanTotal} />
                <StripItem label="Frequencies Analyzed"   value={scanAnalyzed} />
                <StripItem label="Frequencies Pending"    value={scanPending} />
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/40 bg-white">
                <BeamPanel title="Total Beams Available" beams={totalBeamsAvailable} countOverride={totalBeamCount} />
                <BeamPanel
                  title={`Beams Visible to ${unitName}`} beams={beamsVisibleToUnit} highlight
                  emptyMessage="No beams visible — no Visibility Matrix entries for this unit and satellite."
                  footerAction={visibilityDeepLink ? (
                    <Link to="/visibility" search={visibilityDeepLink}
                      className="inline-flex items-center gap-1 mono text-[9px] text-primary hover:underline" onClick={onClose}>
                      View in Satellite Visibility Matrix <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : undefined}
                />
              </div>
            </SectionCard>

            {/* ── C · Detailed Intelligence Analysis ── */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">C · Detailed Intelligence Analysis</span>
                <span className="mono text-[9px] text-foreground/50">
                  Click a Frequency ID for operational actions · Import replaces existing data
                </span>
              </div>

              <div className="space-y-2.5">
                <DisplayTable
                  title="Productive Frequencies" badge="C1" color="emerald"
                  collapsible section="productive"
                  columns={productiveCols} rows={buildProductiveRows()}
                  report={report} freqTick={freqTick} userLabel={userLabel}
                  visibilityBlocked={visibilityBlocked} blockedMessage={blockedMsg}
                  onAllocate={(key, freq) => setAllocateOpen({ key, frequency: freq })} onAction={bump}
                  templateSection="productive" onImport={(f) => handleImportTable("productive", f)}
                  importedMode={usesImportedRows(edits.productive)}
                  onClearImport={() => handleClearImport("productive")}
                />

                <DisplayTable
                  title="Non-Productive Frequencies" badge="C2" color="amber"
                  collapsible section="non_productive"
                  columns={nonProductiveCols} rows={buildNonProductiveRows()}
                  report={report} freqTick={freqTick} userLabel={userLabel}
                  visibilityBlocked={visibilityBlocked} blockedMessage={blockedMsg}
                  onAllocate={(key, freq) => setAllocateOpen({ key, frequency: freq })} onAction={bump}
                  templateSection="nonProductive" onImport={(f) => handleImportTable("nonProductive", f)}
                  importedMode={usesImportedRows(edits.nonProductive)}
                  onClearImport={() => handleClearImport("nonProductive")}
                />

                <DisplayTable
                  title="Newly Encountered Protocols" badge="C3" color="violet"
                  section={null}
                  columns={novelCols} rows={buildNovelRows()}
                  invalidRowIds={novelInvalidIds}
                  report={report} freqTick={freqTick} userLabel={userLabel}
                  visibilityBlocked={visibilityBlocked} blockedMessage={blockedMsg}
                  onAllocate={(key, freq) => setAllocateOpen({ key, frequency: freq })} onAction={bump}
                  templateSection="novel" onImport={(f) => handleImportTable("novel", f)}
                  importedMode={usesImportedRows(edits.novel)}
                  onClearImport={() => handleClearImport("novel")}
                />

                <div className="flex items-start gap-1.5 px-1 py-1 rounded-sm border border-border/30 bg-secondary/10">
                  <Info className="h-3 w-3 text-foreground/40 shrink-0 mt-0.5" />
                  <p className="mono text-[9px] text-foreground/55 leading-snug">
                    <span className="font-bold">C3 validation:</span> The <em>Frequency</em> column must match a Frequency ID present in C1 or C2.
                    Rows that fail this check are highlighted with <AlertTriangle className="h-2.5 w-2.5 text-amber-500 inline" />.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {allocateOpen && (
            <AllocateUnitDialog open={!!allocateOpen} onClose={() => setAllocateOpen(null)}
              freqKey={allocateOpen.key} frequency={allocateOpen.frequency}
              report={report} dbUnits={dbUnits} allEngagements={allEngagements} userLabel={userLabel}
              onDone={() => { bump(); setAllocateOpen(null); }} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Small helper to render an import-only file button ────────────────────

function SectionImportFileButton({ onImport }: { templateSection: keyof typeof TEMPLATES; onImport: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-primary border border-primary/40
                   hover:bg-primary/10 px-1.5 py-0.5 rounded-sm transition-colors">
        <FileInput className="h-2.5 w-2.5" /> Import
      </button>
      <input ref={ref} type="file" accept=".csv,.xlsx,.xls,.ods" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onImport(f); e.target.value = ""; } }} />
    </>
  );
}

// ─── Display-only components ───────────────────────────────────────────────

function DisplayField({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-sm border border-border/30 bg-white px-2 py-1.5">
      <dt className="mono text-[9px] uppercase tracking-wider text-foreground/70">{label}</dt>
      <dd className={`mt-0.5 mono ${emphasis ? "text-[12px] font-bold" : "text-[11px] font-semibold"} text-foreground`}>
        {value || <span className="text-foreground/35">—</span>}
      </dd>
    </div>
  );
}

function StripItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 mono rounded-sm border border-border/30 bg-white px-2 py-1">
      <span className="text-[9px] uppercase tracking-wider text-foreground/70 shrink-0">{label}:</span>
      <span className="text-[11px] font-bold text-foreground">{value || "—"}</span>
    </div>
  );
}

function SectionCard({ badge, color = "sky", title, icon, actions, children }: { badge?: string; color?: ColorScheme; title: string; icon?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  const c = COLOR[color];
  return (
    <div className={`border border-border rounded-sm overflow-hidden ${c.border}`}>
      <div className={`flex items-center justify-between px-2 py-1.5 border-b border-border gap-2 flex-wrap ${c.header}`}>
        <div className="flex items-center gap-2 min-w-0">
          {badge && <span className={`mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${c.badge}`}>{badge}</span>}
          {icon}
          <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground truncate">{title}</span>
        </div>
        {actions && <div className="flex items-center gap-1.5 shrink-0 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function BeamPanel({ title, beams, highlight, footerAction, emptyMessage = "None listed.", countOverride }: { title: string; beams: string[]; highlight?: boolean; footerAction?: React.ReactNode; emptyMessage?: string; countOverride?: number }) {
  const displayCount = countOverride ?? beams.length;
  return (
    <div className="flex flex-col bg-white">
      <div className="px-2 py-1 border-b border-border/30 bg-teal-500/8 shrink-0 flex items-baseline gap-2">
        <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</span>
        <span className="mono text-[9px] text-foreground/60">({displayCount})</span>
      </div>
      {beams.length === 0
        ? <p className="px-2 py-1.5 mono text-[11px] text-foreground bg-white">{emptyMessage}</p>
        : <ul className="px-2 py-1.5 space-y-0.5 overflow-y-auto max-h-[100px] bg-white">
            {beams.map((b) => (
              <li key={b} className="mono text-[11px] text-foreground leading-snug flex items-start gap-1 bg-white">
                <span className="text-primary shrink-0">•</span>
                <span className={highlight ? "font-semibold" : ""}>{b}</span>
              </li>
            ))}
          </ul>}
      {footerAction && <div className="px-2 py-1.5 border-t border-border/30 bg-white shrink-0">{footerAction}</div>}
    </div>
  );
}

// ─── Unchanged operational sub-components ─────────────────────────────────

function ActionConfirmDialog({ pending, satelliteName, onConfirm, onCancel }: { pending: PendingAction | null; satelliteName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="mono text-sm uppercase tracking-wide">Confirm Action</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1.5 pt-1">
              <p className="mono text-[11px] text-foreground"><span className="text-muted-foreground">Action: </span>{pending?.actionLabel}</p>
              <p className="mono text-[11px] text-foreground"><span className="text-muted-foreground">Frequency ID: </span>{pending?.frequencyId}</p>
              <p className="mono text-[11px] text-foreground"><span className="text-muted-foreground">Satellite: </span>{satelliteName}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">Cancel</AlertDialogCancel>
          <AlertDialogAction className="mono text-[11px] uppercase tracking-wider" onClick={(e) => { e.preventDefault(); onConfirm(); }}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FreqActionMenu({ menu, onClose, onAction }: { menu: MenuState; onClose: () => void; onAction: (action: string, label: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("click", handleOutside, true);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("click", handleOutside, true); document.removeEventListener("keydown", handleKey); };
  }, [onClose]);
  const items = [
    {
      id: "important",
      label: menu.importantActive ? "Remove from Important Frequencies" : "Add to Important Frequencies",
      icon: Star,
      iconClass: "text-amber-500",
    },
    {
      id: "tech",
      label: menu.techActive ? "Clear Detailed Analysis Request" : "Request Detailed Analysis",
      icon: Microscope,
      iconClass: "text-[#1a237e] dark:text-[#5c6bc0]",
    },
    {
      id: "discard",
      label: "Discard Frequency",
      icon: Trash2,
      iconClass: "text-destructive",
    },
  ];
  return (
    <div ref={ref} data-freq-action-menu className="fixed z-[200] min-w-[280px] rounded-md border border-border bg-popover shadow-lg py-1" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="px-2.5 py-1.5 border-b border-border/50 mono text-[9px] font-bold uppercase tracking-wider text-foreground">Frequency Actions</div>
      <div className="px-2.5 py-0.5 mono text-[10px] font-semibold text-foreground truncate">{menu.freqId}</div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} type="button"
            className="w-full text-left px-2.5 py-2 mono text-[11px] text-foreground hover:bg-primary/10 transition-colors flex items-center gap-2.5"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAction(item.id, item.label); }}>
            <Icon className={`h-3.5 w-3.5 shrink-0 ${item.iconClass}`} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function AllocateUnitDialog({ open, onClose, freqKey, frequency, report, dbUnits, allEngagements, userLabel, onDone }: { open: boolean; onClose: () => void; freqKey: string; frequency: string; report: IntelDrillDownReport; dbUnits: { id: string; code: string; name: string }[]; allEngagements: any[]; userLabel: string; onDone: () => void }) {
  const [eligible, setEligible] = useState<{ unitId: string; code: string; name: string; reason: string; matchingBeams: string[]; band: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const freqCtx = resolveFrequencyBeamContext(report, frequency);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getEligibleAllocationUnits(report.satelliteName, frequency, dbUnits, allEngagements, (id) => listEquipmentForUnit(id))
      .then((u) => { setEligible(u); setLoading(false); });
  }, [open, report.satelliteName, frequency, dbUnits, allEngagements]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="mono text-sm uppercase">Allocate To Unit</DialogTitle></DialogHeader>
        <p className="mono text-[11px] text-foreground mb-1">{frequency}</p>
        <p className="mono text-[9px] text-foreground/70 mb-2">{freqCtx.band}-band · beam context: {freqCtx.beamName}</p>
        <p className="mono text-[9px] text-foreground/70 mb-2">Only units with satellite visibility, matching {freqCtx.band}-band beam access, and engagement capacity are listed.</p>
        {loading ? <p className="mono text-[11px]">Evaluating eligible units…</p>
          : eligible.length === 0 ? <p className="mono text-[11px] text-amber-700">No units meet all criteria for this frequency.</p>
          : <ul className="space-y-1 max-h-48 overflow-y-auto">
              {eligible.map((u) => (
                <li key={u.unitId}>
                  <button type="button"
                    className="w-full text-left px-2 py-1.5 rounded-sm border border-border hover:border-primary/40 hover:bg-primary/5"
                    onClick={() => { allocateToUnit(freqKey, u.unitId, userLabel, { scannedByUnitId: report.unitId, satelliteName: report.satelliteName, frequencyId: frequency, beamName: u.matchingBeams[0] ?? freqCtx.beamName, band: u.band }); toast.success(`Allocated to ${u.name}`); onDone(); }}>
                    <div className="mono text-[11px] font-bold">{u.name}</div>
                    <div className="mono text-[9px] text-foreground/70">{u.reason}</div>
                  </button>
                </li>
              ))}
            </ul>}
      </DialogContent>
    </Dialog>
  );
}
