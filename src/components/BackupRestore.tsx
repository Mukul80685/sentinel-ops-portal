import { useRef, useState } from "react";
import { ChevronDown, Download, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ModuleSnapshotId, ModuleSnapshotPackage } from "@/lib/moduleSnapshots/types";
import {
  exportModuleSnapshot,
  getModuleSnapshotAdapter,
  isSnapshotModuleImplemented,
  restoreModuleSnapshot,
  validateModuleSnapshot,
} from "@/lib/moduleSnapshots";
import { finalizeSnapshotRestore, flushElectronStorage } from "@/lib/electronPersist";

type PendingRestore = {
  package: ModuleSnapshotPackage;
};

function formatSnapshotTimestamp(iso: string | null): string {
  if (!iso) return "Date and time not recorded in this snapshot";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function BackupRestore({ module }: { module: ModuleSnapshotId }) {
  const adapter = getModuleSnapshotAdapter(module);
  const implemented = isSnapshotModuleImplemented(module);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  function handleExportSnapshot() {
    if (!implemented) {
      toast.error(`${adapter.title} snapshots are not available yet.`);
      return;
    }

    try {
      const { package: snapshot, filename } = exportModuleSnapshot(module);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      const unitCount = Array.isArray(snapshot.operational.units)
        ? snapshot.operational.units.length
        : 0;
      const storageTables = Object.keys(snapshot.storage).length;

      toast.success(
        `${adapter.title} snapshot exported (${unitCount} unit${unitCount !== 1 ? "s" : ""}, ${storageTables} data table${storageTables !== 1 ? "s" : ""}).`,
      );
      void flushElectronStorage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export snapshot.");
    }
  }

  function handleImportClick() {
    if (!implemented) {
      toast.error(`${adapter.title} snapshots are not available yet.`);
      return;
    }
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => toast.error("Failed to read snapshot file.");
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result ?? ""));
        const validation = validateModuleSnapshot(module, parsed);
        if (!validation.ok) {
          toast.error(validation.error);
          return;
        }
        setPendingRestore({ package: validation.package });
      } catch {
        toast.error("Invalid snapshot file. Please select a valid module backup.");
      }
    };
    reader.readAsText(file);
  }

  function confirmRestore() {
    const pending = pendingRestore;
    if (!pending) return;

    void (async () => {
      try {
        restoreModuleSnapshot(module, pending.package);
        const timestampLabel = formatSnapshotTimestamp(pending.package.exported_at);
        setPendingRestore(null);
        setRestoreNotice(
          `${adapter.title} restored to snapshot captured on:\n\n${timestampLabel}`,
        );
        await finalizeSnapshotRestore();
        window.setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to restore snapshot.");
      }
    })();
  }

  return (
    <section className="mt-2 pt-2">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div
          className={cn(
            "group/card overflow-hidden rounded-xl border border-white/40 bg-[oklch(0.985_0.008_95)]",
            "shadow-[inset_0_1px_0_oklch(1_0_0/0.75),inset_0_-1px_0_oklch(0_0_0/0.03),0_3px_0_oklch(0_0_0/0.06),0_8px_24px_oklch(0_0_0/0.10)]",
            "transition-all duration-200 ease-out dark:border-white/10 dark:bg-[oklch(0.22_0.012_95)]",
            "hover:-translate-y-0.5 hover:border-emerald-500/25",
            "hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.85),0_4px_0_oklch(0_0_0/0.05),0_14px_30px_oklch(0.16_0.04_155/0.14)]",
            expanded &&
              "border-emerald-500/30 shadow-[inset_0_1px_0_oklch(1_0_0/0.7),0_2px_0_oklch(0_0_0/0.05),0_12px_28px_oklch(0.16_0.04_155/0.16)]",
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "group/trigger flex w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left",
                "transition-colors duration-200",
                "hover:bg-white/55 dark:hover:bg-white/[0.04]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/35",
              )}
            >
              <span
                className={cn(
                  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/40",
                  "bg-gradient-to-br from-emerald-500 to-teal-700 text-white",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_8px_rgba(16,185,129,0.35)]",
                  "transition-all duration-200 ease-out",
                  "group-hover/trigger:scale-110 group-hover/trigger:border-emerald-400/70",
                  "group-hover/trigger:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_0_0_3px_rgba(16,185,129,0.18),0_6px_16px_rgba(16,185,129,0.45)]",
                  expanded &&
                    "scale-105 border-emerald-400/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_0_0_3px_rgba(16,185,129,0.22),0_6px_16px_rgba(16,185,129,0.45)]",
                )}
              >
                <ShieldCheck
                  className={cn(
                    "h-5 w-5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-all duration-200",
                    "group-hover/trigger:scale-105 group-hover/trigger:drop-shadow-[0_0_10px_rgba(255,255,255,0.55)]",
                  )}
                  strokeWidth={2.25}
                />
              </span>

              <div className="min-w-0 flex-1">
                <h2 className="mono text-[11px] font-bold uppercase tracking-[0.14em] text-foreground transition-colors group-hover/trigger:text-emerald-800 dark:group-hover/trigger:text-emerald-300">
                  Data Management
                </h2>
                <p className="mono mt-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground transition-colors group-hover/trigger:text-foreground/75">
                  {implemented
                    ? `Point-in-time snapshot backup for ${adapter.title}`
                    : `${adapter.title} snapshots coming soon`}
                </p>
              </div>

              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200",
                  "group-hover/trigger:text-emerald-700 dark:group-hover/trigger:text-emerald-400",
                  expanded && "rotate-180 text-emerald-700 dark:text-emerald-400",
                )}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t border-black/[0.06] bg-white/30 px-4 py-3.5 dark:border-white/10 dark:bg-black/10">
              <p className="mono mb-3 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Creates a complete module snapshot — not individual table exports
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!implemented}
                  className="mono h-8 cursor-pointer px-3 text-[10px] uppercase tracking-[0.1em] shadow-sm transition-all hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed"
                  onClick={handleExportSnapshot}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Snapshot
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!implemented}
                  className="mono h-8 cursor-pointer border-amber-500/80 bg-white/80 px-3 text-[10px] uppercase tracking-[0.1em] text-amber-800 shadow-sm transition-all hover:-translate-y-px hover:border-amber-500 hover:bg-amber-500/10 hover:shadow-md disabled:cursor-not-allowed dark:bg-transparent dark:text-amber-400"
                  onClick={handleImportClick}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Restore Snapshot
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.snapshot.json"
        className="hidden"
        onChange={handleFileChange}
      />

      <AlertDialog
        open={pendingRestore !== null}
        onOpenChange={(open) => !open && setPendingRestore(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="mono text-sm uppercase tracking-wide">
              Restore snapshot?
            </AlertDialogTitle>
            <AlertDialogDescription className="mono text-[11px]">
              {adapter.restoreWarning}
              {pendingRestore?.package.exported_at ? (
                <span className="mt-2 block text-foreground/80">
                  Snapshot captured: {formatSnapshotTimestamp(pendingRestore.package.exported_at)}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-600/90"
              onClick={confirmRestore}
            >
              Restore Snapshot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={restoreNotice !== null} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="mono text-sm uppercase tracking-wide">
              Snapshot restored
            </DialogTitle>
            <DialogDescription asChild>
              <div className="mono space-y-3 pt-1 text-[11px] text-muted-foreground">
                <p>The module has been replaced with the selected point-in-time snapshot.</p>
                <p className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-center text-sm font-bold text-foreground whitespace-pre-line">
                  {restoreNotice}
                </p>
                <p className="text-xs font-bold">Reloading application…</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </section>
  );
}
