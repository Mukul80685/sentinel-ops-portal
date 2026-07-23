import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { Empty } from "@/components/Empty";
import { IntelSatelliteDrillDown } from "@/components/intel/IntelSatelliteDrillDown";
import { listUnits, listIntelRecordsForUnit, listEquipmentForUnit } from "@/lib/queries";
import { Archive, Radio, Satellite, Trash2, FileInput, FileSpreadsheet, Check, SkipForward, ExternalLink, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ccModuleBackLink } from "@/lib/controlCenter";
import {
  buildIntelDrillDownReport,
  buildIntelLinkageContext,
  buildIntelLinkageVisibilityRows,
  buildIntelSatelliteTable,
  buildSyntheticDrillDownReport,
  deriveIntPendingFrequencies,
  enrichDrillDownFromScanSeed,
  formatIntelCompactDate,
  hasIntelData,
  type IntelSatelliteReportRow,
  UNIT_SATELLITE_ROSTER,
} from "@/lib/intelAnalysisData";
import { INT_UNITS } from "@/lib/intelUnits";
import { unitDisplayLabel } from "@/lib/operationalDataset";
import { resolveIntUnitSlug, resolveOperationalUnitId } from "@/lib/operationalSync";
import { ENGAGEMENTS_ALL_KEY, fetchAllEngagements } from "@/lib/engagementEngine";
import { removeOperationalIntelRows } from "@/lib/operationalStore";
import {
  loadImportedRecords,
  saveImportedRecords,
} from "@/lib/intelRepository";
import {
  getReportCellEdits,
  setReportCellEdits,
  removeReportCellEdits,
} from "@/lib/intelCellStore";
import {
  coerceSpreadsheetCell,
  filterFrequencyImportRecords,
  gridToRecords,
  parseIntelSpreadsheet,
} from "@/lib/intelSpreadsheetImport";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_SPREADSHEET_ACCEPT,
  validateImportFile,
  buildCsv,
  downloadCsv,
} from "@/lib/dataTableUtils";
import { useCanEdit } from "@/lib/auth";
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
import { toast } from "sonner";
import {
  loadScanOverrides,
  saveScanOverrides,
  loadSuppressedSatNamesList,
  saveSuppressedSatNames,
  loadSuppressedScanRowKeys,
  saveSuppressedScanRowKeys,
  clearSuppressedScanRowKeys,
  mergeIntelSatelliteTableWithStorage,
  parseIntelImportDate,
  reportIdForOverride,
  scanOverrideToReportRow,
  overrideRowKey,
  scanRowContentKey,
  buildIntelReportId,
  findScanOverrideForReportId,
  buildScanOverrideFromTableRow,
  formatIsoDateForEditInput,
  materializeTableRowsAsScanOverrides,
  legacyReportIdsForScanRow,
  scanRowKey,
  type ScanReportOverride,
} from "@/lib/intelScanStorage";
import { unhideUnitInModule } from "@/lib/moduleUnitRegistry";
import { rebindAndPersistUnitEngagements } from "@/lib/operationalStore";
import { notifyOperationalDerivedRefresh } from "@/lib/operationalRefresh";
import {
  applyIntelScanRowEdit,
  type IntelScanRowDraft,
} from "@/lib/intelScanRowEdit";

// ── Scan report override storage ────────────────────────────────────────────
// Uses shared intelScanStorage helpers (canonical slot-based keys).

const SCAN_IMPORT_HEADERS = [
  "Satellite", "Polarization", "Scanned", "Analyzed", "Pending", "Updated On",
] as const;

const LEGACY_SCAN_IMPORT_HEADERS = [
  "Satellite", "Polarization", "Scanned", "Analyzed", "Pending", "Productivity (%)", "Updated On",
] as const;

const INT_TABLE_GRID =
  "[grid-template-columns:1.5rem_2rem_minmax(0,1.3fr)_repeat(3,minmax(0,0.75fr))_minmax(0,1.1fr)_3.5rem]";

function scanImportRowToOverride(
  row: unknown[],
  updatedOnIndex: number,
  previousByContent: Map<string, ScanReportOverride>,
): ScanReportOverride {
  const totalScanned = Math.max(0, parseInt(String(row[2] ?? "0").replace(/\D/g, ""), 10) || 0);
  const analyzed = Math.max(0, parseInt(String(row[3] ?? "0").replace(/\D/g, ""), 10) || 0);
  const draft: ScanReportOverride = {
    satelliteName: String(row[0] ?? "").trim(),
    polarization: String(row[1] ?? "").trim() || "—",
    totalScanned,
    analyzed,
    pending: deriveIntPendingFrequencies(totalScanned, analyzed),
    productivityScore: null,
    updatedOn: parseIntelImportDate(row[updatedOnIndex]),
  };
  const prev = previousByContent.get(scanRowContentKey(draft));
  return prev?.rowId ? { ...draft, rowId: prev.rowId } : { ...draft, rowId: crypto.randomUUID() };
}

// ── Suppressed satellite rows ────────────────────────────────────────────────

// ── Satellite setup wizard ───────────────────────────────────────────────────

type SetupStatus = "pending" | "done" | "skipped";

interface SetupProgress {
  details: "pending" | "done";
  scan: "pending" | "done";
  productive: SetupStatus;
  nonProductive: SetupStatus;
  novel: SetupStatus;
}

function defaultSetup(): SetupProgress {
  return { details: "pending", scan: "pending", productive: "pending", nonProductive: "pending", novel: "pending" };
}

function setupKey(unitId: string, sat: string) {
  return `intel-setup-${unitId}-${sat.replace(/\s+/g, "-").toLowerCase()}`;
}

function loadSetup(unitId: string, sat: string): SetupProgress {
  try {
    const raw = localStorage.getItem(setupKey(unitId, sat));
    return raw ? (JSON.parse(raw) as SetupProgress) : defaultSetup();
  } catch { return defaultSetup(); }
}

function saveSetup(unitId: string, sat: string, p: SetupProgress) {
  localStorage.setItem(setupKey(unitId, sat), JSON.stringify(p));
}

function isSetupComplete(p: SetupProgress) {
  return (
    p.details === "done" && p.scan === "done" &&
    p.productive !== "pending" && p.nonProductive !== "pending" && p.novel !== "pending"
  );
}

function isAnyDone(p: SetupProgress) {
  return p.details === "done" || p.scan === "done" ||
    p.productive === "done" || p.nonProductive === "done" || p.novel === "done";
}

function downloadSetupTemplate(filename: string, headers: string[], example: string[]) {
  const csv = [headers, example]
    .map((r) => r.map((c) => (c.includes(",") || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\r\n");
  // UTF-8 BOM (\uFEFF) ensures special characters like ° render correctly in Excel and Google Sheets.
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const SETUP_SECTIONS = [
  {
    key: "details" as const,
    label: "Satellite Details",
    skippable: false,
    template: {
      filename: "template-satellite-details.csv",
      headers: ["Satellite Name", "Origin Country", "Launch Date", "Orbital Position", "Total Transponders"],
      example: ["EXAMPLE-SAT-1", "Country Name", "YYYY-MM-DD", "XX.X°E", "32"],
    },
  },
  {
    key: "scan" as const,
    label: "Scan Summary",
    skippable: false,
    template: {
      filename: "template-scan-summary.csv",
      headers: ["Polarization", "Scan Start Date", "Frequencies Scanned", "Frequencies Analyzed", "Frequencies Pending"],
      example: ["V/H", "YYYY-MM-DD", "0", "0", "0"],
    },
  },
  {
    key: "productive" as const,
    label: "Productive Frequencies",
    skippable: true,
    template: {
      filename: "template-productive-frequencies.csv",
      headers: ["Frequency ID", "Output Type", "Details of Interception", "Protocol"],
      example: ["14.500 GHz", "Voice", "Clear audio signal detected on uplink", "TDMA"],
    },
  },
  {
    key: "nonProductive" as const,
    label: "Non-Productive Frequencies",
    skippable: true,
    template: {
      filename: "template-non-productive-frequencies.csv",
      headers: ["Frequency ID", "Level", "Protocol", "Remarks"],
      example: ["12.100 GHz", "3", "OFDM", "Encrypted — unable to decode beyond layer 3"],
    },
  },
  {
    key: "novel" as const,
    label: "Newly Encountered Protocols",
    skippable: true,
    template: {
      filename: "template-novel-protocols.csv",
      headers: ["Frequency", "Protocol", "Remarks"],
      example: ["14.500 GHz", "TDMA-X", "Novel TDMA variant"],
    },
  },
] as const;

// ── SatelliteSetupDialog ─────────────────────────────────────────────────────

function SatelliteSetupDialog({
  open, satelliteName, reportId, override, onClose, onViewAnalysis,
}: {
  open: boolean;
  satelliteName: string;
  reportId: string;
  /** The scan-report override row that seeded this satellite — provides locked fields. */
  override: ScanReportOverride | null;
  onClose: () => void;
  onViewAnalysis: () => void;
}) {
  const [progress, setProgress] = useState<SetupProgress>(() => loadSetup(reportId, satelliteName));
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setProgress(loadSetup(reportId, satelliteName));
  }, [reportId, satelliteName]);

  function persist(next: SetupProgress) {
    setProgress(next);
    saveSetup(reportId, satelliteName, next);
  }

  /**
   * Build the example row for template download, injecting locked fields
   * from the scan-report override so the user sees the correct values.
   */
  function getTemplateExample(sectionKey: keyof SetupProgress): string[] {
    if (sectionKey === "details") {
      return [
        override?.satelliteName ?? satelliteName,
        "Country Name", "YYYY-MM-DD", "XX.X°E", "32",
      ];
    }
    if (sectionKey === "scan") {
      return [
        override?.polarization ?? "V/H",
        "YYYY-MM-DD",                          // Scan Start Date — user fills this
        String(override?.totalScanned ?? 0),
        String(override?.analyzed ?? 0),
        String(override?.pending ?? 0),
      ];
    }
    const sec = SETUP_SECTIONS.find((s) => s.key === sectionKey);
    return sec ? [...sec.template.example] : [];
  }

  async function handleImport(sectionKey: keyof SetupProgress, file: File) {
    const check = validateImportFile(file);
    if (!check.ok) { toast.error(check.error); return; }

    const sec = SETUP_SECTIONS.find((s) => s.key === sectionKey)!;

    // ── Phase 1: read the file (pure I/O — errors here mean the file itself is unreadable) ──
    let grid: unknown[][];
    try {
      grid = await parseIntelSpreadsheet(file);
    } catch {
      toast.error(
        `The file "${file.name}" could not be opened. ` +
        `Please re-save it as a .csv or .xlsx file and try again.`,
      );
      return;
    }

    // ── Phase 2 & 3: validate and save (wrapped so any unexpected error surfaces clearly) ──
    try {
      // 2a. Header row check
      const fileHeaders = (grid[0] ?? []).map((h) => coerceSpreadsheetCell(h));
      const expectedHeaders = [...sec.template.headers];
      for (let i = 0; i < expectedHeaders.length; i++) {
        if (fileHeaders[i] !== expectedHeaders[i]) {
          const got = fileHeaders[i];
          toast.error(
            got
              ? `Column ${i + 1} in your file is labelled "${got}" — it should be "${expectedHeaders[i]}". ` +
                `Please rename that column heading and re-upload, or use the Template button to get a correctly formatted file.`
              : `Column ${i + 1} is missing from your file — it should be "${expectedHeaders[i]}". ` +
                `All ${expectedHeaders.length} columns are required: ${expectedHeaders.join(", ")}. ` +
                `Use the Template button to download the correct layout.`,
          );
          return;
        }
      }

      // 2b. At least one data row
      let objs = gridToRecords(grid, expectedHeaders, {
        validateHeaders: false,
        templateExample: sec.template.example,
      });
      let filteredDropCount = 0;
      if (
        sectionKey === "productive" ||
        sectionKey === "nonProductive" ||
        sectionKey === "novel"
      ) {
        const freqHeader = sectionKey === "novel" ? "Frequency" : "Frequency ID";
        const beforeFilter = objs.length;
        objs = filterFrequencyImportRecords(objs, expectedHeaders, freqHeader);
        filteredDropCount = beforeFilter - objs.length;
      }
      if (objs.length === 0) {
        toast.error(
          filteredDropCount > 0
            ? `No valid frequency rows found — each row needs a ${sectionKey === "novel" ? "Frequency" : "Frequency ID"} plus at least one other column filled. Band labels (e.g. C-band) alone are not imported.`
            : `Your file has a header row but no data. ` +
              `Remove the template example row and add at least one row of real data below the column headings.`,
        );
        return;
      }

      const edits = getReportCellEdits(reportId);

      // ── Phase 3: section-specific field validation ────────────────────────

      if (sectionKey === "details") {
        const row = objs[0];
        const launchDateRaw = (row["Launch Date"] ?? "").trim();

        if (launchDateRaw) {
          const parsed = new Date(launchDateRaw);
          if (isNaN(parsed.getTime())) {
            toast.error(
              `"Launch Date" contains "${launchDateRaw}" which is not a recognised date. ` +
              `Please enter the date as YYYY-MM-DD (e.g. 2019-04-30) and re-upload.`,
            );
            return;
          }
        }

        edits.satellite = {
          name:              override?.satelliteName ?? satelliteName,
          originCountry:     (row["Origin Country"]     ?? "").trim(),
          launchDate:        launchDateRaw,
          orbitalPosition:   (row["Orbital Position"]   ?? "").trim(),
          totalTransponders: (row["Total Transponders"] ?? "").trim(),
        };

      } else if (sectionKey === "scan") {
        const row = objs[0];
        const scanStartDateRaw = (row["Scan Start Date"] ?? "").trim();

        if (!scanStartDateRaw) {
          toast.error(
            `"Scan Start Date" is blank. ` +
            `Fill in the date when scanning began (format: YYYY-MM-DD) and re-upload.`,
          );
          return;
        }

        const scanParsed = new Date(scanStartDateRaw);
        if (isNaN(scanParsed.getTime())) {
          toast.error(
            `"Scan Start Date" contains "${scanStartDateRaw}" which is not a recognised date. ` +
            `Please enter the date as YYYY-MM-DD (e.g. 2024-08-15) and re-upload.`,
          );
          return;
        }

        const launchDateRaw = edits.satellite.launchDate?.trim();
        if (launchDateRaw) {
          const launchParsed = new Date(launchDateRaw);
          if (!isNaN(launchParsed.getTime()) && scanParsed < launchParsed) {
            toast.error(
              `"Scan Start Date" (${scanStartDateRaw}) is earlier than the satellite's "Launch Date" (${launchDateRaw}). ` +
              `A scan cannot start before the satellite was launched — please correct the "Scan Start Date" and re-upload.`,
            );
            return;
          }
        }

        edits.scan = {
          polarization:  override?.polarization ?? (row["Polarization"] ?? ""),
          scanStartDate: scanStartDateRaw,
          totalScanned:  String(override?.totalScanned ?? (row["Frequencies Scanned"] ?? "0")),
          analyzed:      String(override?.analyzed     ?? (row["Frequencies Analyzed"] ?? "0")),
          pending:       String(override?.pending      ?? (row["Frequencies Pending"]  ?? "0")),
        };

      } else if (sectionKey === "productive") {
        edits.productive = {
          importedMode: true, cells: {},
          extra: objs.map((r, i) => ({
            id: `imp-prod-${i}`,
            frequencyId: r["Frequency ID"]           ?? "",
            outputType:  r["Output Type"]             ?? "",
            details:     r["Details of Interception"] ?? "",
            protocol:    r["Protocol"]                ?? "",
          })),
        };

      } else if (sectionKey === "nonProductive") {
        edits.nonProductive = {
          importedMode: true, cells: {},
          extra: objs.map((r, i) => ({
            id: `imp-np-${i}`,
            frequencyId: r["Frequency ID"] ?? "",
            level:       r["Level"]        ?? "",
            protocol:    r["Protocol"]     ?? "",
            remarks:     r["Remarks"]      ?? "",
          })),
        };

      } else if (sectionKey === "novel") {
        edits.novel = {
          importedMode: true, cells: {},
          extra: objs.map((r, i) => ({
            id: `imp-nov-${i}`,
            frequency: r["Frequency"] ?? "",
            protocol:  r["Protocol"]  ?? "",
            remarks:   r["Remarks"]   ?? "",
          })),
        };
      }

      const saved = setReportCellEdits(reportId, edits);
      if (!saved) {
        toast.error("Could not save imported data — storage may be full");
        return;
      }
      persist({ ...progress, [sectionKey]: "done" });
      toast.success(
        `${sec.label} imported — ${objs.length} row${objs.length !== 1 ? "s" : ""} saved` +
          (filteredDropCount > 0
            ? ` (${filteredDropCount} invalid row${filteredDropCount !== 1 ? "s" : ""} skipped)`
            : ""),
      );
    } catch (err) {
      // Catch unexpected errors and surface them as actionable messages
      const detail = err instanceof Error ? err.message : String(err);
      toast.error(
        `Something went wrong while processing "${file.name}". ` +
        `Please check the file is not open in another application and matches the template format. ` +
        `(Detail: ${detail})`,
      );
    }
  }

  function handleSkip(sectionKey: "productive" | "nonProductive" | "novel") {
    persist({ ...progress, [sectionKey]: "skipped" });
  }

  const complete = isSetupComplete(progress);
  const anyDone  = isAnyDone(progress);

  // Compact lock-hint shown below section label for sections with auto-filled fields
  function LockHint({ sectionKey }: { sectionKey: keyof SetupProgress }) {
    if (!override) return null;
    if (sectionKey === "details") {
      return (
        <span className="mono text-[9px] text-amber-600/80">
          Satellite Name locked: {override.satelliteName}
        </span>
      );
    }
    if (sectionKey === "scan") {
      return (
        <span className="mono text-[9px] text-amber-600/80">
          Polarization · Scanned · Analysed · Pending locked from scan report
        </span>
      );
    }
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="mono text-[13px] uppercase tracking-wider flex items-center gap-2">
            <Satellite className="h-4 w-4 text-primary" />
            Satellite Setup — {satelliteName}
          </DialogTitle>
        </DialogHeader>

        <p className="mono text-[10px] text-muted-foreground -mt-2">
          Import data for each section. Fields marked as locked are taken from the scan report and cannot be overridden here.
          Sections 3–5 can be skipped if not applicable.
        </p>

        <div className="space-y-1 mt-1">
          {SETUP_SECTIONS.map((sec, idx) => {
            const status = progress[sec.key];
            return (
              <div
                key={sec.key}
                className={`flex items-start gap-2 px-3 py-2 rounded-md border transition-colors ${
                  status === "done"    ? "border-emerald-500/30 bg-emerald-500/5"
                  : status === "skipped" ? "border-border/40 bg-secondary/20 opacity-60"
                  : "border-border bg-card"
                }`}
              >
                {/* Status circle */}
                <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                  status === "done"    ? "bg-emerald-500 text-white"
                  : status === "skipped" ? "bg-muted text-muted-foreground"
                  : "border-2 border-border"
                }`}>
                  {status === "done"    && <Check       className="h-3 w-3" />}
                  {status === "skipped" && <SkipForward className="h-2.5 w-2.5" />}
                  {status === "pending" && <span className="mono text-[9px] text-muted-foreground">{idx + 1}</span>}
                </div>

                {/* Label + lock hint */}
                <div className="flex-1 min-w-0">
                  <span className="mono text-[11px] font-medium">{sec.label}</span>
                  {status === "pending" && <div><LockHint sectionKey={sec.key} /></div>}
                </div>

                {/* Action buttons */}
                {status !== "done" && status !== "skipped" ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const sec_ = SETUP_SECTIONS.find((s) => s.key === sec.key)!;
                        downloadSetupTemplate(
                          sec_.template.filename,
                          [...sec_.template.headers],
                          getTemplateExample(sec.key),
                        );
                      }}
                      className="mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground border border-border/50 px-1.5 py-0.5 rounded-sm transition-colors"
                    >
                      Template
                    </button>

                    <input
                      ref={(el) => { fileRefs.current[idx] = el; }}
                      type="file"
                      accept={ACCEPTED_SPREADSHEET_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImport(sec.key, f).catch((e) => toast.error(`Import failed: ${e instanceof Error ? e.message : "unknown error"}`));
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRefs.current[idx]?.click()}
                      className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-primary border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded-sm transition-colors"
                    >
                      <FileInput className="h-2.5 w-2.5" /> Import
                    </button>

                    {sec.skippable && (
                      <button
                        type="button"
                        onClick={() => handleSkip(sec.key as "productive" | "nonProductive" | "novel")}
                        className="mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground border border-border/50 px-1.5 py-0.5 rounded-sm transition-colors"
                      >
                        Skip
                      </button>
                    )}
                  </div>
                ) : (
                  <span className={`mono text-[9px] uppercase shrink-0 ${status === "done" ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {status === "done" ? "Imported" : "Skipped"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {complete && (
          <p className="mono text-[10px] text-emerald-600 text-center mt-1">
            ✓ All sections complete — analysis page is ready
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="ghost" size="sm" className="mono text-[11px]" onClick={onClose}>
            Close
          </Button>
          {anyDone && (
            <Button size="sm" className="mono text-[11px] gap-1.5" onClick={onViewAnalysis}>
              <ExternalLink className="h-3.5 w-3.5" /> View Analysis
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_authenticated/intel/$unitId")({
  validateSearch: (search: Record<string, unknown>) => ({
    satellite: typeof search.satellite === "string" ? search.satellite : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
  }),
  component: IntelUnitView,
});

type IntelMapViewRow = {
  reportId: string;
  satelliteName: string;
  totalScanned: number;
  analyzed: number;
  pending: number;
  reportTimestamp: string | null;
};

function ScanBarValueLabel({
  x,
  y,
  width,
  value,
}: {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
}) {
  if (x == null || y == null || width == null || value == null) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill="#000000"
      textAnchor="middle"
      fontSize={13}
      fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    >
      {value}
    </text>
  );
}

function IntelUnitMapCard({ row }: { row: IntelMapViewRow }) {
  const pending = deriveIntPendingFrequencies(row.totalScanned, row.analyzed);
  const barData = [
    { name: "Scanned", value: row.totalScanned },
    { name: "Analysed", value: row.analyzed },
    { name: "Pending", value: pending },
  ];
  const dateLabel = row.reportTimestamp ? formatIntelCompactDate(row.reportTimestamp) : "—";
  const gradientId = row.reportId.replace(/[^a-zA-Z0-9_-]/g, "-");

  return (
    <div className="rounded-lg border border-gray-200 bg-white transition hover:brightness-110">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2.5">
        <h3 className="font-bold text-[17px] leading-tight text-[#000000]">{row.satelliteName}</h3>
        <p className="shrink-0 text-[13px] text-[#1B2A3A]/70">{dateLabel}</p>
      </div>

      <div className="h-[190px] w-full px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 24, right: 12, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id={`gradientScanned-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#93c5fd" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id={`gradientAnalysed-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#86efac" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <linearGradient id={`gradientPending-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fcd34d" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              interval={0}
              tick={{ fill: "#1B2A3A", fontSize: 12 }}
              axisLine={{ stroke: "#d1d5db" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "#1B2A3A", fontSize: 12 }}
              axisLine={{ stroke: "#d1d5db" }}
              tickLine={false}
              width={36}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={72}>
              {barData.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={
                    index === 0
                      ? `url(#gradientScanned-${gradientId})`
                      : index === 1
                        ? `url(#gradientAnalysed-${gradientId})`
                        : `url(#gradientPending-${gradientId})`
                  }
                />
              ))}
              <LabelList dataKey="value" content={ScanBarValueLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function IntelUnitMapView({ rows }: { rows: IntelMapViewRow[] }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 overflow-y-auto p-4">
      {rows.map((row) => (
        <IntelUnitMapCard key={row.reportId} row={row} />
      ))}
    </div>
  );
}

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
  const { satellite: searchSatellite, from } = Route.useSearch();
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const intelBackLink =
    from === "map" ? { to: "/" as const, search: {} } : ccModuleBackLink("intel");
  const fromMap = from === "map";
  const moduleTitle = fromMap ? "Active Satellite Monitoring" : "Intelligence Repository";
  const allowEdit = canEdit && !fromMap;
  const moduleIcon = fromMap ? Radio : Archive;
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingTargetReportId, setEditingTargetReportId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<IntelScanRowDraft | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [scanOverrides, setScanOverrides] = useState<ScanReportOverride[]>([]);
  const [suppressedSatNames, setSuppressedSatNames] = useState<Set<string>>(new Set());
  const [suppressedRowKeys, setSuppressedRowKeys] = useState<Set<string>>(new Set());
  const [pendingNewRow, setPendingNewRow] = useState<IntelSatelliteReportRow | null>(null);
  // Keep a ref so the navigate-back effect always reads the latest overrides without
  // triggering unnecessary re-runs.
  const scanOverridesRef = useRef(scanOverrides);
  useEffect(() => { scanOverridesRef.current = scanOverrides; }, [scanOverrides]);
  /** Stable override row identity for in-progress edits before first persist. */
  const pendingEditOverrideRef = useRef<{ reportId: string; override: ScanReportOverride } | null>(null);
  const prevReportIdRef = useRef<string | null>(null);
  // Setup wizard: holds the satellite name when the user clicks an imported (non-roster) satellite
  const [setupSatellite, setSetupSatellite] = useState<{ name: string; reportId: string } | null>(null);

  const { data: dbUnits = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const unit = useMemo(() => {
    const db = dbUnits.find((u) => u.id === unitId || u.id === `op-unit-${unitId}`);
    if (db) return { id: db.id, code: db.code, name: db.name, location: db.description ?? "—" };
    const local = INT_UNITS.find((u) => u.id === unitId);
    if (local) return local;
    return null;
  }, [unitId, dbUnits]);

  const intUnitSlug = useMemo(() => {
    if (INT_UNITS.some((u) => u.id === unitId)) return unitId;
    const fromDb = dbUnits.find((u) => u.id === unitId);
    return resolveIntUnitSlug(unitId, fromDb?.code) ?? unitId;
  }, [unitId, dbUnits]);

  const dbUnitId = useMemo(
    () => resolveOperationalUnitId(intUnitSlug, dbUnits),
    [intUnitSlug, dbUnits],
  );

  const dataAvailable = hasIntelData(intUnitSlug, dbUnitId);

  useEffect(() => {
    setScanOverrides(loadScanOverrides(intUnitSlug, unit?.code));
    setSuppressedSatNames(
      new Set(loadSuppressedSatNamesList(intUnitSlug, unit?.code).map((n) => n.toLowerCase())),
    );
    setSuppressedRowKeys(loadSuppressedScanRowKeys(intUnitSlug, unit?.code));
  }, [intUnitSlug, unit?.code]);

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

  const visibilityRows = useMemo(
    () => buildIntelLinkageVisibilityRows(intUnitSlug, dbUnitId, unitEngagements),
    [intUnitSlug, dbUnitId, unitEngagements],
  );

  const { data: equipment = [], isLoading: eqLoading } = useQuery({
    queryKey: ["unit-equipment-intel", dbUnitId],
    queryFn: () => listEquipmentForUnit(dbUnitId),
    enabled: dataAvailable && !!dbUnitId,
    staleTime: 30_000,
  });

  const { data: intelRows = [] } = useQuery({
    queryKey: ["intel-eng", dbUnitId],
    queryFn: () => listIntelRecordsForUnit(dbUnitId),
    enabled: dataAvailable && !!dbUnitId,
    staleTime: 30_000,
  });

  const linkageCtx = useMemo(
    () => buildIntelLinkageContext(intUnitSlug, unitEngagements, visibilityRows, equipment, intelRows),
    [intUnitSlug, unitEngagements, visibilityRows, equipment, intelRows],
  );

  const tableRows = useMemo(
    () => (dataAvailable && unit ? buildIntelSatelliteTable(intUnitSlug, linkageCtx, unitEngagements) : []),
    [dataAvailable, unit, intUnitSlug, linkageCtx, unitEngagements],
  );

  const mergedTableRows = useMemo(() => {
    const ovNameSet = new Set(scanOverrides.map((o) => o.satelliteName.toLowerCase()));
    const filtered = mergeIntelSatelliteTableWithStorage(intUnitSlug, tableRows, unit?.code);

    return filtered.map((row) => ({
      ...row,
      isZeroImported:
        ovNameSet.has(row.satelliteName.toLowerCase()) &&
        row.totalScanned === 0 &&
        row.analyzed === 0 &&
        row.pending === 0,
    }));
  }, [tableRows, scanOverrides, intUnitSlug, unit?.code, suppressedSatNames, suppressedRowKeys]);

  const visibleTableRows = useMemo(() => {
    if (!pendingNewRow) return mergedTableRows;
    if (mergedTableRows.some((row) => row.reportId === pendingNewRow.reportId)) return mergedTableRows;
    return [pendingNewRow, ...mergedTableRows];
  }, [mergedTableRows, pendingNewRow]);

  const mapViewRows = useMemo(
    () =>
      mergedTableRows
        .filter(
          (row) => !(row.totalScanned === 0 && row.analyzed === 0 && row.pending === 0),
        )
        .map((row) => {
          const pending = deriveIntPendingFrequencies(row.totalScanned, row.analyzed);
          return {
            reportId: row.reportId,
            satelliteName: row.satelliteName,
            totalScanned: row.totalScanned,
            analyzed: row.analyzed,
            pending,
            reportTimestamp: row.reportTimestamp,
          };
        }),
    [mergedTableRows],
  );

  const drillDown = useMemo(() => {
    if (!selectedReportId || !unit) return null;
    const selectedRow = mergedTableRows.find((r) => r.reportId === selectedReportId);
    const scanSeed = selectedRow
      ? {
          polarization: selectedRow.polarization,
          totalScanned: selectedRow.totalScanned,
          analyzed: selectedRow.analyzed,
          pending: selectedRow.pending,
          updatedOn: selectedRow.reportTimestamp ?? undefined,
        }
      : undefined;

    const built = buildIntelDrillDownReport(intUnitSlug, selectedReportId, linkageCtx, unitEngagements);
    if (built) {
      const enriched = enrichDrillDownFromScanSeed(built, scanSeed);
      return enriched.reportId === selectedReportId
        ? enriched
        : { ...enriched, reportId: selectedReportId };
    }

    return selectedRow
      ? buildSyntheticDrillDownReport(
          selectedRow.satelliteName,
          intUnitSlug,
          linkageCtx,
          scanSeed,
          selectedReportId,
        )
      : null;
  }, [selectedReportId, unit, intUnitSlug, linkageCtx, unitEngagements, mergedTableRows]);

  const isLoading = dataAvailable && (engLoading || eqLoading);

  useEffect(() => {
    if (!searchSatellite || !dataAvailable || mergedTableRows.length === 0) return;
    const target = searchSatellite.trim().toLowerCase();
    const match = mergedTableRows.find((r) => r.satelliteName.trim().toLowerCase() === target);
    if (match) setSelectedReportId(match.reportId);
  }, [searchSatellite, mergedTableRows, dataAvailable]);

  // When the user navigates back from the drill-down page, check whether all frequency
  // data for that satellite was cleared from within.  If every table is empty and at
  // least one was previously in imported-mode, zero out the outer scan-report row so it
  // shows the re-upload prompt instead of stale non-zero counts.
  useEffect(() => {
    const prev = prevReportIdRef.current;
    prevReportIdRef.current = selectedReportId;
    if (prev === null || selectedReportId !== null) return;

    const edits = getReportCellEdits(prev);
    const wasEverImported =
      edits.productive.importedMode ||
      edits.nonProductive.importedMode ||
      edits.novel.importedMode;
    const allEmpty =
      edits.productive.extra.length === 0 &&
      edits.nonProductive.extra.length === 0 &&
      edits.novel.extra.length === 0;

    if (wasEverImported && allEmpty) {
      const currentOverrides = scanOverridesRef.current;
      const match = currentOverrides.find(
        (o) => reportIdForOverride(intUnitSlug, o) === prev,
      );
      if (match) {
        const rowId = overrideRowKey(match);
        const updated = currentOverrides.map((o) =>
          overrideRowKey(o) === rowId
            ? { ...o, totalScanned: 0, analyzed: 0, pending: 0, productivityScore: null }
            : o,
        );
        saveScanOverrides(intUnitSlug, updated, unit?.code);
        setScanOverrides(updated);
      }
    }
  }, [selectedReportId, intUnitSlug, unitId]);

  function downloadImportTemplate() {
    const example = ["EXAMPLE-SAT-1", "V/H", "450", "320", "130", "2024-01-15"];
    const csv = buildCsv([...SCAN_IMPORT_HEADERS], [example]);
    downloadCsv("scan-report-template.csv", csv);
    toast.info("Template downloaded — columns match the Satellite Scan Reports table exactly");
  }

  function resolveImportHeaders(fileHeaders: string[]) {
    const normalized = fileHeaders.map((header) => header.trim());
    if (SCAN_IMPORT_HEADERS.every((header, index) => normalized[index] === header)) {
      return { ok: true as const, updatedOnIndex: 5 };
    }
    if (LEGACY_SCAN_IMPORT_HEADERS.every((header, index) => normalized[index] === header)) {
      return { ok: true as const, updatedOnIndex: 6 };
    }
    return { ok: false as const };
  }

  async function handleImportFile(file: File) {
    const check = validateImportFile(file);
    if (!check.ok) return toast.error(check.error);
    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true }) as unknown[][];

      if (!rows.length) return toast.error("File is empty");

      const fileHeaders = (rows[0] ?? []).map((h) => String(h ?? "").trim());
      const headerMatch = resolveImportHeaders(fileHeaders);
      if (!headerMatch.ok) {
        toast.error(
          `Wrong format — required columns: ${SCAN_IMPORT_HEADERS.join(", ")}` +
            ` (legacy files with Productivity (%) are also accepted).`,
        );
        return;
      }

      const dataRows = rows.slice(1).filter((r) => String((r as unknown[])[0] ?? "").trim());
      if (dataRows.length === 0) return toast.error("No data rows found — add at least one satellite row below the header");

      const previous = loadScanOverrides(intUnitSlug, unit?.code);
      const previousByContent = new Map(previous.map((o) => [scanRowContentKey(o), o]));

      const overrides: ScanReportOverride[] = (dataRows as unknown[][]).map((row) =>
        scanImportRowToOverride(row, headerMatch.updatedOnIndex, previousByContent),
      );

      const deduped = new Map<string, ScanReportOverride>();
      for (const row of overrides) {
        deduped.set(scanRowContentKey(row), row);
      }
      const nextOverrides = [...deduped.values()];

      for (const old of previous) {
        if (nextOverrides.some((row) => row.rowId && row.rowId === old.rowId)) continue;
        const reportId = reportIdForOverride(intUnitSlug, old);
        removeReportCellEdits(reportId);
        localStorage.removeItem(setupKey(reportId, old.satelliteName));
        const legacyId = buildIntelReportId(intUnitSlug, old.satelliteName, "—");
        if (legacyId !== reportId) {
          removeReportCellEdits(legacyId);
          localStorage.removeItem(setupKey(legacyId, old.satelliteName));
        }
      }

      saveScanOverrides(intUnitSlug, nextOverrides, unit?.code);
      saveImportedRecords(intUnitSlug, []);
      clearSuppressedScanRowKeys(intUnitSlug, unit?.code);
      setScanOverrides(nextOverrides);
      setSuppressedRowKeys(new Set());

      const importedNames = new Set(nextOverrides.map((o) => o.satelliteName.toLowerCase()));
      const roster = UNIT_SATELLITE_ROSTER[intUnitSlug] ?? [];
      const rosterToHide = roster
        .map((name) => name.toLowerCase())
        .filter((name) => !importedNames.has(name));
      const newSuppressed = new Set(rosterToHide);
      saveSuppressedSatNames(intUnitSlug, [...newSuppressed], unit?.code);
      setSuppressedSatNames(newSuppressed);

      setPendingNewRow(null);
      cancelRowEdit();
      unhideUnitInModule(dbUnitId, "intel");
      rebindAndPersistUnitEngagements(dbUnitId);
      notifyOperationalDerivedRefresh();
      void qc.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
      void qc.invalidateQueries({ queryKey: ["units"] });
      toast.success(`Imported ${nextOverrides.length} scan report row${nextOverrides.length !== 1 ? "s" : ""} — previous scan data replaced.`);
    } catch {
      toast.error("Failed to parse file — ensure it matches the downloaded template");
    }
  }

  function deleteIntelForReportRows(
    rows: { reportId: string; satelliteName: string; polarization: string }[],
  ) {
    const deleteRowKeys = new Set(
      rows.map((row) => scanRowKey(row.satelliteName, row.polarization).toLowerCase()),
    );
    const deleteReportIds = new Set(rows.map((row) => row.reportId));

    const storedOverrides = loadScanOverrides(intUnitSlug, unit?.code);
    const remainingOverrides = storedOverrides.filter((override) => {
      const rowKey = scanRowKey(override.satelliteName, override.polarization).toLowerCase();
      if (deleteRowKeys.has(rowKey)) return false;
      return !deleteReportIds.has(reportIdForOverride(intUnitSlug, override));
    });

    saveScanOverrides(intUnitSlug, remainingOverrides, unit?.code);
    setScanOverrides(remainingOverrides);

    const remainingImports = loadImportedRecords(intUnitSlug).filter(
      (record) => !deleteRowKeys.has(scanRowKey(record.satellite, record.polarization ?? "—").toLowerCase()),
    );
    saveImportedRecords(intUnitSlug, remainingImports);

    const nextSuppressedRowKeys = new Set(loadSuppressedScanRowKeys(intUnitSlug, unit?.code));
    for (const key of deleteRowKeys) nextSuppressedRowKeys.add(key);
    saveSuppressedScanRowKeys(intUnitSlug, [...nextSuppressedRowKeys], unit?.code);
    setSuppressedRowKeys(nextSuppressedRowKeys);

    for (const row of rows) {
      const legacyIds = legacyReportIdsForScanRow(intUnitSlug, row.satelliteName, row.polarization);
      for (const reportId of new Set([row.reportId, ...legacyIds])) {
        localStorage.removeItem(setupKey(reportId, row.satelliteName));
        removeReportCellEdits(reportId);
      }
    }

    const namesStillVisible = new Set(
      mergedTableRows
        .filter((entry) => !deleteReportIds.has(entry.reportId))
        .map((entry) => entry.satelliteName.toLowerCase()),
    );
    const namesToSuppress = rows
      .map((row) => row.satelliteName.toLowerCase())
      .filter((name) => !namesStillVisible.has(name));
    if (namesToSuppress.length > 0) {
      const newSuppressed = new Set([...suppressedSatNames, ...namesToSuppress]);
      saveSuppressedSatNames(intUnitSlug, [...newSuppressed], unit?.code);
      setSuppressedSatNames(newSuppressed);
    }

    if (pendingNewRow && deleteReportIds.has(pendingNewRow.reportId)) {
      setPendingNewRow(null);
      cancelRowEdit();
    }

    const namesFullyRemoved = new Set(namesToSuppress);
    const opIds = (intelRows as any[])
      .filter((record) => namesFullyRemoved.has((record.satellites?.name ?? "").toLowerCase()))
      .map((record) => record.id)
      .filter((id: string) => id.startsWith("op-intel-"));
    if (opIds.length > 0) removeOperationalIntelRows(opIds);

    notifyOperationalDerivedRefresh();
    void qc.invalidateQueries({ queryKey: ["intel-eng", dbUnitId] });
    void qc.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
  }

  function startAddSatellite() {
    if (editingRowKey) return;
    const override: ScanReportOverride = {
      rowId: crypto.randomUUID(),
      satelliteName: "",
      polarization: "—",
      totalScanned: 0,
      analyzed: 0,
      pending: 0,
      productivityScore: null,
      updatedOn: new Date().toISOString().slice(0, 10),
    };
    const reportId = reportIdForOverride(intUnitSlug, override);
    const draftRow = scanOverrideToReportRow(intUnitSlug, override);
    pendingEditOverrideRef.current = { reportId, override };
    setPendingNewRow(draftRow);
    setEditingRowKey(override.rowId!);
    setEditingTargetReportId(reportId);
    setEditDraft({
      satelliteName: "",
      polarization: "",
      totalScanned: "0",
      analyzed: "0",
      pending: "0",
      productivity: "",
      updatedOn: override.updatedOn,
    });
  }

  function confirmDeleteSingle() {
    if (!deleteTargetId) return;
    const row = visibleTableRows.find((r) => r.reportId === deleteTargetId);
    if (!row) return;
    deleteIntelForReportRows([
      { reportId: row.reportId, satelliteName: row.satelliteName, polarization: row.polarization },
    ]);
    toast.success("Intel records cleared for satellite.");
    setDeleteTargetId(null);
    setSelectedIds((s) => { const n = new Set(s); n.delete(deleteTargetId); return n; });
  }

  function confirmBulkDelete() {
    const targets = visibleTableRows
      .filter((r) => selectedIds.has(r.reportId))
      .map((r) => ({
        reportId: r.reportId,
        satelliteName: r.satelliteName,
        polarization: r.polarization,
      }));
    deleteIntelForReportRows(targets);
    toast.success(`${targets.length} satellite intel record${targets.length !== 1 ? "s" : ""} cleared.`);
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
  }

  const deleteTargetRow = visibleTableRows.find((r) => r.reportId === deleteTargetId) ?? null;
  const visibleIds = visibleTableRows.map((r) => r.reportId);
  const selectAll = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function handleSelectAll() {
    setSelectedIds(selectAll ? new Set() : new Set(visibleIds));
  }

  function startRowEdit(row: (typeof mergedTableRows)[number]) {
    const storedOverrides = loadScanOverrides(intUnitSlug, unit?.code);
    let existingOverride = findScanOverrideForReportId(intUnitSlug, storedOverrides, row.reportId);
    if (!existingOverride) {
      existingOverride = buildScanOverrideFromTableRow(row);
      pendingEditOverrideRef.current = { reportId: row.reportId, override: existingOverride };
    } else {
      pendingEditOverrideRef.current = null;
    }
    setEditingRowKey(overrideRowKey(existingOverride));
    setEditingTargetReportId(row.reportId);
    setEditDraft({
      satelliteName: row.satelliteName,
      polarization: row.polarization,
      totalScanned: String(row.totalScanned),
      analyzed: String(row.analyzed),
      pending: String(row.pending),
      productivity: row.productivityScore === null ? "" : String(row.productivityScore),
      updatedOn: formatIsoDateForEditInput(row.reportTimestamp),
    });
  }

  function cancelRowEdit() {
    pendingEditOverrideRef.current = null;
    setPendingNewRow(null);
    setEditingRowKey(null);
    setEditingTargetReportId(null);
    setEditDraft(null);
  }

  function confirmRowEdit() {
    if (!editingRowKey || !editingTargetReportId || !editDraft) return;
    const row =
      visibleTableRows.find((entry) => entry.reportId === editingTargetReportId) ??
      mergedTableRows.find((entry) => entry.reportId === editingTargetReportId);
    if (!row) return;

    const storedOverrides = loadScanOverrides(intUnitSlug, unit?.code);
    const pinnedByReportId: Record<string, ScanReportOverride> = {};
    const pending = pendingEditOverrideRef.current;
    if (pending && pending.reportId === editingTargetReportId) {
      pinnedByReportId[pending.reportId] = pending.override;
    }

    const rowsForMaterialize = [row];

    const workingOverrides = materializeTableRowsAsScanOverrides(
      intUnitSlug,
      rowsForMaterialize,
      storedOverrides,
      pinnedByReportId,
    );

    let editingOverride =
      workingOverrides.find((o) => overrideRowKey(o) === editingRowKey) ??
      findScanOverrideForReportId(intUnitSlug, workingOverrides, editingTargetReportId) ??
      (pending?.reportId === editingTargetReportId ? pending.override : undefined);

    if (!editingOverride?.rowId) {
      toast.error("Could not locate the scan row to update.");
      return;
    }

    const previousRowKey = overrideRowKey(editingOverride);

    const result = applyIntelScanRowEdit({
      intUnitSlug,
      unitCode: unit?.code,
      dbUnitId,
      previousRowId: previousRowKey,
      previousSatelliteName: editingOverride.satelliteName,
      previousPolarization: editingOverride.polarization,
      draft: editDraft,
      existingOverrides: workingOverrides,
      otherOverrides: workingOverrides.filter((o) => overrideRowKey(o) !== previousRowKey),
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const updatedOverride = result.overrides.find((o) => o.rowId === editingOverride!.rowId);
    const newReportId = updatedOverride
      ? reportIdForOverride(intUnitSlug, updatedOverride)
      : row.reportId;
    const reportIdChanged = row.reportId !== newReportId;

    if (updatedOverride) {
      const rowKey = scanRowKey(updatedOverride.satelliteName, updatedOverride.polarization).toLowerCase();
      const nextSuppressedRowKeys = new Set(loadSuppressedScanRowKeys(intUnitSlug, unit?.code));
      nextSuppressedRowKeys.delete(rowKey);
      saveSuppressedScanRowKeys(intUnitSlug, [...nextSuppressedRowKeys], unit?.code);
      setSuppressedRowKeys(nextSuppressedRowKeys);

      const nextSuppressedNames = new Set(suppressedSatNames);
      nextSuppressedNames.delete(updatedOverride.satelliteName.toLowerCase());
      saveSuppressedSatNames(intUnitSlug, [...nextSuppressedNames], unit?.code);
      setSuppressedSatNames(nextSuppressedNames);
    }

    pendingEditOverrideRef.current = null;
    setPendingNewRow(null);
    setScanOverrides(result.overrides);
    if (selectedReportId === editingTargetReportId && reportIdChanged) {
      setSelectedReportId(newReportId);
    }
    setEditingRowKey(null);
    setEditingTargetReportId(null);
    setEditDraft(null);
    unhideUnitInModule(dbUnitId, "intel");
    rebindAndPersistUnitEngagements(dbUnitId);
    notifyOperationalDerivedRefresh();
    void qc.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
    void qc.invalidateQueries({ queryKey: ["intel-eng", dbUnitId] });
    toast.success("Scan report row updated.");
  }

  function patchEditDraft(patch: Partial<IntelScanRowDraft>) {
    setEditDraft((d) => (d ? { ...d, ...patch } : d));
  }

  if (!unit) {
    return (
      <AppShell
        title={moduleTitle}
        showBack
        backLink={intelBackLink}
        hideHome={fromMap}
        headerIcon={<HomeNavIconBadge icon={moduleIcon} theme="intel" size="md" />}
        horizontalNav={null}
      >
        <Empty title="Unit not found" hint="Return to the repository home and select a valid unit." />
      </AppShell>
    );
  }

  const unitLabel = unit ? unitDisplayLabel(unit) : "Unit";

  // DECISION: Treat cleared units like new units — show upload onboarding whenever no rows remain.
  const showScanUploadOnboarding =
    !isLoading && scanOverrides.length === 0 && mergedTableRows.length === 0 && !pendingNewRow;

  return (
    <AppShell
      title={moduleTitle}
      pageTitle={`Satellite Scan Reports — ${unitLabel}`}
      showBack
      backLink={intelBackLink}
      hideHome={fromMap}
      headerIcon={<HomeNavIconBadge icon={moduleIcon} theme="intel" size="md" />}
      horizontalNav={null}
    >
      <div className={`flex flex-col min-h-0 gap-1 ${fromMap ? "h-full overflow-hidden" : "h-[calc(100vh-6.5rem)]"}`}>
        {(dataAvailable || scanOverrides.length > 0) && (
          <div className="shrink-0 flex items-center justify-end">
            <span className="mono text-[10px] text-foreground/80">
              {mergedTableRows.length} satellite report{mergedTableRows.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {selectedIds.size > 0 && allowEdit && (
          <div className="px-3 py-2 rounded-md border border-border bg-primary/5 flex items-center gap-3 mono text-[11px] shrink-0">
            <span className="text-primary font-bold">
              {selectedIds.size} report{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Delete Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Single shared import input — used by both the onboarding screen and the table toolbar */}
        <input
          ref={importFileRef}
          type="file"
          accept={ACCEPTED_SPREADSHEET_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { void handleImportFile(f); e.target.value = ""; }
          }}
        />

        {showScanUploadOnboarding && fromMap ? (
          <Empty
            title="No satellite reports"
            hint={
              !linkageCtx.resourcesServiceable
                ? "Resources are unserviceable — scans cannot produce INT output."
                : "No intelligence data for this unit."
            }
          />
        ) : showScanUploadOnboarding ? (
          /* ── Onboarding — first Scan Report upload for a new or cleared unit ── */
          <div className="panel p-8 flex flex-col items-center justify-center text-center gap-4 flex-1">
            <div className="h-14 w-14 grid place-items-center rounded-md border border-primary/30 bg-primary/10">
              <FileSpreadsheet className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="mono text-[14px] font-bold uppercase tracking-wider text-foreground">
                No Scan Report Available
              </p>
              <p className="mono text-[11px] text-foreground/75 mt-1.5 max-w-md">
                Click below to upload the first Satellite Scan Report for {unitLabel}.
                Once imported, this unit operates exactly like every other unit.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 mt-1">
              <Button
                type="button"
                onClick={() => importFileRef.current?.click()}
                className="mono uppercase tracking-wider gap-1.5"
              >
                <FileInput className="h-4 w-4" /> Upload Scan Report
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={startAddSatellite}
                disabled={!!editingRowKey}
                className="mono uppercase tracking-wider text-[11px]"
              >
                Add Satellite
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={downloadImportTemplate}
                className="mono uppercase tracking-wider text-[11px]"
              >
                Download Template
              </Button>
            </div>
            <p className="mono text-[9px] text-foreground/55 uppercase tracking-wider">
              Accepted formats: CSV / Excel — columns must match the template
            </p>
          </div>
        ) : isLoading ? (
          <TableSkeleton />
        ) : fromMap ? (
          mapViewRows.length === 0 ? (
            <Empty
              title="No satellite reports"
              hint={
                !linkageCtx.resourcesServiceable
                  ? "Resources are unserviceable — scans cannot produce INT output."
                  : "No intelligence data for this unit."
              }
            />
          ) : (
            <IntelUnitMapView rows={mapViewRows} />
          )
        ) : mergedTableRows.length === 0 && !pendingNewRow ? (
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
              {!linkageCtx.resourcesServiceable && (
                <span className="mono text-[9px] text-destructive uppercase">
                  Resources unserviceable
                </span>
              )}
              {!fromMap && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={startAddSatellite}
                  disabled={!!editingRowKey}
                  title="Add a single satellite row"
                  className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-primary
                             border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded-sm transition-colors disabled:opacity-40"
                >
                  Add Satellite
                </button>
                <button
                  type="button"
                  onClick={downloadImportTemplate}
                  title="Download CSV/Excel import template"
                  className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-foreground/60
                             hover:text-foreground border border-border/50 hover:border-border px-1.5 py-0.5 rounded-sm transition-colors"
                >
                  Template
                </button>
                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  title="Import satellite records from CSV / Excel (replaces existing scan rows)"
                  className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-primary
                             border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded-sm transition-colors"
                >
                  <FileInput className="h-2.5 w-2.5" /> Import
                </button>
              </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1">
              {/* Column template: checkbox | # | satellite | scanned | analyzed | pending | date | actions */}
              <div
                className={`grid items-center gap-x-2 sticky top-0 z-10 bg-secondary/30 backdrop-blur-sm border-b border-border ${INT_TABLE_GRID}`}
              >
                {allowEdit && (
                  <div className="px-1 py-2 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={handleSelectAll}
                      className="cursor-pointer accent-primary"
                      title="Select / deselect all"
                    />
                  </div>
                )}
                {!allowEdit && <div />}
                <Th align="center">#</Th>
                <Th align="left">Satellite</Th>
                <Th align="center">Scanned</Th>
                <Th align="center">Analyzed</Th>
                <Th align="center">Pending</Th>
                <Th align="center">Updated On</Th>
                <div />
              </div>
              <div className="divide-y divide-border/50">
                {visibleTableRows.map((row, idx) => {
                  const checked = selectedIds.has(row.reportId);
                  const isEditing =
                    editingTargetReportId === row.reportId && editingRowKey !== null && editDraft !== null;
                  const compactInputCls =
                    "h-7 mono text-[11px] px-1.5 py-0.5 min-w-0 border-border bg-background";
                  return (
                    <div
                      key={row.reportId}
                      role="row"
                      className={`grid items-center gap-x-2 transition-colors ${INT_TABLE_GRID}
                                 ${checked ? "bg-primary/5" : isEditing ? "bg-primary/8" : "hover:bg-primary/8"}`}
                    >
                      {/* Checkbox */}
                      {allowEdit ? (
                        <div className="px-1 py-2 flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedIds((s) => {
                                const n = new Set(s);
                                if (n.has(row.reportId)) n.delete(row.reportId);
                                else n.add(row.reportId);
                                return n;
                              })
                            }
                            className="cursor-pointer accent-primary"
                          />
                        </div>
                      ) : (
                        <div />
                      )}

                      {/* # */}
                      <div className="px-1 py-2 mono text-[11px] text-foreground tabular-nums text-center">
                        {idx + 1}
                      </div>

                      {/* Satellite */}
                      {isEditing ? (
                        <div className="px-1 py-1.5 min-w-0 text-left space-y-1">
                          <Input
                            value={editDraft.satelliteName}
                            onChange={(e) => patchEditDraft({ satelliteName: e.target.value })}
                            className={compactInputCls}
                            placeholder="Satellite name"
                          />
                          <Input
                            value={editDraft.polarization}
                            onChange={(e) => patchEditDraft({ polarization: e.target.value })}
                            className={compactInputCls}
                            placeholder="Polarization"
                          />
                        </div>
                      ) : (
                      <div
                        className="px-1 py-2 min-w-0 text-left cursor-pointer"
                        onClick={() => {
                          if (editingRowKey) return;
                          if (!fromMap) {
                          // For imported (non-roster) rows that haven't completed setup yet,
                          // open the setup wizard first — but only if they have scan data.
                          // Zero-count and seeded-roster rows go directly to the analysis page.
                          const isImportedNoEngagement =
                            !row.isZeroImported &&
                            scanOverrides.some(
                              (o) => reportIdForOverride(intUnitSlug, o) === row.reportId,
                            ) &&
                            !buildIntelDrillDownReport(intUnitSlug, row.reportId, linkageCtx, unitEngagements);
                          if (isImportedNoEngagement) {
                            const prog = loadSetup(row.reportId, row.satelliteName);
                            if (!isSetupComplete(prog)) {
                              setSetupSatellite({ name: row.satelliteName, reportId: row.reportId });
                              return;
                            }
                          }
                          }
                          setSelectedReportId(row.reportId);
                        }}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && !editingRowKey && setSelectedReportId(row.reportId)}
                      >
                        <div className="mono text-[12px] font-bold text-foreground uppercase leading-tight">
                          {row.satelliteName}
                        </div>
                        <div className="mono text-[10px] text-foreground/75 leading-tight">{row.polarization}</div>
                        {row.isZeroImported ? (
                          <span className="inline-block mt-0.5 mono text-[8px] font-bold uppercase px-1 py-px rounded-sm border border-amber-500/40 text-amber-700 bg-amber-500/8">
                            No data — click to import
                          </span>
                        ) : (
                          <>
                            {!row.scanEligible && (
                              <span className="inline-block mt-0.5 mono text-[8px] font-bold uppercase px-1 py-px rounded-sm border border-muted-foreground/30 text-muted-foreground bg-secondary/40">
                                No visibility
                              </span>
                            )}
                            {row.engagementStatus && row.scanEligible && (
                              <span
                                className={`inline-block mt-0.5 mono text-[8px] font-bold uppercase px-1 py-px rounded-sm border ${
                                  row.engagementStatus === "Completed"
                                    ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/10"
                                    : "border-primary/30 text-primary bg-primary/8"
                                }`}
                              >
                                {row.engagementStatus}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      )}

                      {isEditing ? (
                        <>
                          <div className="px-1 py-1.5">
                            <Input
                              value={editDraft.totalScanned}
                              onChange={(e) => patchEditDraft({ totalScanned: e.target.value })}
                              className={`${compactInputCls} text-center`}
                            />
                          </div>
                          <div className="px-1 py-1.5">
                            <Input
                              value={editDraft.analyzed}
                              onChange={(e) => patchEditDraft({ analyzed: e.target.value })}
                              className={`${compactInputCls} text-center`}
                            />
                          </div>
                          <div className="px-1 py-1.5">
                            <Input
                              value={editDraft.pending}
                              onChange={(e) => patchEditDraft({ pending: e.target.value })}
                              className={`${compactInputCls} text-center`}
                            />
                          </div>
                          <div className="px-1 py-1.5">
                            <Input
                              type="date"
                              value={editDraft.updatedOn}
                              onChange={(e) => patchEditDraft({ updatedOn: e.target.value })}
                              className={`${compactInputCls} text-center`}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                      <div className={`px-1 py-2 mono text-[12px] text-center font-semibold tabular-nums ${row.isZeroImported || !row.scanEligible ? "text-muted-foreground/50" : "text-foreground"}`}>
                        {row.isZeroImported ? "—" : row.totalScanned.toLocaleString()}
                      </div>
                      <div className={`px-1 py-2 mono text-[12px] text-center font-semibold tabular-nums ${row.isZeroImported || !row.scanEligible ? "text-muted-foreground/50" : "text-foreground"}`}>
                        {row.isZeroImported ? "—" : row.analyzed.toLocaleString()}
                      </div>
                      <div className={`px-1 py-2 mono text-[12px] text-center font-semibold tabular-nums ${row.isZeroImported || !row.scanEligible ? "text-muted-foreground/50" : "text-foreground"}`}>
                        {row.isZeroImported ? "—" : row.pending.toLocaleString()}
                      </div>
                      <div className={`px-1 py-2 mono text-[11px] tabular-nums text-center ${row.isZeroImported ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                        {row.reportTimestamp && !row.isZeroImported ? formatIntelCompactDate(row.reportTimestamp) : "—"}
                      </div>
                        </>
                      )}

                      {/* Row actions */}
                      {allowEdit ? (
                        <div className="px-0.5 py-2 flex items-center justify-center gap-0.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                title="Confirm row edit"
                                onClick={confirmRowEdit}
                                className="p-1 rounded hover:bg-emerald-500/15 text-emerald-700 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Cancel edit"
                                onClick={cancelRowEdit}
                                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                title="Edit scan report row"
                                disabled={!!editingRowKey}
                                onClick={() => startRowEdit(row)}
                                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                title="Clear intel records for this satellite"
                                disabled={!!editingRowKey}
                                onClick={() => setDeleteTargetId(row.reportId)}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 disabled:pointer-events-none"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>
                  );
                })}
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

      {/* Satellite setup wizard for newly imported satellites */}
      {setupSatellite && !fromMap && (
        <SatelliteSetupDialog
          open={!!setupSatellite}
          satelliteName={setupSatellite.name}
          reportId={setupSatellite.reportId}
          override={
            scanOverrides.find(
              (o) => reportIdForOverride(intUnitSlug, o) === setupSatellite.reportId,
            ) ?? null
          }
          onClose={() => setSetupSatellite(null)}
          onViewAnalysis={() => {
            setSetupSatellite(null);
            setSelectedReportId(setupSatellite.reportId);
          }}
        />
      )}

      <IntelSatelliteDrillDown
        report={drillDown}
        open={!!selectedReportId}
        onClose={() => setSelectedReportId(null)}
      />

      {/* Single delete confirm */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(o) => !o && setDeleteTargetId(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              Clear Intel Records
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              Clear all stored intel records for <span className="font-bold">{deleteTargetRow?.satelliteName}</span>? Scan counts will reset. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="mono text-[11px] uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); confirmDeleteSingle(); }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              Clear Intel Records
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px] text-foreground">
              Clear stored intel records for {selectedIds.size} satellite{selectedIds.size !== 1 ? "s" : ""}? Scan counts will reset. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="mono text-[11px] uppercase tracking-wider bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); confirmBulkDelete(); }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      className={`px-1 py-2 mono text-[9px] uppercase tracking-wide text-foreground font-bold whitespace-nowrap ${alignCls}`}
    >
      {children}
    </div>
  );
}
