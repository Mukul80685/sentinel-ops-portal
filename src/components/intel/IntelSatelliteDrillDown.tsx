import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Globe, Radar, Satellite, Star, Cog, Trash2, Navigation } from "lucide-react";
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
import type {
  IntelDrillDownReport,
  NonProductiveFrequency,
  ProductiveFrequency,
} from "@/lib/intelAnalysisData";
import { getUnitIntelName } from "@/lib/intelAnalysisData";
import { resolveMatrixVisibility } from "@/lib/visibilityMatrix";
import { evaluateFrequencyAllocationEligibility } from "@/lib/intelIntegrity";
import {
  allocateToUnit,
  clearAllocation,
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
import { listUnits } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ENGAGEMENTS_ALL_KEY, fetchAllEngagements } from "@/lib/engagementEngine";
import { useQuery } from "@tanstack/react-query";

type Props = {
  report: IntelDrillDownReport | null;
  open: boolean;
  onClose: () => void;
};

type MenuState = {
  key: string;
  freqId: string;
  x: number;
  y: number;
  techActive: boolean;
  importantActive: boolean;
  allocatedActive: boolean;
};

type PendingAction = {
  action: string;
  key: string;
  frequencyId: string;
  actionLabel: string;
};

function resolveFrequencyBeamContext(report: IntelDrillDownReport, frequencyId: string) {
  const ctx = evaluateFrequencyAllocationEligibility(
    report.satelliteName,
    report.unitId,
    frequencyId,
  );
  return { band: ctx.band, beamName: ctx.matchingBeams[0] ?? report.beamsVisibleToUnit[0] ?? "—" };
}

export function IntelSatelliteDrillDown({ report, open, onClose }: Props) {
  const { user } = useAuth();
  const userLabel = user?.email ?? "Operator";
  const [freqTick, setFreqTick] = useState(0);
  const [allocateOpen, setAllocateOpen] = useState<{ key: string; frequency: string } | null>(null);
  const parentCloseGuardRef = useRef(false);
  const prevAllocateRef = useRef<typeof allocateOpen>(null);

  useEffect(() => {
    const wasOpen = prevAllocateRef.current;
    prevAllocateRef.current = allocateOpen;
    if (!wasOpen || allocateOpen) return;
    parentCloseGuardRef.current = true;
    const t = window.setTimeout(() => {
      parentCloseGuardRef.current = false;
    }, 200);
    return () => window.clearTimeout(t);
  }, [allocateOpen]);

  const { data: allEngagements = [] } = useQuery({
    queryKey: ENGAGEMENTS_ALL_KEY,
    queryFn: fetchAllEngagements,
    staleTime: 30_000,
    enabled: open,
  });
  const { data: dbUnits = [] } = useQuery({
    queryKey: ["units"],
    queryFn: listUnits,
    enabled: open,
  });

  useEffect(() => {
    const handler = () => setFreqTick((t) => t + 1);
    window.addEventListener(INTEL_FREQ_EVENT, handler);
    return () => window.removeEventListener(INTEL_FREQ_EVENT, handler);
  }, []);

  const bump = useCallback(() => setFreqTick((t) => t + 1), []);

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
  const visibilityNavTarget = resolveMatrixVisibility(report.unitId, report.satelliteName);
  const blockedMsg =
    visibilityConstraint ||
    "Scanning blocked — Visibility Matrix reports zero beams visible to this unit.";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !allocateOpen && !parentCloseGuardRef.current) onClose();
        }}
      >
        <DialogContent
          className="max-w-[98vw] w-full sm:max-w-6xl h-[94vh] max-h-[94vh] overflow-hidden flex flex-col p-0 gap-0
                     sm:rounded-lg border-border shadow-2xl"
          onPointerDownOutside={preventDialogDismissOnFreqMenu}
          onInteractOutside={preventDialogDismissOnFreqMenu}
        >
          <div className="shrink-0 border-b border-border bg-card px-3 py-1.5">
            <DialogHeader className="space-y-0 text-left">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 mono text-[10px] uppercase tracking-wider text-foreground
                           hover:text-primary transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to satellite list
              </button>
              <DialogTitle className="mono text-sm font-bold uppercase tracking-wide text-foreground flex items-center gap-2 mt-0.5">
                <Satellite className="h-4 w-4 text-primary" />
                {report.satelliteName}
              </DialogTitle>
              <p className="mono text-[10px] text-foreground/75 leading-tight mt-0.5">
                {visibilityBlocked ? "—" : scanSummary.polarization}
              </p>
              <p className="mono text-[10px] text-foreground/80">
                Intelligence Analysis · {getUnitIntelName(report.unitId)}
              </p>
            </DialogHeader>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1.5 space-y-1.5">
            {visibilityBlocked && (
              <div
                className="rounded border border-amber-500/45 bg-amber-500/10 px-2 py-1.5"
                role="status"
              >
                <p className="mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Visibility Constraint — Scan Blocked
                </p>
                <p className="mono text-[10px] text-foreground/85 mt-0.5">{blockedMsg}</p>
                <p className="mono text-[9px] text-foreground/65 mt-0.5">
                  Frequency lists and analysis remain visible but are inaccessible until matrix visibility is restored.
                </p>
              </div>
            )}

            {/* A · Satellite Details */}
            <section className="panel overflow-hidden">
              <div className="px-2 py-1 border-b border-border bg-secondary/25 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">
                  Satellite Details
                </span>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-1.5 p-2">
                <Field label="Satellite Name" value={baseProfile.name} emphasis />
                <Field label="Origin Country" value={baseProfile.originCountry} />
                <Field label="Launch Date" value={baseProfile.launchDate} />
                <Field label="Orbital Position" value={baseProfile.orbitalPosition} />
                <Field label="Total Transponders" value={baseProfile.totalTransponders} />
              </dl>
            </section>

            {/* B · Scanning Analysis — metrics + beam visibility (matrix-derived) */}
            <section className="panel overflow-hidden">
              <div className="px-2 py-1 border-b border-border bg-secondary/25 flex items-center gap-2">
                <Radar className="h-3.5 w-3.5 text-primary" />
                <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">
                  Scanning Analysis Summary
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 py-1.5 border-b border-border/40">
                {visibilityBlocked ? (
                  <>
                    <StripItem label="Polarization" value="N/A" />
                    <StripItem label="Scan Start Date" value="N/A" />
                    <StripItem label="Frequencies Scanned" value="N/A" />
                    <StripItem label="Frequencies Analyzed" value="N/A" />
                    <StripItem label="Frequencies Pending" value="N/A" />
                  </>
                ) : (
                  <>
                    <StripItem label="Polarization" value={scanSummary.polarization} />
                    <StripItem label="Scan Start Date" value={scanSummary.scanStartDate} />
                    <StripItem label="Frequencies Scanned" value={scanSummary.totalScanned.toLocaleString()} />
                    <StripItem label="Frequencies Analyzed" value={scanSummary.analyzed.toLocaleString()} />
                    <StripItem label="Frequencies Pending" value={scanSummary.pending.toLocaleString()} />
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x divide-border min-h-[100px]">
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
                  headerAction={
                    <Link
                      to="/visibility"
                      search={{
                        unit: report.unitId,
                        satellite: report.satelliteName,
                        ...(visibilityNavTarget?.regionId
                          ? { region: visibilityNavTarget.regionId }
                          : {}),
                      }}
                      className="inline-flex items-center gap-1 mono text-[9px] text-primary hover:underline shrink-0"
                      onClick={onClose}
                    >
                      View in Satellite Visibility Matrix
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  }
                />
              </div>
            </section>

            {/* C · Frequency tables */}
            <section className="space-y-1.5">
              <div className="mono text-[10px] font-bold uppercase tracking-wider text-foreground px-0.5">
                Detailed Intelligence Analysis
                <span className="text-[9px] font-normal text-foreground/70 ml-2">
                  Click or right-click any frequency row for actions
                </span>
              </div>

              <FrequencyTable
                title="C1 · Productive Frequencies"
                section="productive"
                report={report}
                headers={["Frequency ID", "Output Type", "Details of Interception", "Protocol"]}
                rows={report.productive}
                renderCells={(f) => [f.outputType, f.detailsOfInterception, f.protocolEncountered ?? "—"]}
                freqId={(f) => f.frequencyId}
                freqTick={freqTick}
                userLabel={userLabel}
                visibilityBlocked={visibilityBlocked}
                blockedMessage={blockedMsg}
                onAllocate={(key, freq) => setAllocateOpen({ key, frequency: freq })}
                onAction={bump}
              />

              <FrequencyTable
                title="C2 · Non-Productive Frequencies"
                section="non_productive"
                report={report}
                headers={["Frequency ID", "Level", "Protocol", "Remarks"]}
                columnWidths={["24%", "11%", "18%", "47%"]}
                rows={report.nonProductive}
                renderCells={(f) => [f.level, f.protocolEncountered ?? "—", f.remarks]}
                freqId={(f) => f.frequencyId}
                freqTick={freqTick}
                userLabel={userLabel}
                visibilityBlocked={visibilityBlocked}
                blockedMessage={blockedMsg}
                onAllocate={(key, freq) => setAllocateOpen({ key, frequency: freq })}
                onAction={bump}
              />

              <NovelProtocolTable
                protocols={report.novelProtocols}
                visibilityBlocked={visibilityBlocked}
                blockedMessage={blockedMsg}
              />
            </section>
          </div>

          {allocateOpen && (
            <AllocateUnitDialog
              open={!!allocateOpen}
              onClose={() => setAllocateOpen(null)}
              freqKey={allocateOpen.key}
              frequency={allocateOpen.frequency}
              report={report}
              dbUnits={dbUnits}
              allEngagements={allEngagements}
              userLabel={userLabel}
              onDone={() => {
                bump();
                setAllocateOpen(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <dt className="mono text-[9px] uppercase tracking-wider text-foreground/75">{label}</dt>
      <dd className={`mono mt-0.5 ${emphasis ? "text-[12px] font-bold" : "text-[11px] font-semibold"} text-foreground`}>
        {value}
      </dd>
    </div>
  );
}

function StripItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 mono">
      <span className="text-[9px] uppercase tracking-wider text-foreground/70">{label}:</span>
      <span className="text-[11px] font-bold text-foreground">{value}</span>
    </div>
  );
}

function BeamPanel({
  title,
  beams,
  highlight,
  headerAction,
  emptyMessage = "None listed.",
  countOverride,
}: {
  title: string;
  beams: string[];
  highlight?: boolean;
  headerAction?: React.ReactNode;
  emptyMessage?: string;
  countOverride?: number;
}) {
  const displayCount = countOverride ?? beams.length;
  return (
    <div className={`flex flex-col min-h-0 ${highlight ? "bg-primary/[0.03]" : ""}`}>
      <div className="px-2 py-1 border-b border-border/40 bg-secondary/15 shrink-0 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</span>
          <span className="mono text-[9px] text-foreground/70 ml-2">({displayCount})</span>
        </div>
        {headerAction}
      </div>
      {beams.length === 0 ? (
        <p className="px-2 py-1.5 mono text-[11px] text-foreground/70">{emptyMessage}</p>
      ) : (
        <ul className="px-2 py-1.5 space-y-0.5 flex-1 overflow-y-auto max-h-[120px]">
          {beams.map((beam) => (
            <li key={beam} className="mono text-[11px] text-foreground leading-snug flex items-start gap-1">
              <span className="text-primary shrink-0">•</span>
              <span className={highlight ? "font-semibold" : ""}>{beam}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function preventDialogDismissOnFreqMenu(e: Event) {
  const t = e.target as HTMLElement | null;
  if (t?.closest("[data-freq-action-menu]")) {
    e.preventDefault();
  }
}

function ActionConfirmDialog({
  pending,
  satelliteName,
  onConfirm,
  onCancel,
}: {
  pending: PendingAction | null;
  satelliteName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={!!pending} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="mono text-sm uppercase tracking-wide">Confirm Action</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1.5 pt-1">
              <p className="mono text-[11px] text-foreground">
                <span className="text-muted-foreground">Action: </span>
                {pending?.actionLabel}
              </p>
              <p className="mono text-[11px] text-foreground">
                <span className="text-muted-foreground">Frequency ID: </span>
                {pending?.frequencyId}
              </p>
              <p className="mono text-[11px] text-foreground">
                <span className="text-muted-foreground">Satellite: </span>
                {satelliteName}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="mono text-[11px] uppercase tracking-wider">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="mono text-[11px] uppercase tracking-wider"
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FreqActionMenu({
  menu,
  onClose,
  onAction,
}: {
  menu: MenuState;
  onClose: () => void;
  onAction: (action: string, label: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Use click (not mousedown) so menu button click completes before outside-close runs
    document.addEventListener("click", handleOutside, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleOutside, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const items = [
    {
      id: "important",
      label: menu.importantActive ? "Remove from Important Frequencies" : "Add to Important Frequencies",
      icon: Star,
    },
    {
      id: "allocate",
      label: menu.allocatedActive ? "Remove Unit Allocation" : "Allocate to Unit",
      icon: Navigation,
    },
    {
      id: "tech",
      label: menu.techActive ? "Remove Technical Analysis" : "Request Detailed Technical Analysis",
      icon: Cog,
    },
    { id: "discard", label: "Discard", icon: Trash2 },
  ];

  return (
    <div
      ref={ref}
      data-freq-action-menu
      className="fixed z-[200] min-w-[280px] rounded-md border border-border bg-popover shadow-lg py-1"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-2.5 py-1.5 border-b border-border/50 mono text-[9px] font-bold uppercase tracking-wider text-foreground/80 truncate">
        Frequency Actions
      </div>
      <div className="px-2.5 py-0.5 mono text-[10px] text-foreground truncate">{menu.freqId}</div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="w-full text-left px-2.5 py-2 mono text-[11px] text-foreground hover:bg-primary/10 transition-colors
                       flex items-center gap-2"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAction(item.id, item.label);
              onClose();
            }}
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 ${item.id === "discard" ? "text-destructive" : "text-primary"}`} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function FrequencyTable<T extends ProductiveFrequency | NonProductiveFrequency>({
  title,
  section,
  report,
  headers,
  rows,
  renderCells,
  freqId,
  freqTick,
  userLabel,
  visibilityBlocked,
  blockedMessage,
  onAllocate,
  onAction,
  columnWidths,
}: {
  title: string;
  section: FrequencySection;
  report: IntelDrillDownReport;
  headers: string[];
  rows: T[];
  renderCells: (row: T) => string[];
  freqId: (row: T) => string;
  freqTick: number;
  userLabel: string;
  visibilityBlocked?: boolean;
  blockedMessage?: string;
  onAllocate: (key: string, freq: string) => void;
  onAction: () => void;
  columnWidths?: [string, string, string, string];
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const unitLabel = getUnitIntelName(report.unitId);

  const activeRows = rows.filter((row) => {
    const key = frequencyKey(report.reportId, freqId(row), section);
    return !getFrequencyState(key).flags.discarded;
  });

  function openMenu(e: React.MouseEvent, key: string, frequencyId: string) {
    if (visibilityBlocked) return;
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 300);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    const state = getFrequencyState(key);
    setMenu({
      key,
      freqId: frequencyId,
      x,
      y,
      techActive: state.flags.techAnalysis,
      importantActive: state.flags.important,
      allocatedActive: state.flags.allocated,
    });
  }

  function queueAction(action: string, actionLabel: string) {
    if (!menu) return;
    setPending({ action, key: menu.key, frequencyId: menu.freqId, actionLabel });
    setMenu(null);
  }

  function runAction(key: string, frequencyId: string, action: string) {
    const beamCtx = resolveFrequencyBeamContext(report, frequencyId);
    if (action === "important") {
      if (getFrequencyState(key).flags.important) {
        clearImportant(key, userLabel);
        toast.success("Removed from Important Frequencies");
      } else {
        markImportant(key, {
          frequency: frequencyId,
          satelliteName: report.satelliteName,
          unitLabel,
          reportId: report.reportId,
          userLabel,
          sourceUnitId: report.unitId,
          beamName: beamCtx.beamName,
          band: beamCtx.band,
          polarization: report.scanSummary.polarization,
        });
        toast.success("Added to Important Frequencies");
      }
    } else if (action === "allocate") {
      if (getFrequencyState(key).flags.allocated) {
        clearAllocation(key, userLabel);
        toast.success("Allocation removed");
      } else {
        onAllocate(key, frequencyId);
      }
      onAction();
      return;
    } else if (action === "discard") {
      discardFrequency(key, userLabel, {
        frequencyId,
        satelliteName: report.satelliteName,
        section,
        sourceUnitId: report.unitId,
        beamName: beamCtx.beamName,
        band: beamCtx.band,
      });
      toast.success("Moved to Discard Repository");
    } else if (action === "tech") {
      const wasActive = getFrequencyState(key).flags.techAnalysis;
      if (wasActive) {
        clearTechnicalAnalysis(key, userLabel);
        toast.success("Technical analysis removed");
      } else {
        requestTechnicalAnalysis(key, userLabel, {
          sourceUnitId: report.unitId,
          frequencyId,
          satelliteName: report.satelliteName,
          beamName: beamCtx.beamName,
          band: beamCtx.band,
        });
        toast.success("Technical analysis requested");
      }
    }
    onAction();
  }

  const cols = columnWidths ?? ["22%", "14%", "38%", "26%"];

  return (
    <div className="panel overflow-hidden border border-border w-full">
      <div className="px-2 py-1 border-b border-border bg-secondary/20">
        <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</span>
        <span className="mono text-[9px] text-foreground/70 ml-2">
          ({visibilityBlocked ? 0 : activeRows.length})
        </span>
      </div>
      <div className="overflow-x-auto max-h-[min(32vh,280px)] w-full">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: cols[0] }} />
            <col style={{ width: cols[1] }} />
            <col style={{ width: cols[2] }} />
            <col style={{ width: cols[3] }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-secondary/15">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-2 py-1 text-left mono text-[9px] uppercase tracking-wider text-foreground font-bold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {visibilityBlocked ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-2 py-3 mono text-[11px] text-foreground/75 italic"
                >
                  {blockedMessage ?? "Inaccessible — blocked by visibility constraint."}
                </td>
              </tr>
            ) : activeRows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-2 py-1.5 mono text-[11px] text-foreground">
                  No entries.
                </td>
              </tr>
            ) : (
              activeRows.map((row) => {
                const frequencyId = freqId(row);
                const key = frequencyKey(report.reportId, frequencyId, section);
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer select-none"
                    onMouseDown={(e) => {
                      if (e.button === 0) e.preventDefault();
                    }}
                    onClick={(e) => openMenu(e, key, frequencyId)}
                    onContextMenu={(e) => openMenu(e, key, frequencyId)}
                  >
                    <td className="px-1.5 py-1.5 mono text-[11px] text-foreground align-top break-words">
                      <IntRepositoryFrequencyCell stateKey={key} frequencyId={frequencyId} tick={freqTick} />
                    </td>
                    {renderCells(row).map((cell, j) => (
                      <td key={j} className="px-1.5 py-1.5 mono text-[11px] text-foreground align-top break-words">
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {menu && (
        <FreqActionMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onAction={(action, label) => queueAction(action, label)}
        />
      )}

      <ActionConfirmDialog
        pending={pending}
        satelliteName={report.satelliteName}
        onConfirm={() => {
          if (pending) runAction(pending.key, pending.frequencyId, pending.action);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function NovelProtocolTable({
  protocols,
  visibilityBlocked,
  blockedMessage,
}: {
  protocols: IntelDrillDownReport["novelProtocols"];
  visibilityBlocked?: boolean;
  blockedMessage?: string;
}) {
  const headers = ["Frequency", "Protocol", "Remarks"];
  return (
    <div className="panel overflow-hidden border border-primary/30 w-full">
      <div className="px-2 py-1 border-b border-border bg-secondary/20">
        <span className="mono text-[10px] font-bold uppercase tracking-wider text-foreground">
          C3 · Newly Encountered Protocols
        </span>
        <span className="mono text-[9px] text-foreground/70 ml-2">
          ({visibilityBlocked ? 0 : protocols.length})
        </span>
      </div>
      <div className="overflow-x-auto w-full">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[56%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-secondary/15">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-2 py-1 text-left mono text-[9px] uppercase tracking-wider text-foreground font-bold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {visibilityBlocked ? (
              <tr>
                <td colSpan={3} className="px-2 py-3 mono text-[11px] text-foreground/75 italic">
                  {blockedMessage ?? "Analysis disabled — blocked by visibility constraint."}
                </td>
              </tr>
            ) : protocols.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-1.5 mono text-[11px] text-foreground">
                  No novel protocols detected.
                </td>
              </tr>
            ) : (
              protocols.map((p, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5 mono text-[11px]">{p.frequency}</td>
                  <td className="px-2 py-1.5 mono text-[11px]">{p.protocol}</td>
                  <td className="px-2 py-1.5 mono text-[11px]">{p.remarks}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllocateUnitDialog({
  open,
  onClose,
  freqKey,
  frequency,
  report,
  dbUnits,
  allEngagements,
  userLabel,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  freqKey: string;
  frequency: string;
  report: IntelDrillDownReport;
  dbUnits: { id: string; code: string; name: string }[];
  allEngagements: any[];
  userLabel: string;
  onDone: () => void;
}) {
  const [eligible, setEligible] = useState<
    { unitId: string; code: string; name: string; reason: string; matchingBeams: string[]; band: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const freqCtx = resolveFrequencyBeamContext(report, frequency);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getEligibleAllocationUnits(
      report.satelliteName,
      frequency,
      dbUnits,
      allEngagements,
      async (dbUnitId) => {
        const { data } = await supabase
          .from("equipment")
          .select("id, serviceability, category:category_id(name)")
          .eq("unit_id", dbUnitId);
        return data ?? [];
      },
    ).then((u) => {
      setEligible(u);
      setLoading(false);
    });
  }, [open, report.satelliteName, frequency, dbUnits, allEngagements]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="mono text-sm uppercase">Allocate To Unit</DialogTitle>
        </DialogHeader>
        <p className="mono text-[11px] text-foreground mb-1">{frequency}</p>
        <p className="mono text-[9px] text-foreground/70 mb-2">
          {freqCtx.band}-band · beam context: {freqCtx.beamName}
        </p>
        <p className="mono text-[9px] text-foreground/70 mb-2">
          Only units with satellite visibility, matching {freqCtx.band}-band beam access, and engagement capacity are listed.
        </p>
        {loading ? (
          <p className="mono text-[11px]">Evaluating eligible units…</p>
        ) : eligible.length === 0 ? (
          <p className="mono text-[11px] text-amber-700">
            No units meet all visibility, beam, band, and capacity criteria for this frequency.
          </p>
        ) : (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {eligible.map((u) => (
              <li key={u.unitId}>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-sm border border-border hover:border-primary/40 hover:bg-primary/5"
                  onClick={() => {
                    allocateToUnit(freqKey, u.unitId, userLabel, {
                      scannedByUnitId: report.unitId,
                      satelliteName: report.satelliteName,
                      frequencyId: frequency,
                      beamName: u.matchingBeams[0] ?? freqCtx.beamName,
                      band: u.band,
                    });
                    toast.success(`Allocated to Unit ${u.code}`);
                    onDone();
                  }}
                >
                  <div className="mono text-[11px] font-bold">Unit {u.code}</div>
                  <div className="mono text-[9px] text-foreground/70">{u.reason}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
