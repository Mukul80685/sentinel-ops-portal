import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState, useCallback, type ComponentType } from "react";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge, type HomeIconTheme } from "@/components/home/HomeNavIcons";
import { useOperationalState } from "@/hooks/useOperationalState";
import { buildUnitActivityFromState, buildUnitOptimizationData, type OperationalFleetState, type UnitOptimizationData } from "@/lib/operationalState";
import {
  CONTROL_CENTER_MODULE_MAP,
  ccHubSearch,
  isControlCenterModule,
  type ControlCenterModuleId,
} from "@/lib/controlCenter";
import { scoreRingPalette, useEngagementRingVisuals } from "@/lib/engagementRingVisuals";
import {
  EngagementDashboardView,
  ImportantFrequenciesView,
  IntelRepositoryView,
  PriorityAllocationView,
} from "@/components/control-center/ControlCenterModuleViews";
import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Globe,
  Info,
  ListOrdered,
  Minus,
  Pencil,
  Plus,
  Satellite as SatIcon,
  Search,
  Shield,
  Star,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/control-center")({
  ssr: false,
  component: ControlCenterPage,
  head: () => ({ meta: [{ title: "Control Center — SSACC" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const moduleRaw = typeof search.module === "string" ? search.module : undefined;
    const module = moduleRaw && isControlCenterModule(moduleRaw) ? moduleRaw : undefined;
    return {
      unit: typeof search.unit === "string" ? search.unit : undefined,
      module,
    };
  },
  beforeLoad: ({ search }) => {
    if (!search.module) {
      throw redirect({ to: "/control-center", search: ccHubSearch("engagement") });
    }
  },
});

// ── TYPES ──────────────────────────────────────────────────────────────────

type MetricTrend     = "improving" | "stable" | "degrading";
type InsightCategory = "Capability" | "Coverage" | "Output" | "Utilization";
type Severity        = "High" | "Medium" | "Low";

type Insight = {
  id: string;
  title: string;
  detail: string;
  units?: string[];
  regions?: string[];
  category: InsightCategory;
  severity: Severity;
  trend: MetricTrend;
};

type BandType = "C-band" | "KU band" | "KA band" | "Extended C-band";
type PolType  = "C-EDGE" | "KU-VL" | "KU-HL" | "KU-HH" | "KU-HV" | "CH-CV" | "RF-CP" | "LH-CP";

type SatScanData = {
  satellite: string;
  band: BandType;
  pol: PolType;
  scanned: number;
  analyzed: number;
  productive: number;
  nonProductive: number;
};

type SatHistory = {
  satellite: string;
  time: string;
  outcome: "productive" | "mixed" | "non-productive";
};

type UnitScanData = {
  activeSats: SatScanData[];
  history: SatHistory[];
};

// Optimization Engine types
type OptStatus = "OPTIMIZED" | "SUBOPTIMAL" | "MISALLOCATED";
type FactorKey = "resource" | "priority" | "serviceability";

const OPT_FACTOR_DEFS: Array<{ key: FactorKey; label: string; weight: number; abbr: string }> = [
  { key: "resource",       label: "Resource Utilization", weight: 1 / 3, abbr: "R" },
  { key: "priority",       label: "Prioritization",       weight: 1 / 3, abbr: "P" },
  { key: "serviceability", label: "Serviceability",       weight: 1 / 3, abbr: "S" },
];

// ── DECISION INSIGHTS (mock — no unit badges until correlation engine built) ─

const DECISION_INSIGHTS: Insight[] = [
  { id: "dc1", severity: "High",   category: "Capability",   trend: "degrading", title: "One or more units critically below operational threshold",          detail: "Check Capability panel for units scoring below 50%. Assignment and scanning may be impacted until recovery." },
  { id: "dc2", severity: "High",   category: "Coverage",     trend: "stable",    title: "Coverage blind spots detected in assigned satellite regions",       detail: "Some satellite regions may have no unit assigned. Review the Satellite Visibility Matrix to confirm coverage gaps." },
  { id: "dc3", severity: "High",   category: "Output",       trend: "degrading", title: "INT output below threshold for one or more units",                  detail: "Units with zero scanned frequencies this cycle may have equipment or engagement issues. Check Output panel." },
  { id: "dc4", severity: "Medium", category: "Utilization",  trend: "degrading", title: "Satellite load imbalance detected across units",                    detail: "Some units are overloaded while others remain idle. Review Utilization panel and rebalance assignments." },
  { id: "dc5", severity: "Medium", category: "Coverage",     trend: "degrading", title: "Single-unit dependency risk in one or more regions",                detail: "Regions covered by only one unit are vulnerable to complete coverage loss on any disruption to that unit." },
  { id: "dc6", severity: "Medium", category: "Output",       trend: "degrading", title: "INT productivity below 70% target for some units",                  detail: "Units with low productive-to-scanned ratios may need scan methodology review or equipment serviceability check." },
  { id: "dc7", severity: "Low",    category: "Coverage",     trend: "stable",    title: "Multi-unit overlap detected — deconfliction opportunity",           detail: "Multiple units assigned to same region represents redundancy. Review for rebalancing toward uncovered regions." },
  { id: "dc8", severity: "Low",    category: "Output",       trend: "improving", title: "High-efficiency units identified — review as reference model",      detail: "Units consistently above 80% productivity can serve as methodology benchmarks for lower-performing units." },
];

// ── SCAN HISTORY STORE ─────────────────────────────────────────────────────

const SCAN_HISTORY_KEY = "ssacc_scan_history";
const MAX_HISTORY = 5;

function loadScanHistory(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(SCAN_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveScanHistory(data: Record<string, string[]>) {
  try { localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(data)); } catch {}
}

function addToScanHistory(unitId: string, satName: string) {
  const all = loadScanHistory();
  const current = all[unitId] ?? [];
  const updated = [satName, ...current.filter(s => s !== satName)].slice(0, MAX_HISTORY);
  all[unitId] = updated;
  saveScanHistory(all);
}

// ── REAL-DATA DERIVATION HELPERS ───────────────────────────────────────────

function deriveCapabilityData(units: any[], equipment: any[]) {
  return units.map((unit) => {
    const unitEq = equipment.filter((e) => e.unit_id === unit.id);
    const total = unitEq.length;
    const operational = unitEq.filter((e) => e.serviceability === "Operational").length;
    const score = total === 0 ? 0 : Math.round((operational / total) * 100);
    const gaps = unitEq
      .filter((e) => e.serviceability !== "Operational")
      .map((e) => `${e.category?.name ?? "Equipment"}: ${e.name} — ${e.serviceability}`);
    return { unitId: unit.id, unitLabel: unit.name, score, serviceable: operational, total, gaps };
  });
}

function deriveIntOutput(units: any[], intelRows: any[]) {
  return units.map((unit) => {
    const rows = intelRows.filter((r) => r.unit_id === unit.id);
    const total = rows.length;
    const productive = rows.filter((r) =>
      typeof r.summary === "string" && r.summary.includes("productive signal")
    ).length;
    const trend: MetricTrend = total === 0
      ? "degrading"
      : productive / total >= 0.7
        ? "improving"
        : productive / total >= 0.4
          ? "stable"
          : "degrading";
    return { unitId: unit.id, unitLabel: unit.name, total, productive, trend };
  });
}

function deriveSystemMetrics(
  capData: ReturnType<typeof deriveCapabilityData>,
  intData: ReturnType<typeof deriveIntOutput>,
  fleetUnits: any[],
): Record<string, { value: number; trend: MetricTrend; label: string; sublabel: string }> {
  const avgCap = capData.length === 0 ? 0 : Math.round(capData.reduce((s, d) => s + d.score, 0) / capData.length);
  const totalIntel = intData.reduce((s, d) => s + d.total, 0);
  const totalProd  = intData.reduce((s, d) => s + d.productive, 0);
  const outputPct  = totalIntel === 0 ? 0 : Math.round(totalProd / totalIntel * 100);
  const totalActive    = fleetUnits.reduce((s, u) => s + (u.activeSatellites ?? 0), 0);
  const totalAllocated = fleetUnits.reduce((s, u) => s + (u.allocatedSatellites ?? 0), 0);
  const utilPct = totalAllocated === 0 ? 0 : Math.round(Math.min(100, (totalActive / totalAllocated) * 100));
  const totalVisible   = fleetUnits.reduce((s, u) => s + (u.visibleSatellites ?? 0), 0);
  const coveragePct = totalVisible === 0 ? 0 : Math.round(Math.min(100, (totalAllocated / totalVisible) * 100));
  const readiness = Math.round((avgCap * 0.6) + (outputPct * 0.4));
  const capTrend: MetricTrend  = avgCap      >= 75 ? "improving" : avgCap      >= 50 ? "stable" : "degrading";
  const outTrend: MetricTrend  = outputPct   >= 70 ? "improving" : outputPct   >= 40 ? "stable" : "degrading";
  const utilTrend: MetricTrend = utilPct     >= 70 ? "improving" : utilPct     >= 40 ? "stable" : "degrading";
  const covTrend: MetricTrend  = coveragePct >= 70 ? "improving" : coveragePct >= 40 ? "stable" : "degrading";
  return {
    readiness:   { value: readiness,   trend: capTrend,  label: "System Readiness",       sublabel: "from Capability + Serviceability" },
    coverage:    { value: coveragePct, trend: covTrend,  label: "Coverage Effectiveness", sublabel: "from Visibility + Priority"       },
    output:      { value: outputPct,   trend: outTrend,  label: "INT Output Efficiency",  sublabel: "from INT Repository"              },
    utilization: { value: utilPct,     trend: utilTrend, label: "Resource Utilization",   sublabel: "from Engagement + Assignments"    },
  };
}

// ── HELPERS ────────────────────────────────────────────────────────────────

function TrendChip({ trend }: { trend: MetricTrend }) {
  if (trend === "improving") return (
    <span className="inline-flex items-center gap-0.5 mono text-[8px] uppercase tracking-wider text-emerald-600 font-bold">
      <TrendingUp className="h-2.5 w-2.5" /> Improving
    </span>
  );
  if (trend === "degrading") return (
    <span className="inline-flex items-center gap-0.5 mono text-[8px] uppercase tracking-wider text-destructive font-bold">
      <TrendingDown className="h-2.5 w-2.5" /> Degrading
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 mono text-[8px] uppercase tracking-wider text-muted-foreground font-medium">
      <Minus className="h-2.5 w-2.5" /> Stable
    </span>
  );
}

function catBadgeCls(cat: InsightCategory) {
  if (cat === "Capability")  return "bg-primary/8 border-primary/25 text-primary";
  if (cat === "Coverage")    return "bg-sky-500/10 border-sky-500/25 text-sky-600";
  if (cat === "Output")      return "bg-amber-400/10 border-amber-400/25 text-amber-500";
  return "bg-muted/80 border-border text-muted-foreground";
}

function sevCls(sev: Severity) {
  if (sev === "High")   return { dot: "bg-destructive", border: "border-l-destructive/60", bg: "hover:bg-destructive/4" };
  if (sev === "Medium") return { dot: "bg-amber-400",   border: "border-l-amber-400/60",   bg: "hover:bg-amber-400/4"   };
  return { dot: "bg-muted-foreground/40", border: "border-l-border", bg: "hover:bg-secondary/30" };
}

function scoreColor(n: number) {
  if (n >= 80) return "text-emerald-600";
  if (n >= 50) return "text-amber-500";
  return "text-destructive";
}

function scorebar(n: number) {
  if (n >= 80) return "bg-emerald-500";
  if (n >= 50) return "bg-amber-400";
  return "bg-destructive/80";
}

function formatBandPol(band: BandType, pol: PolType): string {
  const b = band === "Extended C-band" ? "EXT-C" : band === "C-band" ? "C" : band === "KU band" ? "KU" : "KA";
  let p = pol as string;
  if (p.startsWith("KU-")) p = p.slice(3);
  else if (p.startsWith("C-")) p = p.slice(2);
  else if (p.startsWith("CH-")) p = p.slice(3);
  return `${b} · ${p}`;
}

function riskLevel(data: UnitOptimizationData): "Low" | "Medium" | "High" {
  const hasCritical = OPT_FACTOR_DEFS.some((f) => data[f.key].severity === "critical");
  if (hasCritical || data.compositeScore < 45) return "High";
  if (data.compositeScore < 70) return "Medium";
  return "Low";
}

// ── DOMAIN PANEL WRAPPER ───────────────────────────────────────────────────

function DomainPanel({ id, label, icon: Icon, sources, summaryNode, children }: {
  id: "A" | "B" | "C" | "D";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sources: string;
  summaryNode?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="panel overflow-hidden flex flex-col">
      <div className="flex items-start justify-between px-4 py-2.5 border-b border-border bg-secondary/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="mono text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-sm leading-none">{id}</span>
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="mono text-xs font-bold uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-right">
          {summaryNode}
          <div className="mono text-[8px] text-muted-foreground/50 mt-0.5 leading-tight">{sources}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ── SECTION 1 — GLOBAL COMMAND SUMMARY BAR ─────────────────────────────────

function SystemReadinessBar({ metrics }: { metrics: ReturnType<typeof deriveSystemMetrics> }) {
  const keys = ["readiness", "coverage", "output", "utilization"] as const;
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-secondary/20">
        <span className="label-eyebrow flex items-center gap-1.5">
          <Zap className="h-3 w-3" /> Global Command Summary
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
        {keys.map((key, i) => {
          const m = metrics[key];
          const vColor   = m.value >= 75 ? "text-emerald-600" : m.value >= 55 ? "text-amber-500" : "text-destructive";
          const barColor = m.value >= 75 ? "bg-emerald-500"   : m.value >= 55 ? "bg-amber-400"   : "bg-destructive/80";
          const isOdd = i % 2 !== 0;
          return (
            <div key={key} className={`px-5 py-3.5 flex flex-col gap-2 ${isOdd ? "lg:border-none" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={`mono text-2xl font-bold tabular-nums leading-none ${vColor}`}>{m.value}%</div>
                  <div className="mono text-[10px] font-bold uppercase tracking-wider text-foreground/80 mt-1">{m.label}</div>
                </div>
                <TrendChip trend={m.trend} />
              </div>
              <div className="h-1 w-full rounded-full bg-border overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${m.value}%` }} />
              </div>
              <div className="mono text-[8px] text-muted-foreground/50">{m.sublabel}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SECTION 2A — CAPABILITY PANEL ─────────────────────────────────────────

function CapabilityPanel({ capData }: { capData: ReturnType<typeof deriveCapabilityData> }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const avg = capData.length === 0 ? 0 : Math.round(capData.reduce((s, d) => s + d.score, 0) / capData.length);
  const criticalCount = capData.filter(d => d.score < 50).length;

  return (
    <DomainPanel id="A" label="Capability" icon={Shield}
      sources="Resource Inventory · Serviceability State"
      summaryNode={
        <div className="flex items-center gap-2 justify-end">
          <span className={`mono text-sm font-bold tabular-nums ${scoreColor(avg)}`}>{avg}% avg</span>
          {criticalCount > 0 && (
            <span className="px-1 py-0.5 mono text-[8px] font-bold bg-destructive/10 border border-destructive/30 text-destructive rounded-sm">
              {criticalCount} critical
            </span>
          )}
        </div>
      }>
      <div className="divide-y divide-border">
        {capData.map(d => {
          const isExp = expandedId === d.unitId;
          const healthLabel = d.score >= 80 ? "OK" : d.score >= 50 ? "WARN" : "CRIT";
          const healthCls = d.score >= 80
            ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/8"
            : d.score >= 50 ? "text-amber-500 border-amber-400/30 bg-amber-400/8"
            : "text-destructive border-destructive/30 bg-destructive/8";
          const shortLabel = d.unitLabel.replace("GATE ", "GT-");
          return (
            <div key={d.unitId}>
              <button type="button" onClick={() => setExpandedId(isExp ? null : d.unitId)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors hover:bg-secondary/20 ${isExp ? "bg-secondary/15" : ""}`}>
                <span className="mono text-[10px] font-bold text-foreground w-12 shrink-0">{shortLabel}</span>
                <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                  <div className={`h-full rounded-full ${scorebar(d.score)}`} style={{ width: `${d.score}%` }} />
                </div>
                <span className={`mono text-[10px] font-bold tabular-nums w-8 text-right ${scoreColor(d.score)}`}>{d.score}%</span>
                <span className="mono text-[9px] text-muted-foreground tabular-nums w-8 text-right">{d.serviceable}/{d.total}</span>
                <span className={`mono text-[8px] font-bold px-1 py-0.5 rounded-sm border w-10 text-center shrink-0 ${healthCls}`}>{healthLabel}</span>
                {d.gaps.length > 0
                  ? <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${isExp ? "rotate-180" : ""}`} />
                  : <span className="w-3 shrink-0" />}
              </button>
              {isExp && d.gaps.length > 0 && (
                <div className="px-3 pb-2 pt-1 bg-destructive/3 border-t border-destructive/10">
                  {d.gaps.map(g => (
                    <div key={g} className="flex items-center gap-1.5 mono text-[9px] text-destructive py-0.5">
                      <span className="h-1 w-1 rounded-full bg-destructive shrink-0" />
                      {g}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DomainPanel>
  );
}

// ── SECTION 2B — COVERAGE PANEL (pending visibility matrix) ───────────────

function CoveragePanel() {
  return (
    <DomainPanel id="B" label="Coverage" icon={Globe}
      sources="Satellite Visibility Matrix · Priority Allocation"
      summaryNode={
        <span className="mono text-[9px] text-muted-foreground/60 italic">Pending integration</span>
      }>
      <div className="flex flex-col items-center justify-center px-4 py-8 gap-3 text-center">
        <Globe className="h-8 w-8 text-muted-foreground/20" />
        <div className="mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
          Awaiting Visibility Matrix
        </div>
        <div className="mono text-[9px] text-muted-foreground/40 leading-relaxed max-w-[160px]">
          Coverage data will be derived from the Satellite Visibility Matrix once integration is complete.
        </div>
      </div>
    </DomainPanel>
  );
}

// ── SECTION 2C — OUTPUT PANEL ─────────────────────────────────────────────

function OutputPanel({ intData }: { intData: ReturnType<typeof deriveIntOutput> }) {
  const totalScanned = intData.reduce((s, d) => s + d.total, 0);
  const totalProd    = intData.reduce((s, d) => s + d.productive, 0);
  const sysOutputPct = totalScanned === 0 ? 0 : Math.round(totalProd / totalScanned * 100);

  return (
    <DomainPanel id="C" label="Output" icon={Activity}
      sources="INT Repository"
      summaryNode={
        <span className={`mono text-sm font-bold tabular-nums ${scoreColor(sysOutputPct)}`}>
          {sysOutputPct}% system
        </span>
      }>
      <table className="w-full mono text-[11px]">
        <thead>
          <tr className="border-b border-border bg-secondary/10">
            <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Unit</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Scanned</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Prod.</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Rate</th>
            <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {intData.map(d => {
            const pct = d.total === 0 ? 0 : Math.round(d.productive / d.total * 100);
            const shortLabel = d.unitLabel.replace("GATE ", "GT-");
            return (
              <tr key={d.unitId} className="hover:bg-secondary/15 transition-colors">
                <td className="px-3 py-1.5 font-bold text-foreground">{shortLabel}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-foreground/80">
                  {d.total === 0 ? <span className="text-muted-foreground/40">—</span> : d.total}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-emerald-600">
                  {d.total === 0 ? <span className="text-muted-foreground/40">—</span> : d.productive}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {d.total > 0
                    ? <span className={`font-bold tabular-nums ${scoreColor(pct)}`}>{pct}%</span>
                    : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="px-3 py-1.5"><TrendChip trend={d.trend} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DomainPanel>
  );
}

// ── SECTION 2D — UTILIZATION PANEL ────────────────────────────────────────

function utilStatus(n: number, optimal: number): "overloaded" | "high" | "optimal" | "under" | "idle" {
  if (n > optimal * 1.3) return "overloaded";
  if (n > optimal)       return "high";
  if (n >= optimal * 0.5) return "optimal";
  if (n >= 1)            return "under";
  return "idle";
}

const utilStatusStyle: Record<ReturnType<typeof utilStatus>, { cls: string; bar: string; label: string }> = {
  overloaded: { cls: "text-amber-500 bg-amber-400/8 border-amber-400/25",       bar: "bg-amber-400",          label: "OVERLOAD" },
  high:       { cls: "text-primary/80 bg-primary/8 border-primary/22",          bar: "bg-primary",            label: "HIGH"     },
  optimal:    { cls: "text-emerald-600 bg-emerald-500/8 border-emerald-500/25", bar: "bg-emerald-500",        label: "OPTIMAL"  },
  under:      { cls: "text-muted-foreground bg-muted/50 border-border",         bar: "bg-muted-foreground/40",label: "UNDER"    },
  idle:       { cls: "text-destructive/70 bg-destructive/5 border-destructive/20", bar: "bg-destructive/40", label: "IDLE"     },
};

function UtilizationPanel({ unitLoads }: { unitLoads: Record<string, number> }) {
  const keys = Object.keys(unitLoads);
  const optimalLoad = Math.round(keys.reduce((s, u) => s + (unitLoads[u] ?? 0), 0) / Math.max(1, keys.length));
  const overloaded = keys.filter(u => utilStatus(unitLoads[u] ?? 0, optimalLoad) === "overloaded").length;
  const idle       = keys.filter(u => utilStatus(unitLoads[u] ?? 0, optimalLoad) === "idle").length;
  const maxLoad    = Math.max(...keys.map(u => unitLoads[u] ?? 0), optimalLoad, 1);

  return (
    <DomainPanel id="D" label="Utilization" icon={BarChart3}
      sources="Engagement Status · Assignment Patterns"
      summaryNode={
        <div className="flex items-center gap-1.5 justify-end">
          {overloaded > 0 && (
            <span className="px-1 py-0.5 mono text-[8px] font-bold bg-amber-400/10 border border-amber-400/30 text-amber-500 rounded-sm">{overloaded} overloaded</span>
          )}
          {idle > 0 && (
            <span className="px-1 py-0.5 mono text-[8px] font-bold bg-destructive/8 border border-destructive/25 text-destructive/70 rounded-sm">{idle} idle</span>
          )}
        </div>
      }>
      <div className="divide-y divide-border">
        <div className="px-3 py-1.5 flex items-center gap-2 bg-secondary/10">
          <span className="mono text-[8px] text-muted-foreground/60 flex-1">
            Avg load per unit: {optimalLoad} satellites
          </span>
          <span className="mono text-[8px] text-muted-foreground/60">Assigned / Avg / Max</span>
        </div>
        {keys.map(u => {
          const n   = unitLoads[u] ?? 0;
          const st  = utilStatus(n, optimalLoad);
          const sty = utilStatusStyle[st];
          const barW = `${Math.min(100, (n / maxLoad) * 100)}%`;
          const optW = `${Math.min(100, (optimalLoad / maxLoad) * 100)}%`;
          const shortLabel = u.replace("GATE ", "GT-");
          return (
            <div key={u} className="px-3 py-2 flex items-center gap-2">
              <span className="mono text-[10px] font-bold text-foreground w-12 shrink-0">{shortLabel}</span>
              <div className="flex-1 relative h-2 rounded-full bg-border overflow-hidden">
                <div className={`h-full rounded-full ${sty.bar}`} style={{ width: barW }} />
                <div className="absolute top-0 h-full w-px bg-foreground/20" style={{ left: optW }} />
              </div>
              <span className="mono text-[10px] tabular-nums font-bold text-foreground/80 w-5 text-right shrink-0">{n}</span>
              <span className={`mono text-[8px] font-bold px-1 py-0.5 rounded-sm border w-[60px] text-center shrink-0 ${sty.cls}`}>{sty.label}</span>
            </div>
          );
        })}
      </div>
    </DomainPanel>
  );
}

// ── SECTION 3 — DECISION CORE ──────────────────────────────────────────────

const INSIGHT_CATS = ["All", "Capability", "Coverage", "Output", "Utilization"] as const;
type CatFilter = typeof INSIGHT_CATS[number];

function InsightCard({ insight, isOpen, onToggle }: { insight: Insight; isOpen: boolean; onToggle: () => void }) {
  const sev = sevCls(insight.severity);
  const SevIcon = insight.severity === "Low" ? Info : AlertTriangle;
  const sevIconCls = insight.severity === "High" ? "text-destructive" : insight.severity === "Medium" ? "text-amber-500" : "text-muted-foreground/60";
  return (
    <div className={`border-l-2 ${sev.border} transition-colors`}>
      <button type="button" onClick={onToggle}
        className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left ${sev.bg} transition-colors`}>
        <SevIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${sevIconCls}`} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="mono text-[10px] font-bold text-foreground leading-snug">{insight.title}</div>
          <div className="flex flex-wrap items-center gap-1">
            <span className={`px-1 py-0.5 rounded-sm border mono text-[8px] font-bold ${catBadgeCls(insight.category)}`}>{insight.category}</span>
            <TrendChip trend={insight.trend} />
          </div>
        </div>
        <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="px-4 pb-3 pt-1 bg-secondary/10 border-t border-border space-y-2">
          <p className="mono text-[9px] text-muted-foreground leading-snug">{insight.detail}</p>
          <div className="mono text-[8px] text-muted-foreground/40 italic">Future: drill-down correlation engine →</div>
        </div>
      )}
    </div>
  );
}

function DecisionCore({ insights }: { insights: Insight[] }) {
  const [catFilter, setCatFilter] = useState<CatFilter>("All");
  const [openIds,   setOpenIds]   = useState<Set<string>>(new Set(["dc1"]));
  const filtered   = catFilter === "All" ? insights : insights.filter(i => i.category === catFilter);
  const highCount  = filtered.filter(i => i.severity === "High").length;
  const medCount   = filtered.filter(i => i.severity === "Medium").length;
  function toggleInsight(id: string) {
    setOpenIds(p => { const next = new Set(p); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  return (
    <div className="panel overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/20 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="mono text-[9px] font-bold text-destructive bg-destructive/10 border border-destructive/25 px-1.5 py-0.5 rounded-sm">DC</span>
            <span className="mono text-xs font-bold uppercase tracking-wide">Decision Core</span>
          </div>
          <div className="flex items-center gap-1.5">
            {highCount > 0 && <span className="px-1.5 py-0.5 mono text-[9px] font-bold bg-destructive/10 border border-destructive/30 text-destructive rounded-sm">{highCount} high</span>}
            {medCount  > 0 && <span className="px-1.5 py-0.5 mono text-[9px] font-bold bg-amber-400/10 border border-amber-400/30 text-amber-500 rounded-sm">{medCount} med</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {INSIGHT_CATS.map(cat => (
            <button key={cat} type="button" onClick={() => setCatFilter(cat)}
              className={`h-5 px-2 mono text-[8px] uppercase tracking-wider rounded-sm border transition-colors ${catFilter === cat ? cat === "All" ? "border-primary/40 bg-primary/10 text-primary font-bold" : catBadgeCls(cat as InsightCategory) + " font-bold" : "border-border text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {(["High", "Medium", "Low"] as Severity[]).flatMap(sev =>
          filtered.filter(i => i.severity === sev).map(insight => (
            <InsightCard key={insight.id} insight={insight} isOpen={openIds.has(insight.id)} onToggle={() => toggleInsight(insight.id)} />
          ))
        )}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center mono text-[11px] text-muted-foreground">No insights in this category.</div>
        )}
      </div>
      <div className="px-4 py-2 border-t border-border bg-secondary/10 shrink-0">
        <div className="flex items-center gap-2 text-muted-foreground/40 mono text-[8px] uppercase tracking-wider">
          <Plus className="h-2.5 w-2.5" />
          <span>Future: Frequency correlation engine · Allocation optimizer · Drill-down</span>
        </div>
      </div>
    </div>
  );
}

// ── UNIT ACTIVITY SNAPSHOT — TABLE COMPONENTS ──────────────────────────────

function outcomeColor(o: SatHistory["outcome"]) {
  return o === "productive" ? "bg-emerald-500" : o === "mixed" ? "bg-amber-400" : "bg-destructive/70";
}

function outcomeLabel(o: SatHistory["outcome"]) {
  return o === "productive" ? "text-emerald-600" : o === "mixed" ? "text-amber-500" : "text-destructive/80";
}

// ── SCAN HISTORY CELL — editable, rolling-5 ───────────────────────────────

function ScanHistoryCell({ unitId }: { unitId: string }) {
  const [history, setHistory] = useState<string[]>(() => loadScanHistory()[unitId] ?? []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [historyDrop, setHistoryDrop] = useState(false);

  const needsInit = history.length === 0;

  const handleAdd = useCallback(() => {
    const name = draft.trim();
    if (!name) return;
    addToScanHistory(unitId, name);
    const updated = loadScanHistory()[unitId] ?? [];
    setHistory(updated);
    setDraft("");
    setEditing(false);
  }, [draft, unitId]);

  return (
    <td className="px-3 py-3 w-44 align-top">
      {needsInit && !editing ? (
        <button onClick={() => setEditing(true)}
          className="flex items-center gap-1 mono text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
          <Pencil className="h-3 w-3" /> Enter history
        </button>
      ) : editing ? (
        <div className="flex flex-col gap-1">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setEditing(false); }}
            placeholder="Satellite name"
            className="mono text-[10px] bg-secondary border border-border rounded-sm px-1.5 py-1 text-foreground w-full outline-none focus:border-primary/50"
          />
          <div className="flex gap-1">
            <button onClick={handleAdd} className="mono text-[9px] px-1.5 py-0.5 bg-primary/10 border border-primary/25 text-primary rounded-sm hover:bg-primary/20">Add</button>
            <button onClick={() => setEditing(false)} className="mono text-[9px] px-1.5 py-0.5 border border-border text-muted-foreground rounded-sm hover:bg-secondary">Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          <button onClick={() => setHistoryDrop(p => !p)}
            className="flex items-center gap-1.5 w-full text-left group/hist">
            <span className="mono text-[11px] font-medium text-foreground truncate max-w-[110px] group-hover/hist:text-primary transition-colors">{history[0]}</span>
            <button onClick={e => { e.stopPropagation(); setEditing(true); }}
              className="shrink-0 text-muted-foreground/40 hover:text-primary transition-colors ml-auto">
              <Pencil className="h-2.5 w-2.5" />
            </button>
            {historyDrop ? <ChevronUp className="h-3 w-3 shrink-0 text-foreground" /> : <ChevronDown className="h-3 w-3 shrink-0 text-foreground" />}
          </button>
          {historyDrop && (
            <div className="mt-1.5 border-t border-border pt-1.5">
              <div className="mono text-[9px] uppercase tracking-[0.18em] text-foreground mb-1.5 font-semibold">Last {history.length} Scanned</div>
              {history.map((sat, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  <span className="mono text-[9px] text-muted-foreground/50 w-3 shrink-0">{i + 1}</span>
                  <span className="mono text-[10px] font-medium text-foreground truncate flex-1">{sat}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </td>
  );
}

function UnitRow({ unit, unitId, data, idx }: { unit: string; unitId: string; data: UnitScanData; idx: number }) {
  const [selSat,      setSelSat     ] = useState(0);
  const [activeDrop,  setActiveDrop ] = useState(false);

  if (data.activeSats.length === 0) {
    return (
      <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors align-top group">
        <td className="px-3 py-3 mono text-[11px] font-semibold text-foreground w-8">{idx}</td>
        <td className="px-3 py-3 w-24"><span className="mono text-[13px] font-bold text-foreground whitespace-nowrap">{unit}</span></td>
        <td className="px-3 py-3 w-52"><span className="mono text-[11px] font-medium text-foreground uppercase tracking-wide">No active scans</span></td>
        <td className="px-3 py-3 w-20"><span className="mono text-[14px] font-bold text-foreground">—</span></td>
        <td className="px-3 py-3 w-20"><span className="mono text-[14px] font-bold text-foreground">—</span></td>
        <td className="px-3 py-3 w-20"><span className="mono text-[14px] font-bold text-foreground">—</span></td>
        <td className="px-3 py-3 w-32"><span className="mono text-[11px] font-medium text-foreground">—</span></td>
        <ScanHistoryCell unitId={unitId} />
      </tr>
    );
  }

  const sat     = data.activeSats[selSat];
  const pending = sat.scanned - sat.analyzed;
  const pct     = sat.analyzed > 0 ? Math.round((sat.productive / sat.analyzed) * 100) : 0;
  const bp      = formatBandPol(sat.band, sat.pol);

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors align-top group">
      <td className="px-3 py-3 mono text-[11px] font-semibold text-foreground w-8">{idx}</td>
      <td className="px-3 py-3 w-24"><span className="mono text-[13px] font-bold text-foreground whitespace-nowrap">{unit}</span></td>
      <td className="px-3 py-3 w-52 align-top">
        <button onClick={() => { setActiveDrop(p => !p); }} className="flex items-center gap-1.5 w-full text-left group/btn">
          <span className="mono text-[12px] font-semibold text-foreground truncate max-w-[130px] group-hover/btn:text-primary transition-colors">{sat.satellite}</span>
          <span className="mono text-[9px] text-primary bg-primary/8 border border-primary/15 px-1 py-0.5 rounded-sm leading-none shrink-0 font-bold">{data.activeSats.length}</span>
          {activeDrop ? <ChevronUp className="h-3 w-3 shrink-0 text-foreground" /> : <ChevronDown className="h-3 w-3 shrink-0 text-foreground" />}
        </button>
        {activeDrop && (
          <div className="mt-1.5 border-t border-border pt-1.5">
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-foreground mb-1.5 font-semibold">Satellites Being Scanned: {data.activeSats.length}</div>
            {data.activeSats.map((s, i) => (
              <button key={s.satellite} onClick={() => { setSelSat(i); setActiveDrop(false); }}
                className={`flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded-sm hover:bg-secondary/50 transition-colors ${i === selSat ? "bg-primary/6" : ""}`}>
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${i === selSat ? "bg-primary" : "bg-border"}`} />
                <span className={`mono text-[11px] truncate ${i === selSat ? "text-primary font-semibold" : "text-foreground font-medium"}`}>{s.satellite}</span>
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-3 w-20"><span className="mono text-[14px] font-bold text-foreground leading-none">{sat.scanned}</span></td>
      <td className="px-3 py-3 w-20"><span className="mono text-[14px] font-bold text-foreground leading-none">{sat.analyzed}</span></td>
      <td className="px-3 py-3 w-20"><span className={`mono text-[14px] font-bold leading-none ${pending > 0 ? "text-amber-600" : "text-foreground"}`}>{pending}</span></td>
      <td className="px-3 py-3 w-32">
        <span className="mono text-[10px] font-semibold text-primary bg-primary/5 border border-primary/15 px-1.5 py-0.5 rounded-sm leading-none whitespace-nowrap">{bp}</span>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="mono text-[10px] font-bold text-emerald-600">P:{sat.productive}</span>
          <span className="mono text-[10px] font-semibold text-foreground">N:{sat.nonProductive}</span>
          <span className={`mono text-[10px] font-bold ${scoreColor(pct)}`}>{pct}%</span>
        </div>
        <div className="mt-1 w-full h-1 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full ${scorebar(pct)}`} style={{ width: `${pct}%` }} />
        </div>
      </td>
      <ScanHistoryCell unitId={unitId} />
    </tr>
  );
}

function UnitActivitySnapshot() {
  const [expanded, setExpanded] = useState(false);
  const { fleetState, engagements, intelRows, equipment, isLoading } = useOperationalState();

  const unitRows = useMemo(() => {
    if (!fleetState) return [];
    return [...fleetState.units].sort((a, b) => a.unitCode.localeCompare(b.unitCode));
  }, [fleetState]);

  const activityByUnitId = useMemo(() => {
    if (!fleetState) return new Map<string, UnitScanData>();
    const map = new Map<string, UnitScanData>();
    for (const state of fleetState.units) {
      const activity = buildUnitActivityFromState(state, engagements, intelRows, equipment);
      map.set(state.unitDbId, {
        activeSats: activity.activeSats.map((s) => ({
          satellite: s.satellite,
          band: s.band as BandType,
          pol: s.pol as PolType,
          scanned: s.scanned,
          analyzed: s.analyzed,
          productive: s.productive,
          nonProductive: s.nonProductive,
        })),
        history: activity.history,
      });
    }
    return map;
  }, [fleetState, engagements, intelRows, equipment]);

  const visible = expanded ? unitRows : unitRows.slice(0, 4);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-2.5">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="mono text-[12px] font-bold uppercase tracking-wider text-foreground">Unit Activity Snapshot</span>
          <span className="mono text-[9px] uppercase tracking-[0.18em] text-primary bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded-sm leading-none font-semibold">Real-Time · Multi-Satellite</span>
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.15em] text-foreground font-semibold">{unitRows.length} Units</span>
      </div>
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center mono text-[11px] text-foreground uppercase tracking-wider font-medium">Loading operational state…</div>
        ) : unitRows.length === 0 ? (
          <div className="px-4 py-8 text-center mono text-[11px] text-foreground uppercase tracking-wider font-medium">No units registered</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/25">
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground w-8">#</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Unit</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Active Satellites <span className="ml-1.5 text-foreground/80 normal-case tracking-normal font-medium">(click ▾)</span></th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Scanned</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Analyzed</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Pending</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Band · Pol</th>
                <th className="px-3 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground">Scan History <span className="ml-1.5 text-foreground/80 normal-case tracking-normal font-medium">(click ▾ · pencil to edit)</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((state, idx) => (
                <UnitRow
                  key={state.unitDbId}
                  unit={state.unitLabel}
                  unitId={state.unitDbId}
                  data={activityByUnitId.get(state.unitDbId) ?? { activeSats: [], history: [] }}
                  idx={idx + 1}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {unitRows.length > 4 && (
        <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-border bg-secondary/10 hover:bg-secondary/25 transition-colors">
          <span className="mono text-[10px] uppercase tracking-wider text-foreground font-semibold">{expanded ? "Show less" : `Show all ${unitRows.length} units`}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-foreground" />}
        </button>
      )}
    </div>
  );
}

// ── OPTIMIZATION ENGINE — COMPONENTS ──────────────────────────────────────

function SortThOpt({ col, sortKey, sortDir, onSort, children }: {
  col: string; sortKey: string; sortDir: "asc" | "desc";
  onSort: (col: string) => void; children: React.ReactNode;
}) {
  const active = sortKey === col;
  return (
    <th className="px-3 py-2.5 text-left cursor-pointer select-none hover:bg-secondary/40 transition-colors" onClick={() => onSort(col)}>
      <div className="flex items-center gap-1 mono text-[10px] font-bold uppercase tracking-wider text-foreground">
        {children}
        {active
          ? (sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />)
          : <span className="mono text-[10px] text-foreground/50">↕</span>}
      </div>
    </th>
  );
}

function RadialGauge({ score, label, size = 96 }: { score: number; label: string; size?: number }) {
  const sw = 9, r = (size - sw) / 2, c = 2 * Math.PI * r, cx = size / 2;
  const palette = scoreRingPalette(score);
  const { trackStroke, arcStroke, defs } = useEngagementRingVisuals(palette);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="le-progress-ring relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          {defs}
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackStroke} strokeWidth={sw} />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={arcStroke} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`mono text-[17px] font-bold leading-none ${scoreColor(score)}`}>{score}</span>
        </div>
      </div>
      <div className="text-center space-y-0.5">
        <div className="mono text-[10px] font-semibold uppercase tracking-wide text-foreground leading-tight">{label}</div>
        <div className={`mono text-[10px] font-bold ${scoreColor(score)}`}>{score >= 70 ? "Good" : score >= 45 ? "Average" : "Poor"}</div>
      </div>
    </div>
  );
}

function CompositeScoreRing({ score }: { score: number }) {
  const sz = 120, sw = 12, r = (sz - sw) / 2, c = 2 * Math.PI * r, cx = sz / 2;
  const palette = scoreRingPalette(score);
  const { trackStroke, arcStroke, defs } = useEngagementRingVisuals(palette);
  return (
    <div className="le-progress-ring relative" style={{ width: sz, height: sz }}>
      <svg width={sz} height={sz} style={{ transform: "rotate(-90deg)" }}>
        {defs}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackStroke} strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={arcStroke} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`mono text-[28px] font-bold leading-none ${scoreColor(score)}`}>{score}</span>
        <span className="mono text-[11px] font-semibold text-foreground">/100</span>
      </div>
    </div>
  );
}

function unitNavKey(unitDbId: string, unitCode: string): string {
  const letter = unitCode.replace(/^GATE[-\s]?/i, "").trim().charAt(0).toUpperCase();
  return letter || unitDbId;
}

function resolveSelectedUnit(fleetState: OperationalFleetState | null, selectedUnitKey: string | undefined) {
  if (!fleetState || !selectedUnitKey) return null;
  return fleetState.units.find(
    (u) => u.unitDbId === selectedUnitKey || unitNavKey(u.unitDbId, u.unitCode).toUpperCase() === selectedUnitKey.toUpperCase(),
  ) ?? null;
}

function UnitDetailView({ data, onBack }: { data: UnitOptimizationData; onBack: () => void }) {
  const entries = OPT_FACTOR_DEFS.map((f) => ({ ...f, entry: data[f.key] }));
  const risk = riskLevel(data);
  const statusBadgeCls =
    data.status === "OPTIMIZED"  ? "text-emerald-600 bg-emerald-500/8 border-emerald-500/20" :
    data.status === "SUBOPTIMAL" ? "text-amber-500 bg-amber-400/8 border-amber-400/20"       :
                                   "text-destructive bg-destructive/8 border-destructive/20";
  return (
    <div className="space-y-3">
      <div className="panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-secondary/20 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 mono text-[11px] font-semibold uppercase tracking-wide text-foreground hover:text-primary transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Optimization Table
          </button>
          <span className="text-border">·</span>
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="mono text-[13px] font-bold uppercase tracking-wider text-foreground">{data.unitLabel} — Optimization Detail</span>
        </div>
        <div className="px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex flex-col items-center shrink-0">
            <CompositeScoreRing score={data.compositeScore} />
            <span className={`inline-block mt-2 mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${statusBadgeCls}`}>{data.status}</span>
          </div>
          <div className="flex-1 space-y-2.5 w-full">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                { label: "Satellite Load", value: `${data.satelliteLoad}/${data.maxCapacity}`, warn: data.satelliteLoad > data.maxCapacity },
                { label: "Risk Level",     value: risk,       warn: risk === "High" },
                { label: "Active Parameters", value: "3 factors", warn: false },
              ] as const).map((m) => (
                <div key={m.label} className="bg-secondary/30 rounded-sm border border-border px-3 py-2.5">
                  <div className={`mono text-[15px] font-bold leading-none ${m.warn ? "text-destructive" : "text-foreground"}`}>{m.value}</div>
                  <div className="mono text-[10px] font-semibold uppercase tracking-wider text-foreground mt-1">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="panel overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-secondary/20 flex items-center gap-3">
          <span className="mono text-[12px] font-bold uppercase tracking-wider text-foreground">Score Breakdown</span>
          <span className="mono text-[10px] font-medium text-foreground">Equal weight across three parameters</span>
        </div>
        <div className="px-4 pt-4 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-6 border-b border-border">
          {entries.map(({ key, label, weight, entry }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <RadialGauge score={entry.score} label={label} />
              <span className="mono text-[10px] font-semibold text-foreground">{Math.round(weight * 100)}% wt</span>
              {entry.severity !== "ok" && (
                <div className={`flex items-center gap-0.5 mono text-[10px] font-bold uppercase ${entry.severity === "critical" ? "text-destructive" : "text-amber-600"}`}>
                  <AlertTriangle className="h-3 w-3" />
                  {entry.severity === "critical" ? "Critical" : "Warn"}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-3">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-foreground font-bold mb-2">Detected Issues</div>
          {entries.filter((e) => e.entry.severity !== "ok").length === 0 ? (
            <p className="mono text-[11px] font-medium text-emerald-600 py-1">All factors within optimal thresholds</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {entries.filter((e) => e.entry.severity !== "ok").map(({ label, entry }) => (
                <div key={label} className={`rounded-sm border px-3 py-2.5 ${entry.severity === "critical" ? "border-destructive/20 bg-destructive/4" : "border-amber-400/20 bg-amber-400/4"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`mono text-[11px] font-bold uppercase tracking-wide ${entry.severity === "critical" ? "text-destructive" : "text-amber-600"}`}>{label}</span>
                    <span className={`mono text-[12px] font-bold ${scoreColor(entry.score)}`}>{entry.score}/100</span>
                  </div>
                  {entry.issues.map((iss, i) => (
                    <div key={i} className="mono text-[10px] font-medium text-foreground leading-snug">· {iss}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OptimizationEngine() {
  const navigate = Route.useNavigate();
  const { unit: selectedUnitKey } = Route.useSearch();
  const { fleetState, equipment, isLoading } = useOperationalState();
  const [sortKey,      setSortKey     ] = useState<"unit"|"score"|"status"|"risk">("score");
  const [sortDir,      setSortDir     ] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<OptStatus|"ALL">("ALL");
  const [tableExpanded, setTableExpanded] = useState(false);

  const optByUnitId = useMemo(() => {
    const map = new Map<string, UnitOptimizationData>();
    if (!fleetState) return map;
    for (const state of fleetState.units) {
      const unitEq = equipment.filter((e) => e.unit_id === state.unitDbId);
      map.set(state.unitDbId, buildUnitOptimizationData(state, unitEq));
    }
    return map;
  }, [fleetState, equipment]);

  const handleSort = (col: string) => {
    const k = col as typeof sortKey;
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const statusOrder: Record<OptStatus, number> = { MISALLOCATED: 0, SUBOPTIMAL: 1, OPTIMIZED: 2 };
  const riskOrder: Record<"High"|"Medium"|"Low", number> = { High: 0, Medium: 1, Low: 2 };

  const rows = useMemo(() => {
    if (!fleetState) return [];
    return [...fleetState.units]
      .map((state) => ({ state, data: optByUnitId.get(state.unitDbId)! }))
      .filter(({ data }) => data && (filterStatus === "ALL" || data.status === filterStatus))
      .sort((a, b) => {
        const da = a.data, db = b.data;
        let diff = 0;
        if (sortKey === "score")  diff = da.compositeScore - db.compositeScore;
        if (sortKey === "unit")   diff = a.state.unitLabel.localeCompare(b.state.unitLabel);
        if (sortKey === "status") diff = statusOrder[da.status] - statusOrder[db.status];
        if (sortKey === "risk")   diff = riskOrder[riskLevel(da)] - riskOrder[riskLevel(db)];
        return sortDir === "asc" ? diff : -diff;
      });
  }, [fleetState, optByUnitId, filterStatus, sortKey, sortDir]);

  const selectedUnit = resolveSelectedUnit(fleetState, selectedUnitKey);
  const selectedOpt  = selectedUnit ? optByUnitId.get(selectedUnit.unitDbId) : undefined;

  if (selectedUnit && selectedOpt) {
    return <UnitDetailView data={selectedOpt} onBack={() => navigate({ search: ccHubSearch("engagement") })} />;
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-2.5">
          <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="mono text-[12px] font-bold uppercase tracking-wider text-foreground">Optimization Engine</span>
          <span className="mono text-[10px] font-semibold text-secondary-foreground bg-secondary border border-border px-1.5 py-0.5 rounded-sm leading-none uppercase tracking-[0.15em]">Unit Ranking</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(["ALL","OPTIMIZED","SUBOPTIMAL","MISALLOCATED"] as const).map(s => {
            const on = filterStatus === s;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`mono text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-sm border transition-colors ${
                  on
                    ? s==="OPTIMIZED"    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700"
                    : s==="SUBOPTIMAL"   ? "bg-amber-400/15 border-amber-400/40 text-amber-600"
                    : s==="MISALLOCATED" ? "bg-destructive/12 border-destructive/30 text-destructive"
                    : "bg-secondary border-border text-secondary-foreground"
                    : "border-border text-foreground hover:bg-secondary/40 hover:text-secondary-foreground"
                }`}>
                {s==="ALL" ? "All" : s.charAt(0)+s.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="py-10 text-center mono text-[11px] uppercase tracking-wider text-foreground font-medium">Loading optimization data…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/25">
                <th className="px-4 py-2.5 text-left mono text-[10px] font-bold uppercase tracking-wider text-foreground w-10">#</th>
                <SortThOpt col="unit"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Unit</SortThOpt>
                <SortThOpt col="score"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Opt. Score</SortThOpt>
                <SortThOpt col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Status</SortThOpt>
                <SortThOpt col="risk"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Risk Level</SortThOpt>
                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {(tableExpanded ? rows : rows.slice(0, 4)).map(({ state, data: d }, idx) => {
                const risk = riskLevel(d);
                const sb = d.status==="OPTIMIZED"?"text-emerald-700 bg-emerald-500/10 border-emerald-500/25":d.status==="SUBOPTIMAL"?"text-amber-600 bg-amber-400/10 border-amber-400/25":"text-destructive bg-destructive/10 border-destructive/25";
                const rb = risk==="Low"?"text-emerald-700 bg-emerald-500/8 border-emerald-500/20":risk==="Medium"?"text-amber-600 bg-amber-400/8 border-amber-400/20":"text-destructive bg-destructive/8 border-destructive/20";
                const navKey = unitNavKey(state.unitDbId, state.unitCode);
                return (
                  <tr key={state.unitDbId} onClick={() => navigate({ search: ccHubSearch("engagement", navKey) })}
                    className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors group">
                    <td className="px-4 py-3"><span className="mono text-[11px] font-semibold text-foreground">{idx+1}</span></td>
                    <td className="px-3 py-3"><span className="mono text-[14px] font-bold text-foreground whitespace-nowrap">{state.unitLabel}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`mono text-[15px] font-bold ${scoreColor(d.compositeScore)}`}>{d.compositeScore}</span>
                        <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className={`h-full rounded-full ${scorebar(d.compositeScore)}`} style={{ width: `${d.compositeScore}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className={`inline-block mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${sb}`}>{d.status}</span></td>
                    <td className="px-3 py-3"><span className={`inline-block mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${rb}`}>{risk}</span></td>
                    <td className="px-3 py-3 text-right"><ChevronRight className="h-4 w-4 text-foreground/40 group-hover:text-primary transition-colors ml-auto" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!isLoading && rows.length === 0 && (
          <div className="py-10 text-center mono text-[11px] uppercase tracking-wider text-foreground font-medium">No units match the selected filter</div>
        )}
      </div>
      {rows.length > 4 && (
        <button onClick={() => setTableExpanded(e => !e)} className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-border bg-secondary/10 hover:bg-secondary/25 transition-colors">
          <span className="mono text-[10px] uppercase tracking-wider text-foreground font-semibold">{tableExpanded ? "Show less" : `Show all ${rows.length} units`}</span>
          {tableExpanded ? <ChevronUp className="h-3.5 w-3.5 text-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-foreground" />}
        </button>
      )}
    </div>
  );
}

// ── PAGE ───────────────────────────────────────────────────────────────────

const MODULE_VIEWS: Record<string, ComponentType> = {
  engagement: EngagementLiveModuleView,
  intel:      IntelRepositoryView,
  important:  ImportantFrequenciesView,
  priority:   PriorityAllocationView,
};

function EngagementLiveModuleView() {
  const { fleetState, units, equipment, intelRows } = useOperationalState();

  const capData = useMemo(
    () => deriveCapabilityData(units, equipment),
    [units, equipment],
  );
  const intData = useMemo(
    () => deriveIntOutput(units, intelRows),
    [units, intelRows],
  );
  const metrics = useMemo(
    () => deriveSystemMetrics(capData, intData, fleetState?.units ?? []),
    [capData, intData, fleetState],
  );
  const unitLoads = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of (fleetState?.units ?? [])) {
      m[u.unitLabel] = u.activeSatellites ?? 0;
    }
    return m;
  }, [fleetState]);

  return (
    <div className="space-y-5">
      <SystemReadinessBar metrics={metrics} />
      <EngagementDashboardView />
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        <CapabilityPanel capData={capData} />
        <CoveragePanel />
        <OutputPanel intData={intData} />
        <UtilizationPanel unitLoads={unitLoads} />
      </div>
      <UnitActivitySnapshot />
      <OptimizationEngine />
      <DecisionCore insights={DECISION_INSIGHTS} />
    </div>
  );
}

function ControlCenterPage() {
  const { module } = Route.useSearch();
  const meta = module ? CONTROL_CENTER_MODULE_MAP[module] : undefined;
  const View = module ? MODULE_VIEWS[module] : undefined;
  if (!module || !meta || !View) {
    return (
      <AppShell title="Control Center" horizontalNav={null}>
        <p className="mono text-sm text-muted-foreground">Unknown module.</p>
      </AppShell>
    );
  }
  const Icon = meta.icon;
  const CC_ICON_THEME: Record<string, HomeIconTheme> = {
    engagement: "engagement",
    intel:      "intel",
    important:  "important",
    priority:   "priority",
  };
  return (
    <AppShell
      title={meta.title}
      headerIcon={<HomeNavIconBadge icon={Icon} theme={CC_ICON_THEME[module] ?? "engagement"} size="md" />}
      horizontalNav={null}
    >
      <View />
    </AppShell>
  );
}
