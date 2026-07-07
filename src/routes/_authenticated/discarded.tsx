import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import {
  getDiscardedFrequencyRefs,
  getFrequencyState,
  INTEL_FREQ_EVENT,
  restoreFrequency,
  type DiscardedFreqRef,
} from "@/lib/intelFrequencyActions";
import { getUnitIntelName } from "@/lib/intelAnalysisData";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
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
import { Trash2, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/discarded")({
  component: DiscardedFrequenciesPage,
  head: () => ({ meta: [{ title: "Discarded Frequencies — SSACC" }] }),
});

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function classificationLabel(c: DiscardedFreqRef["classification"]): string {
  return c === "productive" ? "Productive" : "Non-Productive";
}

const DISCARDED_GRID_COLS =
  "[grid-template-columns:minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,0.85fr)_5rem_minmax(0,0.8fr)_minmax(0,1fr)_4.5rem]";

function DiscardedFrequenciesPage() {
  return (
    <AppShell
      title="Discarded Frequencies"
      subtitle="90-Day Retention Archive"
      headerIcon={<HomeNavIconBadge icon={Trash2} theme="discarded" size="md" />}
    >
      <DiscardedFrequenciesView />
    </AppShell>
  );
}

export function DiscardedFrequenciesView() {
  const { user } = useAuth();
  const userLabel = user?.email ?? "Operator";
  const [tick, setTick] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState<DiscardedFreqRef | null>(null);

  useEffect(() => {
    const h = () => setTick((n) => n + 1);
    window.addEventListener(INTEL_FREQ_EVENT, h);
    return () => window.removeEventListener(INTEL_FREQ_EVENT, h);
  }, []);

  const entries = useMemo(() => {
    void tick;
    return getDiscardedFrequencyRefs();
  }, [tick]);

  function confirmRestore() {
    if (!restoreTarget) return;
    restoreFrequency(restoreTarget.refKey, userLabel);
    toast.success("Frequency restored to INT repository");
    setRestoreTarget(null);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="mono text-[10px] text-foreground font-medium">
          Retained for <span className="font-bold">90 days</span> from discard date, then auto-expired.
        </p>
        <span className="mono text-[10px] text-foreground shrink-0">
          Total: <span className="font-bold">{entries.length}</span>
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-10 text-center mono text-[11px] text-foreground font-medium">
          No discarded frequencies in retention window.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-x-hidden bg-white">
          <div
            className={`grid ${DISCARDED_GRID_COLS} gap-x-1.5 items-center border-b border-border bg-muted/50 px-2 py-1.5`}
          >
            {["Frequency ID", "Satellite", "Beam / Band", "Discarded", "Classification", "Reason", "Restore"].map((h) => (
              <div
                key={h || "actions"}
                className={`mono text-[9px] uppercase tracking-wider text-foreground font-semibold ${h === "Restore" ? "text-right" : ""}`}
              >
                {h}
              </div>
            ))}
          </div>
          {entries.map((row) => (
            <div
              key={row.id}
              className={`grid ${DISCARDED_GRID_COLS} gap-x-1.5 items-start border-b border-border px-2 py-1.5 bg-white hover:bg-gray-50`}
            >
              <div className="mono text-[11px] font-bold text-foreground break-words bg-white">{row.frequencyId}</div>
              <div className="mono text-[11px] font-semibold text-foreground break-words bg-white">{row.satelliteName}</div>
              <div className="mono text-[10px] text-foreground font-medium break-words bg-white">
                {row.beamName ?? getFrequencyState(row.refKey).beamName ?? "—"}
                {row.band && <span className="text-foreground"> · {row.band}</span>}
              </div>
              <div className="mono text-[10px] text-foreground font-medium tabular-nums bg-white">{fmtDate(row.discardedAt)}</div>
              <div className="mono text-[10px] text-foreground font-medium bg-white">{classificationLabel(row.classification)}</div>
              <div className="mono text-[10px] text-foreground font-medium break-words leading-snug bg-white">
                {row.reason ?? "—"}
                {row.sourceUnitId && (
                  <span className="block text-[9px] text-foreground font-medium mt-0.5">
                    Source: {getUnitIntelName(row.sourceUnitId)}
                  </span>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  title="Restore to INT repository"
                  aria-label={`Restore ${row.frequencyId}`}
                  onClick={() => setRestoreTarget(row)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-primary/30
                             hover:bg-primary/10 text-primary transition-colors mono text-[9px] font-bold uppercase"
                >
                  <RotateCcw className="h-3 w-3 shrink-0" />
                  Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">Confirm Restore</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 pt-1">
                <p className="mono text-[11px] text-foreground font-medium">
                  <span className="font-semibold">Action: </span>
                  Restore to INT Repository
                </p>
                <p className="mono text-[11px] text-foreground font-medium">
                  <span className="font-semibold">Frequency ID: </span>
                  {restoreTarget?.frequencyId}
                </p>
                <p className="mono text-[11px] text-foreground font-medium">
                  <span className="font-semibold">Satellite: </span>
                  {restoreTarget?.satelliteName}
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
                confirmRestore();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-3 flex items-center gap-1.5 mono text-[9px] text-foreground font-medium">
        <Trash2 className="h-3 w-3 text-destructive" />
        Discarded from INT frequency tables via row action · synced via event bus
      </div>
    </>
  );
}
