import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Star } from "lucide-react";
import type { ReactNode } from "react";
import {
  formatAuditShortDate,
  getAuditActionLabel,
  getFrequencyState,
  type AuditEntry,
} from "@/lib/intelFrequencyActions";

/** Dark royal blue — tech-analysis text emphasis (not row selection). */
export const TECH_ANALYSIS_TEXT_CLASS = "text-[#1a237e] dark:text-[#5c6bc0] font-semibold";

function ActionHistoryPopover({
  icon,
  title,
  entries,
}: {
  icon: ReactNode;
  title: string;
  entries: AuditEntry[];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mono text-[11px] leading-none hover:opacity-80 cursor-pointer"
          title={title}
          onClick={(e) => e.stopPropagation()}
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <p className="mono text-[9px] font-bold uppercase tracking-wider text-foreground mb-1.5">{title}</p>
        {entries.length === 0 ? (
          <p className="mono text-[10px] text-foreground/70">No history recorded.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
                <div className="mono text-[10px] font-semibold text-foreground">{getAuditActionLabel(entry)}</div>
                <div className="mono text-[10px] text-foreground/80">{formatAuditShortDate(entry.timestamp)}</div>
                <div className="mono text-[9px] text-foreground/60">By: {entry.userLabel}</div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Repository-only: icon indicator for explicitly marked important frequencies. */
function ImportantIndicator({ stateKey, tick }: { stateKey: string; tick?: number }) {
  void tick;
  const state = getFrequencyState(stateKey);
  if (!state.flags.important) return null;

  return (
    <ActionHistoryPopover
      icon={<Star className="h-3 w-3 fill-primary text-primary" aria-hidden />}
      title="Important — added from INT repository"
      entries={state.auditLog.filter(
        (e) => e.action === "mark_important" || e.action === "clear_important",
      )}
    />
  );
}

/** Shared status chips: ⚙ then 📡 (no important — implicit on Important table). */
function FrequencyStatusChips({ stateKey, tick }: { stateKey: string; tick?: number }) {
  void tick;
  const state = getFrequencyState(stateKey);
  const { flags } = state;
  const chips: { key: string; node: ReactNode }[] = [];

  if (flags.techAnalysis) {
    chips.push({
      key: "tech",
      node: (
        <ActionHistoryPopover
          icon="⚙"
          title="Technical Analysis Requested"
          entries={state.auditLog.filter(
            (e) => e.action === "request_tech_analysis" || e.action === "clear_tech_analysis",
          )}
        />
      ),
    });
  }
  if (flags.allocated) {
    const fromOther =
      state.scannedByUnitId &&
      state.allocatedToUnitId &&
      state.scannedByUnitId !== state.allocatedToUnitId;
    chips.push({
      key: "alloc",
      node: (
        <ActionHistoryPopover
          icon="📡"
          title={
            fromOther
              ? `${state.allocatedToUnitLabel ?? "Allocated"} (scanned by another unit)`
              : (state.allocatedToUnitLabel ?? "Allocated to unit")
          }
          entries={state.auditLog.filter(
            (e) => e.action === "allocate_unit" || e.action === "clear_allocation",
          )}
        />
      ),
    });
  }

  if (chips.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {chips.map((chip, i) => (
        <span key={chip.key} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/50">•</span>}
          <span className={chip.key === "tech" ? TECH_ANALYSIS_TEXT_CLASS : "text-foreground/80"}>{chip.node}</span>
        </span>
      ))}
    </span>
  );
}

/** INT drill-down frequency cell — frequency only on line 1; badge + status on line 2. */
export function IntRepositoryFrequencyCell({
  stateKey,
  frequencyId,
  tick,
}: {
  stateKey: string;
  frequencyId: string;
  tick?: number;
}) {
  void tick;
  const { flags } = getFrequencyState(stateKey);
  const hasMeta = flags.important || flags.techAnalysis || flags.allocated;

  return (
    <div className="min-w-0">
      <span className={`font-bold block leading-tight ${frequencyTechTextClass(stateKey, tick)}`}>
        {frequencyId}
      </span>
      {hasMeta && (
        <div className="mono text-[9px] leading-tight mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0 min-w-0">
          <ImportantIndicator stateKey={stateKey} tick={tick} />
          {(flags.important && (flags.techAnalysis || flags.allocated)) && (
            <span className="text-muted-foreground/50">•</span>
          )}
          <FrequencyStatusChips stateKey={stateKey} tick={tick} />
        </div>
      )}
    </div>
  );
}

/** @deprecated Use IntRepositoryFrequencyCell or ImportantFrequencyMetadata */
export function FrequencyStateSymbols({ stateKey, tick }: { stateKey: string; tick?: number }) {
  return <FrequencyStatusChips stateKey={stateKey} tick={tick} />;
}

/** @deprecated Row-level styling removed — use frequencyTechTextClass on frequency text only. */
export function frequencyRowHighlightClass(_stateKey: string, _tick?: number): string {
  return "";
}

/** Text emphasis on frequency ID when technical analysis is active. */
export function frequencyTechTextClass(stateKey: string, tick?: number): string {
  void tick;
  const { flags } = getFrequencyState(stateKey);
  return flags.techAnalysis ? TECH_ANALYSIS_TEXT_CLASS : "";
}

/** Polarization only — Important table entries are implicitly important (no action badges). */
export function ImportantFrequencyMetadata({
  polarization,
}: {
  refKey?: string;
  polarization: string;
  tick?: number;
}) {
  return (
    <div className="mono text-[9px] text-muted-foreground leading-tight mt-0.5 uppercase tracking-wide">
      {polarization || "—"}
    </div>
  );
}
