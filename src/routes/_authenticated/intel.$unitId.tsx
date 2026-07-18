import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { Empty } from "@/components/Empty";
import { IntelSatelliteDrillDown } from "@/components/intel/IntelSatelliteDrillDown";
import { listUnits, listIntelRecordsForUnit, listEquipmentForUnit } from "@/lib/queries";
import { Archive, ArrowLeft, Satellite, Trash2, FileInput, FileSpreadsheet, Check, SkipForward, ExternalLink, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ccModuleBackLink } from "@/lib/controlCenter";
import {
  buildIntelDrillDownReport,
  buildIntelLinkageContext,
  buildIntelLinkageVisibilityRows,
  buildIntelSatelliteTable,
  buildSyntheticDrillDownReport,
  enrichDrillDownFromScanSeed,
  formatIntelCompactDate,
  hasIntelData,
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
  mergeIntelSatelliteTableWithStorage,
  type ScanReportOverride,
} from "@/lib/intelScanStorage";
import { unhideUnitInModule } from "@/lib/moduleUnitRegistry";
import { rebindAndPersistUnitEngagements } from "@/lib/operationalStore";
import { notifyOperationalDerivedRefresh } from "@/lib/operationalRefresh";
import {
  applyIntelScanRowEdit,
  buildIntelReportId,
  type IntelScanRowDraft,
} from "@/lib/intelScanRowEdit";

// ── Scan report override storage ────────────────────────────────────────────
// Uses shared intelScanStorage helpers (canonical slot-based keys).

const SCAN_IMPORT_HEADERS = [
  "Satellite", "Polarization", "Scanned", "Analyzed",
  "Pending", "Productivity (%)", "Updated On",
] as const;

// ── Date parsing ─────────────────────────────────────────────────────────────
// Excel serial-date epoch: 1 = 1 Jan 1900 (with a known Excel leap-year bug for 1900).
const EXCEL_EPOCH_MS = new Date(Date.UTC(1899, 11, 30)).getTime();
const MONTH_NAMES_LOWER = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

/**
 * Convert any date-like value from an Excel/CSV cell into an ISO-8601 date string
 * (YYYY-MM-DD in UTC).  Handles:
 *   • Excel serial numbers  (e.g. 46049)
 *   • ISO strings           (YYYY-MM-DD / YYYY/MM/DD)
 *   • US format             MM/DD/YYYY  MM-DD-YYYY
 *   • European format       DD/MM/YYYY  DD-MM-YYYY  (detected when day > 12)
 *   • Named-month format    DD-Mon-YYYY  DD Mon YYYY
 *   • Compact numeric       YYYYMMDD
 * Returns today's ISO date if parsing fails.
 */
function parseImportDate(raw: unknown): string {
  const fallback = new Date().toISOString().slice(0, 10);

  // --- Excel serial number ---
  const numVal = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!isNaN(numVal) && numVal > 1 && numVal < 2_958_466) {
    // 2 958 466 ≈ year 9999 in Excel serial
    const ms = EXCEL_EPOCH_MS + Math.round(numVal) * 86_400_000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const str = String(raw ?? "").trim();
  if (!str) return fallback;

  // --- ISO: YYYY-MM-DD or YYYY/MM/DD ---
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // --- Compact YYYYMMDD ---
  const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // --- Named-month: DD-Mon-YYYY or DD Mon YYYY ---
  const namedMatch = str.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/);
  if (namedMatch) {
    const [, d, mon, y] = namedMatch;
    const mIdx = MONTH_NAMES_LOWER.indexOf(mon.slice(0, 3).toLowerCase());
    if (mIdx !== -1) {
      const dt = new Date(Date.UTC(+y, mIdx, +d));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }

  // --- Numeric with separator: could be MM/DD/YYYY or DD/MM/YYYY ---
  const numericMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numericMatch) {
    let [, a, b, y] = numericMatch;
    if (y.length === 2) y = `20${y}`;
    const aNum = +a, bNum = +b;
    // If first part is definitely > 12, it must be the day (DD/MM/YYYY)
    if (aNum > 12) {
      const dt = new Date(Date.UTC(+y, bNum - 1, aNum));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    // If second part is > 12, it must be the day (MM/DD/YYYY)
    if (bNum > 12) {
      const dt = new Date(Date.UTC(+y, aNum - 1, bNum));
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    // Ambiguous (both ≤ 12) — assume MM/DD/YYYY (US, common in English-locale spreadsheets)
    const dt = new Date(Date.UTC(+y, aNum - 1, bNum));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  // --- Last resort: let the JS engine try (ISO-only strings are safe) ---
  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) return fallbackDate.toISOString().slice(0, 10);

  return fallback;
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
      const objs = gridToRecords(grid, expectedHeaders, { validateHeaders: false });
      if (objs.length === 0) {
        toast.error(
          `Your file has a header row but no data. ` +
          `Add at least one row of data below the column headings and re-upload.`,
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
        const missing = objs
          .map((r, i) => ({ rowNum: i + 2, val: (r["Frequency ID"] ?? "").trim() }))
          .filter(({ val }) => !val);
        if (missing.length) {
          toast.error(
            `"Frequency ID" is blank in spreadsheet row${missing.length > 1 ? "s" : ""} ` +
            missing.map(({ rowNum }) => rowNum).join(", ") +
            `. Every productive frequency must have a Frequency ID — fill in the missing value${missing.length > 1 ? "s" : ""} and re-upload.`,
          );
          return;
        }
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
        const missing = objs
          .map((r, i) => ({ rowNum: i + 2, val: (r["Frequency ID"] ?? "").trim() }))
          .filter(({ val }) => !val);
        if (missing.length) {
          toast.error(
            `"Frequency ID" is blank in spreadsheet row${missing.length > 1 ? "s" : ""} ` +
            missing.map(({ rowNum }) => rowNum).join(", ") +
            `. Every non-productive frequency must have a Frequency ID — fill in the missing value${missing.length > 1 ? "s" : ""} and re-upload.`,
          );
          return;
        }
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
        const missing = objs
          .map((r, i) => ({ rowNum: i + 2, val: (r["Frequency"] ?? "").trim() }))
          .filter(({ val }) => !val);
        if (missing.length) {
          toast.error(
            `"Frequency" is blank in spreadsheet row${missing.length > 1 ? "s" : ""} ` +
            missing.map(({ rowNum }) => rowNum).join(", ") +
            `. Every newly encountered protocol must reference a frequency — fill in the missing value${missing.length > 1 ? "s" : ""} and re-upload.`,
          );
          return;
        }
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
      toast.success(`${sec.label} imported — ${objs.length} row${objs.length !== 1 ? "s" : ""} saved`);
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
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<IntelScanRowDraft | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [scanOverrides, setScanOverrides] = useState<ScanReportOverride[]>([]);
  const [suppressedSatNames, setSuppressedSatNames] = useState<Set<string>>(new Set());
  // Keep a ref so the navigate-back effect always reads the latest overrides without
  // triggering unnecessary re-runs.
  const scanOverridesRef = useRef(scanOverrides);
  useEffect(() => { scanOverridesRef.current = scanOverrides; }, [scanOverrides]);
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
  }, [tableRows, scanOverrides, intUnitSlug, unit?.code]);

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
    if (built) return enrichDrillDownFromScanSeed(built, scanSeed);

    return selectedRow
      ? buildSyntheticDrillDownReport(selectedRow.satelliteName, intUnitSlug, linkageCtx, scanSeed)
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
      const satName = currentOverrides.find(
        (o) => `${intUnitSlug}__${o.satelliteName.replace(/\s+/g, "-")}` === prev,
      )?.satelliteName;
      if (satName) {
        const updated = currentOverrides.map((o) =>
          o.satelliteName.toLowerCase() === satName.toLowerCase()
            ? { ...o, totalScanned: 0, analyzed: 0, pending: 0, productivityScore: null }
            : o,
        );
        saveScanOverrides(intUnitSlug, updated, unit?.code);
        setScanOverrides(updated);
      }
    }
  }, [selectedReportId, intUnitSlug, unitId]);

  function downloadImportTemplate() {
    const example = ["EXAMPLE-SAT-1", "V/H", "450", "320", "130", "71", "2024-01-15"];
    const csv = buildCsv([...SCAN_IMPORT_HEADERS], [example]);
    downloadCsv("scan-report-template.csv", csv);
    toast.info("Template downloaded — columns match the Satellite Scan Reports table exactly");
  }

  async function handleImportFile(file: File) {
    const check = validateImportFile(file);
    if (!check.ok) return toast.error(check.error);
    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      // Use raw:true so Excel date serial numbers arrive as numbers (not pre-formatted strings).
      // We handle all conversion ourselves via parseImportDate.
      const wb = read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true }) as unknown[][];

      if (!rows.length) return toast.error("File is empty");

      // Header row: force to string for comparison regardless of raw mode
      const fileHeaders = (rows[0] ?? []).map((h) => String(h ?? "").trim());
      for (let i = 0; i < SCAN_IMPORT_HEADERS.length; i++) {
        if (fileHeaders[i] !== SCAN_IMPORT_HEADERS[i]) {
          toast.error(
            `Wrong format — column ${i + 1} must be "${SCAN_IMPORT_HEADERS[i]}"` +
            (fileHeaders[i] ? ` but got "${fileHeaders[i]}"` : " (column missing)") +
            `. Required columns: ${SCAN_IMPORT_HEADERS.join(", ")}`,
          );
          return;
        }
      }

      const dataRows = rows.slice(1).filter((r) => String((r as unknown[])[0] ?? "").trim());
      if (dataRows.length === 0) return toast.error("No data rows found — add at least one satellite row below the header");

      const overrides: ScanReportOverride[] = (dataRows as unknown[][]).map((r) => ({
        satelliteName: String(r[0] ?? "").trim(),
        polarization: String(r[1] ?? "").trim() || "—",
        totalScanned: Math.max(0, parseInt(String(r[2] ?? "0").replace(/\D/g, "")) || 0),
        analyzed:     Math.max(0, parseInt(String(r[3] ?? "0").replace(/\D/g, "")) || 0),
        pending:      Math.max(0, parseInt(String(r[4] ?? "0").replace(/\D/g, "")) || 0),
        productivityScore: (() => {
          const v = parseFloat(String(r[5] ?? "").replace(/[^0-9.]/g, ""));
          return isNaN(v) ? null : Math.min(100, Math.max(0, v));
        })(),
        // Use the robust multi-format date parser so serial numbers, DD/MM/YYYY, etc. all work
        updatedOn: parseImportDate(r[6]),
      }));

      saveScanOverrides(intUnitSlug, overrides, unit?.code);
      setScanOverrides(overrides);
      const importedLower = new Set(overrides.map((o) => o.satelliteName.toLowerCase()));
      const newSuppressed = [...suppressedSatNames].filter((n) => !importedLower.has(n));
      saveSuppressedSatNames(intUnitSlug, newSuppressed, unit?.code);
      setSuppressedSatNames(new Set(newSuppressed));
      unhideUnitInModule(dbUnitId, "intel");
      rebindAndPersistUnitEngagements(dbUnitId);
      notifyOperationalDerivedRefresh();
      void qc.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
      void qc.invalidateQueries({ queryKey: ["units"] });
      toast.success(`Imported ${overrides.length} scan report row${overrides.length !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Failed to parse file — ensure it matches the downloaded template");
    }
  }

  function deleteIntelForSatNames(satNames: string[]) {
    const nameSet = new Set(satNames.map((n) => n.toLowerCase()));
    const remaining = loadImportedRecords(intUnitSlug).filter(
      (r) => !nameSet.has(r.satellite.toLowerCase()),
    );
    saveImportedRecords(intUnitSlug, remaining);
    const remainingOverrides = scanOverrides.filter((o) => !nameSet.has(o.satelliteName.toLowerCase()));
    saveScanOverrides(intUnitSlug, remainingOverrides, unit?.code);
    setScanOverrides(remainingOverrides);
    // Clear setup wizard progress and imported cell data so a re-import starts fresh.
    for (const satName of satNames) {
      const repId = `${intUnitSlug}__${satName.replace(/\s+/g, "-")}`;
      localStorage.removeItem(setupKey(repId, satName));
      removeReportCellEdits(repId);
    }
    // Suppress these satellites so they don't re-appear from the seeded roster.
    const newSuppressed = [...new Set([...suppressedSatNames, ...nameSet])];
    saveSuppressedSatNames(intUnitSlug, newSuppressed, unit?.code);
    setSuppressedSatNames(new Set(newSuppressed));

    const opIds = (intelRows as any[])
      .filter((r) => nameSet.has((r.satellites?.name ?? "").toLowerCase()))
      .map((r) => r.id)
      .filter((id: string) => id.startsWith("op-intel-"));
    if (opIds.length > 0) removeOperationalIntelRows(opIds);
    qc.invalidateQueries({ queryKey: ["intel-eng", dbUnitId] });
    qc.invalidateQueries({ queryKey: ENGAGEMENTS_ALL_KEY });
  }

  function confirmDeleteSingle() {
    if (!deleteTargetId) return;
    const row = mergedTableRows.find((r) => r.reportId === deleteTargetId);
    if (!row) return;
    deleteIntelForSatNames([row.satelliteName]);
    toast.success("Intel records cleared for satellite.");
    setDeleteTargetId(null);
    setSelectedIds((s) => { const n = new Set(s); n.delete(deleteTargetId); return n; });
  }

  function confirmBulkDelete() {
    const names = mergedTableRows
      .filter((r) => selectedIds.has(r.reportId))
      .map((r) => r.satelliteName);
    deleteIntelForSatNames(names);
    toast.success(`${names.length} satellite intel record${names.length !== 1 ? "s" : ""} cleared.`);
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
  }

  const deleteTargetRow = mergedTableRows.find((r) => r.reportId === deleteTargetId) ?? null;
  const visibleIds = mergedTableRows.map((r) => r.reportId);
  const selectAll = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function handleSelectAll() {
    setSelectedIds(selectAll ? new Set() : new Set(visibleIds));
  }

  function startRowEdit(row: (typeof mergedTableRows)[number]) {
    setEditingReportId(row.reportId);
    setEditDraft({
      satelliteName: row.satelliteName,
      polarization: row.polarization,
      totalScanned: String(row.totalScanned),
      analyzed: String(row.analyzed),
      pending: String(row.pending),
      productivity: row.productivityScore === null ? "" : String(row.productivityScore),
      updatedOn: row.reportTimestamp ?? "",
    });
  }

  function cancelRowEdit() {
    setEditingReportId(null);
    setEditDraft(null);
  }

  function confirmRowEdit() {
    if (!editingReportId || !editDraft) return;
    const row = mergedTableRows.find((r) => r.reportId === editingReportId);
    if (!row) return;

    const result = applyIntelScanRowEdit({
      intUnitSlug,
      unitCode: unit?.code,
      dbUnitId,
      previousSatelliteName: row.satelliteName,
      draft: editDraft,
      existingOverrides: scanOverrides,
      otherSatelliteNames: mergedTableRows
        .filter((r) => r.reportId !== editingReportId)
        .map((r) => r.satelliteName),
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const newName = editDraft.satelliteName.trim();
    const reportIdChanged = row.reportId !== buildIntelReportId(intUnitSlug, newName);

    setScanOverrides(result.overrides);
    if (selectedReportId === editingReportId && reportIdChanged) {
      setSelectedReportId(buildIntelReportId(intUnitSlug, newName));
    }
    setEditingReportId(null);
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
        title="Intelligence Repository"
        showBack
        backLink={ccModuleBackLink("intel")}
        headerIcon={<HomeNavIconBadge icon={Archive} theme="intel" size="md" />}
        horizontalNav={null}
      >
        <Empty title="Unit not found" hint="Return to the repository home and select a valid unit." />
      </AppShell>
    );
  }

  const unitLabel = unit ? unitDisplayLabel(unit) : "Unit";

  // DECISION: Treat cleared units like new units — show upload onboarding whenever no rows remain.
  const showScanUploadOnboarding =
    !isLoading && scanOverrides.length === 0 && mergedTableRows.length === 0;

  return (
    <AppShell
      title="Intelligence Repository"
      pageTitle={`Satellite Scan Reports — ${unitLabel}`}
      showBack
      backLink={ccModuleBackLink("intel")}
      headerIcon={<HomeNavIconBadge icon={Archive} theme="intel" size="md" />}
      horizontalNav={null}
    >
      <div className="flex flex-col h-[calc(100vh-6.5rem)] min-h-0 gap-1">
        <div className="shrink-0 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate({ to: "/administrator", search: { module: "intel" } })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-border bg-card
                       hover:bg-secondary/60 hover:text-secondary-foreground hover:border-primary/40 mono text-[10px] uppercase tracking-wider text-foreground
                       transition-all cursor-pointer"
          >
            <ArrowLeft className="h-3 w-3" /> All Units
          </button>
          {(dataAvailable || scanOverrides.length > 0) && (
            <span className="mono text-[10px] text-foreground/80">
              {mergedTableRows.length} satellite report{mergedTableRows.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {selectedIds.size > 0 && canEdit && (
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

        {showScanUploadOnboarding ? (
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
        ) : mergedTableRows.length === 0 ? (
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
              <div className="ml-auto flex items-center gap-1.5">
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
                  title="Import satellite records from CSV / Excel"
                  className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-wider text-primary
                             border border-primary/40 hover:bg-primary/10 px-1.5 py-0.5 rounded-sm transition-colors"
                >
                  <FileInput className="h-2.5 w-2.5" /> Import
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1">
              {/* Column template: checkbox | # | satellite | 3 numeric | productivity | date | actions */}
              <div
                className="grid items-center gap-x-2 sticky top-0 z-10 bg-secondary/30 backdrop-blur-sm border-b border-border
                           [grid-template-columns:1.5rem_2rem_minmax(0,1.3fr)_repeat(3,minmax(0,0.75fr))_minmax(0,1fr)_minmax(0,1.1fr)_3.5rem]"
              >
                {canEdit && (
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
                {!canEdit && <div />}
                <Th align="center">#</Th>
                <Th align="left">Satellite</Th>
                <Th align="center">Scanned</Th>
                <Th align="center">Analyzed</Th>
                <Th align="center">Pending</Th>
                <Th align="center">Productivity</Th>
                <Th align="center">Updated On</Th>
                <div />
              </div>
              <div className="divide-y divide-border/50">
                {mergedTableRows.map((row, idx) => {
                  const checked = selectedIds.has(row.reportId);
                  const isEditing = editingReportId === row.reportId && editDraft !== null;
                  const compactInputCls =
                    "h-7 mono text-[11px] px-1.5 py-0.5 min-w-0 border-border bg-background";
                  return (
                    <div
                      key={row.reportId}
                      role="row"
                      className={`grid items-center gap-x-2 transition-colors
                                 [grid-template-columns:1.5rem_2rem_minmax(0,1.3fr)_repeat(3,minmax(0,0.75fr))_minmax(0,1fr)_minmax(0,1.1fr)_3.5rem]
                                 ${checked ? "bg-primary/5" : isEditing ? "bg-primary/8" : "hover:bg-primary/8"}`}
                    >
                      {/* Checkbox */}
                      {canEdit ? (
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
                          if (editingReportId) return;
                          // For imported (non-roster) rows that haven't completed setup yet,
                          // open the setup wizard first — but only if they have scan data.
                          // Zero-count and seeded-roster rows go directly to the analysis page.
                          const isImportedNoEngagement =
                            !row.isZeroImported &&
                            scanOverrides.some(
                              (o) => `${intUnitSlug}__${o.satelliteName.replace(/\s+/g, "-")}` === row.reportId,
                            ) &&
                            !buildIntelDrillDownReport(intUnitSlug, row.reportId, linkageCtx, unitEngagements);
                          if (isImportedNoEngagement) {
                            const prog = loadSetup(row.reportId, row.satelliteName);
                            if (!isSetupComplete(prog)) {
                              setSetupSatellite({ name: row.satelliteName, reportId: row.reportId });
                              return;
                            }
                          }
                          setSelectedReportId(row.reportId);
                        }}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && !editingReportId && setSelectedReportId(row.reportId)}
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
                              value={editDraft.productivity}
                              onChange={(e) => patchEditDraft({ productivity: e.target.value })}
                              className={`${compactInputCls} text-center`}
                              placeholder="N/A"
                            />
                          </div>
                          <div className="px-1 py-1.5">
                            <Input
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
                      <div className="px-1 py-2 text-center">
                        {row.isZeroImported ? (
                          <span className="mono text-[10px] font-bold uppercase text-muted-foreground/50">—</span>
                        ) : row.productivityScore === null ? (
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
                      <div className={`px-1 py-2 mono text-[11px] tabular-nums text-center ${row.isZeroImported ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                        {row.reportTimestamp && !row.isZeroImported ? formatIntelCompactDate(row.reportTimestamp) : "—"}
                      </div>
                        </>
                      )}

                      {/* Row actions */}
                      {canEdit ? (
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
                                disabled={!!editingReportId}
                                onClick={() => startRowEdit(row)}
                                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                title="Clear intel records for this satellite"
                                disabled={!!editingReportId}
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
      {setupSatellite && (
        <SatelliteSetupDialog
          open={!!setupSatellite}
          satelliteName={setupSatellite.name}
          reportId={setupSatellite.reportId}
          override={
            scanOverrides.find(
              (o) => `${intUnitSlug}__${o.satelliteName.replace(/\s+/g, "-")}` === setupSatellite.reportId,
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
