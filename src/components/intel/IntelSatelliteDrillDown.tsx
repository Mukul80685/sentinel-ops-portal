import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Radar,
  Satellite,
  FileInput,
  FileSpreadsheet,
  Info,
  Pencil,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IntelDrillDownReport } from "@/lib/intelAnalysisData";
import { getUnitIntelName } from "@/lib/intelAnalysisData";
import { buildVisibilityDeepLinkSearch } from "@/lib/visibilityMatrix";
import { toast } from "sonner";
import {
  getReportCellEdits,
  setReportCellEdits,
  emptyReportEdits,
  INTEL_CELL_EDITS_EVENT,
  parseFrequencyAnalysisImportRows,
  type FrequencyAnalysisEdits,
  type ReportCellEdits,
  type SatelliteDetailEdits,
  type ScanSummaryEdits,
} from "@/lib/intelCellStore";
import {
  gridToRecords,
  parseIntelSpreadsheet,
  SpreadsheetHeaderError,
} from "@/lib/intelSpreadsheetImport";

type Props = { report: IntelDrillDownReport | null; open: boolean; onClose: () => void };

const FREQUENCY_ANALYSIS_HEADERS = [
  "Productive Frequencies",
  "Non-Productive Frequencies",
  "Newly Encountered Protocols",
] as const;

function downloadCsvFile(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((c) => (c.includes(",") || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  frequencyAnalysis: {
    filename: "template-frequency-analysis-summary.csv",
    headers: [...FREQUENCY_ANALYSIS_HEADERS],
    example: ["30", "20", "TDMA; OFDM; Novel-X"],
  },
} as const;

function downloadTemplate(section: keyof typeof TEMPLATES) {
  const t = TEMPLATES[section];
  downloadCsvFile(t.filename, [t.headers, t.example]);
}

type ColorScheme = "sky" | "teal" | "emerald" | "amber" | "violet";

const COLOR = {
  sky: {
    border: "border-l-4 border-l-sky-500/60",
    header: "bg-sky-500/8",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  teal: {
    border: "border-l-4 border-l-teal-500/60",
    header: "bg-teal-500/8",
    badge: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  },
  violet: {
    border: "border-l-4 border-l-violet-500/60",
    header: "bg-violet-500/8",
    badge: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
} satisfies Record<ColorScheme, Record<string, string>>;

function SectionImportBar({
  templateSection,
  onImport,
  importedMode,
  onClearImport,
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
        <button
          type="button"
          onClick={onClearImport}
          className="mono text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1"
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={() => downloadTemplate(templateSection)}
        title="Download CSV template"
        className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-foreground/60 hover:text-foreground border border-border/50 hover:border-border px-1.5 py-0.5 rounded-sm transition-colors"
      >
        Template
      </button>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        title="Import from CSV / Excel"
        className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-primary border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded-sm transition-colors"
      >
        <FileInput className="h-2.5 w-2.5" /> Import
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onImport(f);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

function EditIconButton({
  active,
  onClick,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={active ? "Save changes" : ariaLabel}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-sm border transition-colors ${
        active
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700"
          : "border-border/50 text-foreground/60 hover:border-border hover:text-foreground"
      }`}
    >
      {active ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
    </button>
  );
}

type FrequencyAnalysisRow = {
  id: string;
  productiveCount: string;
  nonProductiveCount: string;
  protocol: string;
};

function frequencyAnalysisToRows(data: FrequencyAnalysisEdits): FrequencyAnalysisRow[] {
  const productiveCount = data.productiveCount?.trim() ?? "";
  const nonProductiveCount = data.nonProductiveCount?.trim() ?? "";
  const protocols = data.protocols ?? [];

  if (!productiveCount && !nonProductiveCount && protocols.length === 0) return [];

  if (protocols.length === 0) {
    return [{ id: "summary", productiveCount, nonProductiveCount, protocol: "" }];
  }

  return protocols.map((protocol, index) => ({
    id: `protocol-${index}`,
    productiveCount: index === 0 ? productiveCount : "",
    nonProductiveCount: index === 0 ? nonProductiveCount : "",
    protocol,
  }));
}

function rowsToFrequencyAnalysis(rows: FrequencyAnalysisRow[]): FrequencyAnalysisEdits {
  const productiveCount = rows.find((row) => row.productiveCount.trim())?.productiveCount.trim() ?? "";
  const nonProductiveCount = rows.find((row) => row.nonProductiveCount.trim())?.nonProductiveCount.trim() ?? "";
  const protocols = rows.map((row) => row.protocol.trim()).filter(Boolean);
  return {
    productiveCount,
    nonProductiveCount,
    protocols,
    importedMode: true,
  };
}

function FrequencyAnalysisTable({
  rows,
  editing,
  onChange,
  onImport,
  importedMode,
  onClearImport,
  onToggleEdit,
}: {
  rows: FrequencyAnalysisRow[];
  editing: boolean;
  onChange: (rows: FrequencyAnalysisRow[]) => void;
  onImport: (file: File) => void;
  importedMode?: boolean;
  onClearImport: () => void;
  onToggleEdit: () => void;
}) {
  const c = COLOR.violet;

  function updateRow(id: string, patch: Partial<FrequencyAnalysisRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addProtocolRow() {
    onChange([
      ...rows,
      {
        id: `protocol-${Date.now()}`,
        productiveCount: "",
        nonProductiveCount: "",
        protocol: "",
      },
    ]);
  }

  const displayRows =
    rows.length > 0
      ? rows
      : editing
        ? [{ id: "summary", productiveCount: "", nonProductiveCount: "", protocol: "" }]
        : [];

  return (
    <div className={`border border-border rounded-sm overflow-hidden ${c.border}`}>
      <div className={`flex items-center justify-between px-2 py-1.5 border-b border-border gap-2 flex-wrap ${c.header}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${c.badge}`}>
            C
          </span>
          <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground truncate">
            Frequency Analysis Summary
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <EditIconButton
            active={editing}
            onClick={onToggleEdit}
            ariaLabel="Edit frequency analysis summary"
          />
          <SectionImportBar
            templateSection="frequencyAnalysis"
            onImport={onImport}
            importedMode={importedMode}
            onClearImport={onClearImport}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className={`border-b border-border ${c.header}`}>
              <th className="w-8 text-center px-1 py-1 border-r border-border/40 mono text-[9px] text-foreground font-bold select-none">
                #
              </th>
              {FREQUENCY_ANALYSIS_HEADERS.map((label) => (
                <th
                  key={label}
                  className="px-2 py-1 text-left mono text-[9px] uppercase tracking-wider text-foreground font-bold border-r border-border/30 last:border-r-0"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-5 text-center bg-white">
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-6 w-6 text-foreground/20" />
                    <p className="mono text-[11px] text-foreground/50">No data yet.</p>
                    <p className="mono text-[9px] text-foreground/40">
                      Use <span className="font-bold">Template</span> then <span className="font-bold">Import</span>, or click the pencil icon to enter values manually.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              displayRows.map((row, rowIdx) => (
                <tr key={row.id} className="border-b border-border/25 bg-white hover:bg-gray-50">
                  <td className="w-8 text-center px-1 py-1.5 border-r border-border/25 mono text-[10px] text-foreground/50 select-none align-middle bg-white">
                    {rowIdx + 1}
                  </td>
                  <td className="border-r border-border/25 align-middle px-2 py-1.5 bg-white">
                    {editing ? (
                      <input
                        value={row.productiveCount}
                        onChange={(e) => updateRow(row.id, { productiveCount: e.target.value })}
                        className="mono w-full text-[11px] border border-border/50 rounded-sm px-1.5 py-1 bg-white"
                      />
                    ) : (
                      <span className="mono text-[11px] text-foreground">{row.productiveCount || "—"}</span>
                    )}
                  </td>
                  <td className="border-r border-border/25 align-middle px-2 py-1.5 bg-white">
                    {editing ? (
                      <input
                        value={row.nonProductiveCount}
                        onChange={(e) => updateRow(row.id, { nonProductiveCount: e.target.value })}
                        className="mono w-full text-[11px] border border-border/50 rounded-sm px-1.5 py-1 bg-white"
                      />
                    ) : (
                      <span className="mono text-[11px] text-foreground">{row.nonProductiveCount || "—"}</span>
                    )}
                  </td>
                  <td className="align-middle px-2 py-1.5 bg-white">
                    {editing ? (
                      <input
                        value={row.protocol}
                        onChange={(e) => updateRow(row.id, { protocol: e.target.value })}
                        className="mono w-full text-[11px] border border-border/50 rounded-sm px-1.5 py-1 bg-white"
                      />
                    ) : (
                      <span className="mono text-[11px] text-foreground break-words leading-snug">
                        {row.protocol || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="flex items-center justify-between border-t border-border/40 px-2 py-1.5 bg-white">
          <button
            type="button"
            onClick={addProtocolRow}
            className="mono text-[9px] uppercase tracking-wider text-primary hover:underline"
          >
            + Add protocol row
          </button>
          <p className="mono text-[9px] text-foreground/50">
            Separate multiple protocols with semicolons when importing.
          </p>
        </div>
      )}
    </div>
  );
}

export function IntelSatelliteDrillDown({ report, open, onClose }: Props) {
  const [edits, setEditsState] = useState<ReportCellEdits>(emptyReportEdits());
  const [editingSatellite, setEditingSatellite] = useState(false);
  const [editingScan, setEditingScan] = useState(false);
  const [editingFrequencyAnalysis, setEditingFrequencyAnalysis] = useState(false);
  const [satelliteDraft, setSatelliteDraft] = useState<SatelliteDetailEdits>({});
  const [scanDraft, setScanDraft] = useState<ScanSummaryEdits>({});
  const [frequencyAnalysisDraft, setFrequencyAnalysisDraft] = useState<FrequencyAnalysisRow[]>([]);

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

  function handleClearFrequencyAnalysis() {
    saveEdits((prev) => ({
      ...prev,
      frequencyAnalysis: { protocols: [], importedMode: false },
    }));
    setFrequencyAnalysisDraft([]);
  }

  function handleClearSatelliteImport() {
    saveEdits((prev) => ({ ...prev, satellite: {} }));
    setSatelliteDraft({});
  }

  function handleClearScanImport() {
    saveEdits((prev) => ({ ...prev, scan: {} }));
    setScanDraft({});
  }

  function toggleSatelliteEdit() {
    if (editingSatellite) {
      const ok = saveEdits((prev) => ({ ...prev, satellite: { ...satelliteDraft } }));
      if (!ok) return toast.error("Could not save changes — storage may be full");
      setEditingSatellite(false);
      toast.success("Satellite details updated");
    } else {
      setSatelliteDraft({ ...edits.satellite });
      setEditingSatellite(true);
    }
  }

  function toggleScanEdit() {
    if (editingScan) {
      const ok = saveEdits((prev) => ({ ...prev, scan: { ...scanDraft } }));
      if (!ok) return toast.error("Could not save changes — storage may be full");
      setEditingScan(false);
      toast.success("Scan summary updated");
    } else {
      setScanDraft({ ...edits.scan });
      setEditingScan(true);
    }
  }

  function toggleFrequencyAnalysisEdit() {
    if (editingFrequencyAnalysis) {
      const next = rowsToFrequencyAnalysis(frequencyAnalysisDraft);
      const ok = saveEdits((prev) => ({
        ...prev,
        frequencyAnalysis: { ...next, importedMode: true },
      }));
      if (!ok) return toast.error("Could not save changes — storage may be full");
      setEditingFrequencyAnalysis(false);
      toast.success("Frequency analysis summary updated");
    } else {
      setFrequencyAnalysisDraft(frequencyAnalysisToRows(edits.frequencyAnalysis));
      setEditingFrequencyAnalysis(true);
    }
  }

  async function handleImportSatellite(file: File) {
    try {
      const grid = await parseIntelSpreadsheet(file);
      const objs = gridToRecords(grid, TEMPLATES.satellite.headers, {
        templateExample: TEMPLATES.satellite.example,
      });
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
      setEditingSatellite(false);
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
      const objs = gridToRecords(grid, TEMPLATES.scan.headers, {
        templateExample: TEMPLATES.scan.example,
      });
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
      setEditingScan(false);
      toast.success("Scan summary imported");
    } catch (err) {
      toast.error(
        err instanceof SpreadsheetHeaderError
          ? err.message
          : "Failed to parse file — check format matches the template",
      );
    }
  }

  async function handleImportFrequencyAnalysis(file: File) {
    try {
      const grid = await parseIntelSpreadsheet(file);
      const objs = gridToRecords(grid, TEMPLATES.frequencyAnalysis.headers, {
        templateExample: TEMPLATES.frequencyAnalysis.example,
      });
      if (!objs.length) {
        return toast.error("No data rows found — remove the template example row and add your data below the header.");
      }
      const parsed = parseFrequencyAnalysisImportRows(objs);
      if (!parsed.productiveCount && !parsed.nonProductiveCount && !(parsed.protocols?.length ?? 0)) {
        return toast.error("No valid data found — enter counts and/or protocol names in the three columns.");
      }
      const ok = saveEdits((prev) => ({
        ...prev,
        frequencyAnalysis: parsed,
      }));
      if (!ok) return toast.error("Could not save imported data — storage may be full");
      setFrequencyAnalysisDraft(frequencyAnalysisToRows(parsed));
      setEditingFrequencyAnalysis(false);
      toast.success("Frequency analysis summary imported");
    } catch (err) {
      toast.error(
        err instanceof SpreadsheetHeaderError
          ? err.message
          : "Failed to parse file — column names must match the template exactly",
      );
    }
  }

  if (!report) return null;

  const {
    baseProfile,
    scanSummary,
    totalBeamsAvailable,
    totalBeamCount,
    beamsVisibleToUnit,
    visibilityBlocked,
    visibilityConstraint,
  } = report;
  const unitName = getUnitIntelName(report.unitId);
  const visibilityDeepLink = buildVisibilityDeepLinkSearch(report.unitId, report.satelliteName);
  const blockedMsg =
    visibilityConstraint || "Scanning blocked — Visibility Matrix reports zero beams visible to this unit.";

  const satName = edits.satellite.name ?? baseProfile.name;
  const satCountry = edits.satellite.originCountry ?? baseProfile.originCountry;
  const satLaunch = edits.satellite.launchDate ?? baseProfile.launchDate;
  const satOrbit = edits.satellite.orbitalPosition ?? baseProfile.orbitalPosition;
  const satTransponders = edits.satellite.totalTransponders ?? baseProfile.totalTransponders;
  const scanPolarization = edits.scan.polarization ?? scanSummary.polarization;
  const scanDate = edits.scan.scanStartDate ?? scanSummary.scanStartDate;
  const scanTotal = edits.scan.totalScanned ?? scanSummary.totalScanned.toLocaleString();
  const scanAnalyzed = edits.scan.analyzed ?? scanSummary.analyzed.toLocaleString();
  const scanPending = edits.scan.pending ?? scanSummary.pending.toLocaleString();

  const hasSatImport = Object.values(edits.satellite).some(Boolean);
  const hasScanImport = Object.values(edits.scan).some(Boolean);
  const hasFrequencyAnalysisImport = edits.frequencyAnalysis.importedMode === true;
  const frequencyAnalysisRows = editingFrequencyAnalysis
    ? frequencyAnalysisDraft
    : frequencyAnalysisToRows(edits.frequencyAnalysis);

  const satelliteFields: Array<{
    key: keyof SatelliteDetailEdits;
    label: string;
    value: string;
    emphasis?: boolean;
  }> = [
    { key: "name", label: "Satellite Name", value: satName, emphasis: true },
    { key: "originCountry", label: "Origin Country", value: satCountry },
    { key: "launchDate", label: "Launch Date", value: satLaunch },
    { key: "orbitalPosition", label: "Orbital Position", value: satOrbit },
    { key: "totalTransponders", label: "Total Transponders", value: satTransponders },
  ];

  const scanFields: Array<{ key: keyof ScanSummaryEdits; label: string; value: string }> = [
    { key: "polarization", label: "Polarization", value: scanPolarization },
    { key: "scanStartDate", label: "Scan Start Date", value: scanDate },
    { key: "totalScanned", label: "Frequencies Scanned", value: scanTotal },
    { key: "analyzed", label: "Frequencies Analyzed", value: scanAnalyzed },
    { key: "pending", label: "Frequencies Pending", value: scanPending },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[98vw] w-full sm:max-w-7xl h-[96vh] max-h-[96vh] overflow-hidden flex flex-col p-0 gap-0 sm:rounded-lg border-border shadow-2xl">
        <div className="shrink-0 border-b border-border bg-card px-3 py-1.5">
          <DialogHeader className="space-y-0 text-left">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 mono text-[10px] uppercase tracking-wider text-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to satellite list
            </button>
            <DialogTitle className="mono text-sm font-bold uppercase tracking-wide text-foreground flex items-center gap-2 mt-0.5">
              <Satellite className="h-4 w-4 text-primary" />
              {report.satelliteName}
              <span className="text-foreground/50 font-normal">·</span>
              <span className="text-[11px] font-normal text-foreground/70">Intelligence Analysis</span>
            </DialogTitle>
            <p className="mono text-[10px] text-foreground/70 mt-0.5">
              {getUnitIntelName(report.unitId)}
              {!visibilityBlocked && <> · {scanPolarization}</>}
            </p>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
          {visibilityBlocked && (
            <div className="rounded border border-amber-500/45 bg-amber-500/10 px-2 py-1.5" role="status">
              <p className="mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Visibility Constraint — Scan Blocked
              </p>
              <p className="mono text-[10px] text-foreground/85 mt-0.5">{blockedMsg}</p>
              <p className="mono text-[9px] text-foreground/60 mt-0.5">
                Scan summary fields remain editable; beam visibility is sourced from the Visibility Matrix.
              </p>
            </div>
          )}

          <SectionCard
            badge="A"
            color="sky"
            title="Satellite Details"
            icon={<Globe className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
            actions={
              <div className="flex items-center gap-1.5">
                <EditIconButton
                  active={editingSatellite}
                  onClick={toggleSatelliteEdit}
                  ariaLabel="Edit satellite details"
                />
                {hasSatImport && (
                  <button
                    type="button"
                    onClick={handleClearSatelliteImport}
                    className="mono text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadTemplate("satellite")}
                  className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-foreground/60 hover:text-foreground border border-border/50 hover:border-border px-1.5 py-0.5 rounded-sm transition-colors"
                >
                  Template
                </button>
                <SectionImportFileButton onImport={handleImportSatellite} />
              </div>
            }
          >
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2 p-2.5 bg-white">
              {satelliteFields.map((field) => (
                <div key={field.key} className="rounded-sm border border-border/30 bg-white px-2 py-1.5">
                  <dt className="mono text-[9px] uppercase tracking-wider text-foreground/70">{field.label}</dt>
                  {editingSatellite ? (
                    <input
                      value={satelliteDraft[field.key] ?? field.value}
                      onChange={(e) =>
                        setSatelliteDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className={`mt-0.5 mono w-full border border-border/50 rounded-sm px-1.5 py-1 bg-white ${
                        field.emphasis ? "text-[12px] font-bold" : "text-[11px] font-semibold"
                      }`}
                    />
                  ) : (
                    <dd
                      className={`mt-0.5 mono ${
                        field.emphasis ? "text-[12px] font-bold" : "text-[11px] font-semibold"
                      } text-foreground`}
                    >
                      {field.value || <span className="text-foreground/35">—</span>}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </SectionCard>

          <SectionCard
            badge="B"
            color="teal"
            title="Scanning Analysis Summary"
            icon={<Radar className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />}
            actions={
              <div className="flex items-center gap-1.5">
                <EditIconButton
                  active={editingScan}
                  onClick={toggleScanEdit}
                  ariaLabel="Edit scan summary fields"
                />
                {hasScanImport && (
                  <button
                    type="button"
                    onClick={handleClearScanImport}
                    className="mono text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadTemplate("scan")}
                  className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-foreground/60 hover:text-foreground border border-border/50 hover:border-border px-1.5 py-0.5 rounded-sm transition-colors"
                >
                  Template
                </button>
                <SectionImportFileButton onImport={handleImportScan} />
              </div>
            }
          >
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-2.5 py-2 border-b border-border/30 bg-white">
              {scanFields.map((field) => (
                <div
                  key={field.key}
                  className="flex items-baseline gap-1.5 mono rounded-sm border border-border/30 bg-white px-2 py-1"
                >
                  <span className="text-[9px] uppercase tracking-wider text-foreground/70 shrink-0">
                    {field.label}:
                  </span>
                  {editingScan ? (
                    <input
                      value={scanDraft[field.key] ?? field.value}
                      onChange={(e) =>
                        setScanDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="mono min-w-[6rem] text-[11px] font-bold border border-border/50 rounded-sm px-1.5 py-0.5 bg-white"
                    />
                  ) : (
                    <span className="text-[11px] font-bold text-foreground">{field.value || "—"}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 divide-x divide-border/40 bg-white">
              <BeamPanel
                title="Total Beams Available"
                beams={totalBeamsAvailable}
                countOverride={totalBeamCount}
              />
              <BeamPanel
                title={`Beams Visible to ${unitName}`}
                beams={beamsVisibleToUnit}
                highlight
                emptyMessage="No beams visible — no Visibility Matrix entries for this unit and satellite."
                footerAction={
                  visibilityDeepLink ? (
                    <Link
                      to="/visibility"
                      search={visibilityDeepLink}
                      className="inline-flex items-center gap-1 mono text-[9px] text-primary hover:underline"
                      onClick={onClose}
                    >
                      View in Satellite Visibility Matrix <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : undefined
                }
              />
            </div>
          </SectionCard>

          <div>
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">
                C · Detailed Intelligence Analysis
              </span>
              <span className="mono text-[9px] text-foreground/50">
                One summary table · counts plus newly encountered protocols
              </span>
            </div>

            <FrequencyAnalysisTable
              rows={frequencyAnalysisRows}
              editing={editingFrequencyAnalysis}
              onChange={setFrequencyAnalysisDraft}
              onImport={handleImportFrequencyAnalysis}
              importedMode={hasFrequencyAnalysisImport}
              onClearImport={handleClearFrequencyAnalysis}
              onToggleEdit={toggleFrequencyAnalysisEdit}
            />

            <div className="flex items-start gap-1.5 px-1 py-1 mt-2 rounded-sm border border-border/30 bg-secondary/10">
              <Info className="h-3 w-3 text-foreground/40 shrink-0 mt-0.5" />
              <p className="mono text-[9px] text-foreground/55 leading-snug">
                Enter productive and non-productive counts as numbers. List each newly encountered protocol on its own row, or separate multiple protocols with semicolons in the import file.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionImportFileButton({ onImport }: { onImport: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-primary border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded-sm transition-colors"
      >
        <FileInput className="h-2.5 w-2.5" /> Import
      </button>
      <input
        ref={ref}
        type="file"
        accept=".csv,.xlsx,.xls,.ods"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onImport(f);
            e.target.value = "";
          }
        }}
      />
    </>
  );
}

function SectionCard({
  badge,
  color = "sky",
  title,
  icon,
  actions,
  children,
}: {
  badge?: string;
  color?: ColorScheme;
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const c = COLOR[color];
  return (
    <div className={`border border-border rounded-sm overflow-hidden ${c.border}`}>
      <div className={`flex items-center justify-between px-2 py-1.5 border-b border-border gap-2 flex-wrap ${c.header}`}>
        <div className="flex items-center gap-2 min-w-0">
          {badge && (
            <span className={`mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${c.badge}`}>
              {badge}
            </span>
          )}
          {icon}
          <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground truncate">{title}</span>
        </div>
        {actions && <div className="flex items-center gap-1.5 shrink-0 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function BeamPanel({
  title,
  beams,
  highlight,
  footerAction,
  emptyMessage = "None listed.",
  countOverride,
}: {
  title: string;
  beams: string[];
  highlight?: boolean;
  footerAction?: React.ReactNode;
  emptyMessage?: string;
  countOverride?: number;
}) {
  const displayCount = countOverride ?? beams.length;
  return (
    <div className="flex flex-col bg-white">
      <div className="px-2 py-1 border-b border-border/30 bg-teal-500/8 shrink-0 flex items-baseline gap-2">
        <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</span>
        <span className="mono text-[9px] text-foreground/60">({displayCount})</span>
      </div>
      {beams.length === 0 ? (
        <p className="px-2 py-1.5 mono text-[11px] text-foreground bg-white">{emptyMessage}</p>
      ) : (
        <ul className="px-2 py-1.5 space-y-0.5 overflow-y-auto max-h-[100px] bg-white">
          {beams.map((b) => (
            <li key={b} className="mono text-[11px] text-foreground leading-snug flex items-start gap-1 bg-white">
              <span className="text-primary shrink-0">•</span>
              <span className={highlight ? "font-semibold" : ""}>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {footerAction && <div className="px-2 py-1.5 border-t border-border/30 bg-white shrink-0">{footerAction}</div>}
    </div>
  );
}
