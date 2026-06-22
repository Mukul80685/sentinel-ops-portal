import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  Link2,
  Maximize2,
  Plus,
  Radio,
  Satellite as SatIcon,
  Send,
  Signal,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/control-center")({
  component: ControlCenterPage,
  head: () => ({ meta: [{ title: "Control Center — SSACC" }] }),
});

// ─── Static mock data ─────────────────────────────────────────────────────────

const UNIT_LABELS = [
  "Unit A","Unit B","Unit C","Unit D",
  "Unit E","Unit F","Unit G","Unit H",
] as const;
type UnitLabel = typeof UNIT_LABELS[number];

type Sat = { id:string; name:string; pos:string; bands:string; status:"active"|"standby" };
const SATELLITES: Sat[] = [
  { id:"s1", name:"INSAT-4A",    pos:"93.5°E",  bands:"C / Ku",  status:"active"  },
  { id:"s2", name:"AsiaSat 7",   pos:"105.5°E", bands:"Ku",      status:"active"  },
  { id:"s3", name:"ChinaSat 9",  pos:"92.2°E",  bands:"C",       status:"active"  },
  { id:"s4", name:"Measat-3b",   pos:"91.5°E",  bands:"C / Ku",  status:"active"  },
  { id:"s5", name:"SES-9",       pos:"108.2°E", bands:"Ku",      status:"standby" },
  { id:"s6", name:"Thaicom 8",   pos:"78.5°E",  bands:"Ku",      status:"active"  },
  { id:"s7", name:"Intelsat 17", pos:"66°E",    bands:"C",       status:"active"  },
  { id:"s8", name:"SES-12",      pos:"95°E",    bands:"Ku / Ka", status:"active"  },
];
const SAT_MAP = Object.fromEntries(SATELLITES.map(s => [s.id, s]));

type FStatus = "Optimal" | "Suboptimal" | "Interference Risk";
type FreqRow  = { band:string; freq:string; status:FStatus };

const INIT_ALLOC: Record<string, string[]> = {
  "Unit A":["s1","s2"], "Unit B":["s3"],      "Unit C":["s4","s5"],
  "Unit D":["s6"],       "Unit E":["s7"],       "Unit F":["s8"],
  "Unit G":[],           "Unit H":["s1"],
};
const INIT_FREQ: Record<string, FreqRow[]> = {
  "Unit A":[{ band:"C-band",  freq:"3.785 GHz",  status:"Optimal"           },
            { band:"Ku-band", freq:"11.470 GHz", status:"Suboptimal"        }],
  "Unit B":[{ band:"C-band",  freq:"4.100 GHz",  status:"Interference Risk" }],
  "Unit C":[{ band:"Ku-band", freq:"12.250 GHz", status:"Optimal"           },
            { band:"Ka-band", freq:"28.500 GHz", status:"Optimal"           }],
  "Unit D":[{ band:"Ku-band", freq:"10.980 GHz", status:"Suboptimal"        }],
  "Unit E":[{ band:"C-band",  freq:"3.960 GHz",  status:"Optimal"           }],
  "Unit F":[{ band:"Ku-band", freq:"11.720 GHz", status:"Optimal"           },
            { band:"Ka-band", freq:"29.100 GHz", status:"Interference Risk" }],
  "Unit G":[],
  "Unit H":[{ band:"C-band",  freq:"4.000 GHz",  status:"Optimal"           }],
};
const CMD_TEMPLATES = [
  "Shift satellite to alternate beam",
  "Change frequency band to C-band",
  "Increase monitoring priority to HIGH",
  "Switch to backup transponder",
  "Execute frequency hop sequence",
  "Realign antenna to primary vector",
  "Initiate full spectrum scan",
  "Engage redundant signal path",
];
type CmdEntry = { id:string; unit:string; text:string; priority:"Low"|"Medium"|"High"; time:string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function freqBadge(s: FStatus) {
  const base = "inline-flex mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border font-bold";
  if (s === "Optimal")           return `${base} bg-emerald-500/10 border-emerald-500/30 text-emerald-500`;
  if (s === "Suboptimal")        return `${base} bg-amber-400/10 border-amber-400/30 text-amber-400`;
  return `${base} bg-destructive/10 border-destructive/30 text-destructive`;
}
function priorityColor(p: "Low"|"Medium"|"High") {
  if (p === "High")   return "text-destructive";
  if (p === "Medium") return "text-amber-400";
  return "text-emerald-500";
}
function priorityBadgeCls(p: "Low"|"Medium"|"High") {
  if (p === "High")   return "bg-destructive/10  border-destructive/40  text-destructive";
  if (p === "Medium") return "bg-amber-400/10   border-amber-400/40   text-amber-400";
  return "bg-emerald-500/10 border-emerald-500/40 text-emerald-500";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ControlCenterPage() {
  // Panel A — Satellite Allocation
  const [alloc, setAlloc]       = useState<Record<string,string[]>>(INIT_ALLOC);
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocExpand, setAllocExpand] = useState(false);
  const [aUnit, setAUnit]       = useState<string>(UNIT_LABELS[0]);
  const [aSat,  setASat]        = useState<string>("");

  // Panel B — Frequency Control
  const [freq, setFreq]         = useState<Record<string,FreqRow[]>>(INIT_FREQ);
  const [freqExpand, setFreqExpand] = useState(false);
  const [ovOpen,  setOvOpen]    = useState(false);
  const [ovTarget, setOvTarget] = useState<{unit:string; idx:number}|null>(null);
  const [ovFreq,  setOvFreq]    = useState("");

  // Panel C — Unit Command
  const [cUnit, setCUnit]       = useState<string>(UNIT_LABELS[0]);
  const [cText, setCText]       = useState("");
  const [cPri,  setCPri]        = useState<"Low"|"Medium"|"High">("Medium");
  const [cmdLog, setCmdLog]     = useState<CmdEntry[]>([]);

  // Panel E derived metrics
  const totalLinks  = useMemo(() => Object.values(alloc).reduce((n,s) => n + s.length, 0), [alloc]);
  const activeUnits = useMemo(() => UNIT_LABELS.filter(u => (alloc[u]?.length ?? 0) > 0).length, [alloc]);
  const freqAll   = useMemo(() => (Object.values(freq) as FreqRow[][]).flat(), [freq]);
  const freqHealth  = useMemo(() => freqAll.length === 0 ? 100 : Math.round(freqAll.filter(f=>f.status==="Optimal").length / freqAll.length * 100), [freqAll]);
  const interference = useMemo(() => freqAll.filter(f=>f.status==="Interference Risk").length, [freqAll]);
  const highCmds    = cmdLog.filter(c=>c.priority==="High").length;

  // ── Panel A handlers ────────────────────────────────────────────────────────
  function doAssign() {
    if (!aUnit || !aSat) return;
    setAlloc(p => ({ ...p, [aUnit]: [...new Set([...(p[aUnit]??[]), aSat])] }));
    toast.success(`${SAT_MAP[aSat]?.name} assigned to ${aUnit}`);
    setAllocOpen(false); setASat("");
  }
  function doUnassign(unit:string, satId:string) {
    setAlloc(p => ({ ...p, [unit]: (p[unit]??[]).filter(s=>s!==satId) }));
    toast.success("Assignment removed");
  }

  // ── Panel B handlers ────────────────────────────────────────────────────────
  const FREQ_POOL = ["3.720 GHz","4.080 GHz","11.550 GHz","12.010 GHz","28.250 GHz"];
  function doRecommend(unit:string, idx:number) {
    const nf = FREQ_POOL[Math.floor(Math.random() * FREQ_POOL.length)];
    setFreq(p => ({ ...p, [unit]: p[unit].map((f,i) => i===idx ? {...f, freq:nf, status:"Optimal"} : f) }));
    toast.success(`Recommended ${nf} applied for ${unit}`);
  }
  function doMarkBad(unit:string, idx:number) {
    setFreq(p => ({ ...p, [unit]: p[unit].map((f,i) => i===idx ? {...f, status:"Interference Risk"} : f) }));
    toast.warning(`Frequency flagged as Interference Risk for ${unit}`);
  }
  function doOverride() {
    if (!ovTarget || !ovFreq.trim()) return;
    const {unit, idx} = ovTarget;
    setFreq(p => ({ ...p, [unit]: p[unit].map((f,i) => i===idx ? {...f, freq:ovFreq.trim(), status:"Optimal"} : f) }));
    toast.success(`Frequency overridden for ${unit}`);
    setOvOpen(false); setOvFreq(""); setOvTarget(null);
  }

  // ── Panel C handler ─────────────────────────────────────────────────────────
  function doDispatch() {
    if (!cText.trim()) return;
    setCmdLog(p => [{
      id:`cmd-${Date.now()}`, unit:cUnit, text:cText.trim(), priority:cPri,
      time: new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),
    }, ...p]);
    toast.success(`Command dispatched → ${cUnit} [${cPri} priority]`);
    setCText("");
  }

  return (
    <AppShell
      title="Control Center"
      subtitle="Command. Control. Optimize."
      headerIcon={<LayoutDashboard className="h-4 w-4" />}
    >
      <div className="space-y-4">

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Panel E — Operational Status Overview                               */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section>
          <div className="label-eyebrow flex items-center gap-1.5 mb-2">
            <Signal className="h-3 w-3" /> Operational Status
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {([
              { label:"Active Units",        value:`${activeUnits}/8`, icon:Wifi,          ok: activeUnits >= 6 },
              { label:"Satellite Links",     value:totalLinks,         icon:SatIcon,        ok: totalLinks > 5   },
              { label:"Frequency Health",    value:`${freqHealth}%`,   icon:Radio,          ok: freqHealth >= 70 },
              { label:"High-Priority Cmds",  value:highCmds,           icon:Activity,       ok: highCmds === 0   },
              { label:"Interference Alerts", value:interference,       icon:AlertTriangle,  ok: interference === 0 },
            ] as const).map(kpi => (
              <div key={kpi.label} className="panel px-3 py-2.5 flex items-start gap-2.5">
                <div className={`h-7 w-7 shrink-0 grid place-items-center rounded-sm border
                                 ${kpi.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/10"}`}>
                  <kpi.icon className={`h-3.5 w-3.5 ${kpi.ok ? "text-emerald-500" : "text-destructive"}`} />
                </div>
                <div>
                  <div className={`mono text-lg font-bold tabular-nums leading-none ${kpi.ok ? "text-emerald-500" : "text-destructive"}`}>
                    {kpi.value}
                  </div>
                  <div className="mono text-[10px] text-muted-foreground mt-0.5 leading-tight">{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Row 2 — Panel A + Panel B                                           */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Panel A — Satellite Allocation ─────────────────────────────── */}
          <div className="panel overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/20 shrink-0">
              <div className="flex items-center gap-2">
                <SatIcon className="h-3.5 w-3.5 text-primary" />
                <span className="mono text-xs font-bold uppercase tracking-wide">Satellite Allocation</span>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => setAllocOpen(true)}
                  className="h-7 px-2 mono text-[10px] uppercase tracking-wider">
                  <Plus className="h-3 w-3 mr-1" /> Assign
                </Button>
                <button type="button" onClick={() => setAllocExpand(true)} title="Expand"
                  className="h-7 w-7 grid place-items-center rounded-sm border border-border hover:bg-secondary text-muted-foreground transition-colors">
                  <Maximize2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <table className="w-full text-[11px] mono">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-3 py-1.5 text-left text-muted-foreground font-medium w-16">Unit</th>
                  <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Assigned Satellites</th>
                  <th className="px-3 py-1.5 text-right text-muted-foreground font-medium w-12">#</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {UNIT_LABELS.map(u => (
                  <tr key={u} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-1.5 font-bold text-foreground">{u}</td>
                    <td className="px-3 py-1.5">
                      {(alloc[u]?.length ?? 0) === 0 ? (
                        <span className="text-muted-foreground italic text-[10px]">Unassigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(alloc[u] ?? []).map(sid => (
                            <span key={sid} className="inline-flex items-center gap-0.5 px-1.5 py-0.5
                                                        bg-secondary border border-border rounded-sm text-[10px]">
                              {SAT_MAP[sid]?.name}
                              <button type="button" onClick={() => doUnassign(u, sid)}
                                className="ml-0.5 hover:text-destructive transition-colors">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={`font-bold tabular-nums ${(alloc[u]?.length ?? 0) > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        {alloc[u]?.length ?? 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Panel B — Frequency Control ────────────────────────────────── */}
          <div className="panel overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/20 shrink-0">
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-primary" />
                <span className="mono text-xs font-bold uppercase tracking-wide">Frequency Control</span>
              </div>
              <button type="button" onClick={() => setFreqExpand(true)} title="Expand"
                className="h-7 w-7 grid place-items-center rounded-sm border border-border hover:bg-secondary text-muted-foreground transition-colors">
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-[11px] mono">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Unit</th>
                    <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Band</th>
                    <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Frequency</th>
                    <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Status</th>
                    <th className="px-3 py-1.5 text-right text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {UNIT_LABELS.flatMap(u =>
                    (freq[u] ?? []).map((row, idx) => (
                      <tr key={`${u}-${idx}`} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-1.5 font-bold text-foreground">{idx === 0 ? u : ""}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{row.band}</td>
                        <td className="px-3 py-1.5 font-bold tabular-nums">{row.freq}</td>
                        <td className="px-3 py-1.5"><span className={freqBadge(row.status)}>{row.status}</span></td>
                        <td className="px-3 py-1.5">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => doRecommend(u, idx)} title="Auto-recommend optimal frequency"
                              className="h-5 px-1.5 rounded-sm border border-border hover:bg-secondary transition-colors text-[9px] mono uppercase text-muted-foreground hover:text-foreground">
                              Rec
                            </button>
                            <button type="button" onClick={() => doMarkBad(u, idx)} title="Flag as interference risk"
                              className="h-5 px-1.5 rounded-sm border border-destructive/40 hover:bg-destructive/10 transition-colors text-[9px] mono uppercase text-destructive/60 hover:text-destructive">
                              Bad
                            </button>
                            <button type="button" onClick={() => { setOvTarget({unit:u, idx}); setOvOpen(true); }} title="Override manually"
                              className="h-5 px-1.5 rounded-sm border border-primary/40 hover:bg-primary/10 transition-colors text-[9px] mono uppercase text-primary/60 hover:text-primary">
                              Ovr
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Row 3 — Panel C + Panel D                                           */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Panel C — Unit Command Dispatch ────────────────────────────── */}
          <div className="panel overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/20 shrink-0">
              <Send className="h-3.5 w-3.5 text-primary" />
              <span className="mono text-xs font-bold uppercase tracking-wide">Unit Command Dispatch</span>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="label-eyebrow">Target Unit</Label>
                  <Select value={cUnit} onValueChange={v => setCUnit(v)}>
                    <SelectTrigger className="mt-1 h-8 mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_LABELS.map(u => (
                        <SelectItem key={u} value={u} className="mono text-xs">{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="label-eyebrow">Priority</Label>
                  <div className="flex gap-1 mt-1">
                    {(["Low","Medium","High"] as const).map(p => (
                      <button key={p} type="button" onClick={() => setCPri(p)}
                        className={`flex-1 h-8 mono text-[10px] uppercase tracking-wider rounded-sm border transition-colors
                                    ${cPri === p ? priorityBadgeCls(p) : "border-border text-muted-foreground hover:bg-secondary"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="label-eyebrow mb-1.5">Quick Templates</div>
                <div className="flex flex-wrap gap-1">
                  {CMD_TEMPLATES.map(t => (
                    <button key={t} type="button" onClick={() => setCText(t)}
                      className="px-1.5 py-0.5 mono text-[10px] border border-border rounded-sm
                                 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="label-eyebrow">Command / Instruction</Label>
                <Textarea
                  className="mt-1 mono text-xs resize-none"
                  rows={2}
                  value={cText}
                  onChange={e => setCText(e.target.value)}
                  placeholder="Enter operational instruction…"
                />
              </div>

              <Button type="button" onClick={doDispatch} disabled={!cText.trim()}
                className="w-full h-8 mono text-[11px] uppercase tracking-wider">
                <Send className="h-3.5 w-3.5 mr-1.5" /> Dispatch Command
              </Button>
            </div>

            {cmdLog.length > 0 && (
              <div className="border-t border-border flex-1">
                <div className="px-4 py-1.5 bg-secondary/20 label-eyebrow flex items-center gap-1.5">
                  <Activity className="h-2.5 w-2.5" /> Recent Dispatches
                </div>
                <ul className="divide-y divide-border max-h-44 overflow-y-auto">
                  {cmdLog.slice(0, 8).map(c => (
                    <li key={c.id} className="px-4 py-1.5 flex items-start gap-2 text-[10px] mono">
                      <span className={`shrink-0 mt-0.5 font-bold uppercase ${priorityColor(c.priority)}`}>{c.priority[0]}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">{c.time}</span>
                      <span className="shrink-0 font-bold text-foreground">{c.unit}</span>
                      <span className="text-muted-foreground truncate">{c.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Panel D — Resource Optimization ────────────────────────────── */}
          <div className="panel overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/20 shrink-0">
              <Link2 className="h-3.5 w-3.5 text-primary" />
              <span className="mono text-xs font-bold uppercase tracking-wide">Resource Optimization</span>
            </div>

            {/* Per-unit utilization bars */}
            <div className="divide-y divide-border">
              {UNIT_LABELS.map(u => {
                const sCount = alloc[u]?.length ?? 0;
                const fRows  = freq[u] ?? [];
                const hasRisk = fRows.some(f => f.status === "Interference Risk");
                const hasSub  = fRows.some(f => f.status === "Suboptimal");
                const util    = Math.min(100, sCount * 40 + fRows.length * 15);
                const barCls  = util >= 70 ? "bg-emerald-500" : util >= 35 ? "bg-amber-400" : "bg-border";
                const badge   = hasRisk ? "text-destructive" : hasSub ? "text-amber-400" : sCount === 0 ? "text-muted-foreground/50" : "text-emerald-500";
                const label   = hasRisk ? "RISK" : hasSub ? "SUB" : sCount === 0 ? "IDLE" : "OK";
                return (
                  <div key={u} className="px-4 py-2 flex items-center gap-3">
                    <div className="mono text-[11px] font-bold text-foreground w-12 shrink-0">{u}</div>
                    <div className="flex-1">
                      <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${barCls}`}
                          style={{ width:`${util}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 text-[10px] mono">
                      <span className="text-muted-foreground flex items-center gap-0.5">
                        <SatIcon className="h-2.5 w-2.5" />{sCount}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-0.5">
                        <Radio className="h-2.5 w-2.5" />{fRows.length}
                      </span>
                      <span className={`font-bold w-8 text-right ${badge}`}>{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Satellite load distribution mini-chart */}
            <div className="border-t border-border px-4 py-3 mt-auto">
              <div className="label-eyebrow mb-2">Satellite Load Distribution</div>
              <div className="flex items-end justify-between gap-1 h-14">
                {SATELLITES.map(sat => {
                  const load = Object.values(alloc).filter(arr => arr.includes(sat.id)).length;
                  const maxLoad = 3;
                  const heightPct = load === 0 ? 8 : Math.round((load / maxLoad) * 100);
                  const barColor = load > 2 ? "bg-destructive" : load > 0 ? "bg-primary" : "bg-border";
                  return (
                    <div key={sat.id} className="flex flex-col items-center gap-0.5 flex-1" title={`${sat.name}: ${load} unit(s)`}>
                      <span className="mono text-[9px] text-muted-foreground tabular-nums">{load}</span>
                      <div className={`w-full rounded-t-sm ${barColor} transition-all`} style={{ height:`${heightPct}%` }} />
                      <span className="mono text-[8px] text-muted-foreground truncate w-full text-center leading-tight">
                        {sat.name.split(" ").at(-1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Assign Satellite Dialog ─────────────────────────────────────────── */}
      <Dialog open={allocOpen} onOpenChange={o => { setAllocOpen(o); if (!o) setASat(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
              <SatIcon className="h-4 w-4 text-primary" /> Assign Satellite → Unit
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="label-eyebrow">Target Unit</Label>
              <Select value={aUnit} onValueChange={v => setAUnit(v)}>
                <SelectTrigger className="mt-1 mono text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_LABELS.map(u => <SelectItem key={u} value={u} className="mono text-xs">{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-eyebrow">Satellite</Label>
              <Select value={aSat} onValueChange={v => setASat(v)}>
                <SelectTrigger className="mt-1 mono text-xs">
                  <SelectValue placeholder="Select satellite…" />
                </SelectTrigger>
                <SelectContent>
                  {SATELLITES.map(s => (
                    <SelectItem key={s.id} value={s.id} className="mono text-xs">
                      {s.name} ({s.pos}) — {s.bands}
                      {s.status === "standby" && " · STANDBY"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1 mono uppercase tracking-wider" onClick={() => setAllocOpen(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 mono uppercase tracking-wider" disabled={!aSat} onClick={doAssign}>Assign</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Frequency Override Dialog ────────────────────────────────────────── */}
      <Dialog open={ovOpen} onOpenChange={o => { setOvOpen(o); if (!o) { setOvFreq(""); setOvTarget(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" /> Override Frequency
            </DialogTitle>
          </DialogHeader>
          {ovTarget && (
            <div className="space-y-3">
              <div className="panel px-3 py-2 text-[11px] mono grid grid-cols-2 gap-y-1">
                <span className="text-muted-foreground">Unit</span>
                <span className="font-bold">{ovTarget.unit}</span>
                <span className="text-muted-foreground">Band</span>
                <span className="font-bold">{freq[ovTarget.unit]?.[ovTarget.idx]?.band}</span>
                <span className="text-muted-foreground">Current</span>
                <span className="font-bold">{freq[ovTarget.unit]?.[ovTarget.idx]?.freq}</span>
              </div>
              <div>
                <Label className="label-eyebrow">New Frequency</Label>
                <Input className="mt-1 mono text-xs" value={ovFreq}
                  onChange={e => setOvFreq(e.target.value)} placeholder="e.g. 11.650 GHz" />
              </div>
              <p className="mono text-[10px] text-amber-500 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded-sm leading-snug">
                ⚠ Manual override marks this frequency as Optimal. Confirm this is an authorised change.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 mono uppercase tracking-wider" onClick={() => setOvOpen(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 mono uppercase tracking-wider" disabled={!ovFreq.trim()} onClick={doOverride}>Override</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Allocation Expand Dialog ─────────────────────────────────────────── */}
      <Dialog open={allocExpand} onOpenChange={setAllocExpand}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
              <SatIcon className="h-4 w-4 text-primary" /> Full Satellite Allocation Matrix
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {UNIT_LABELS.map(u => (
              <div key={u} className="panel px-4 py-2.5 flex items-start gap-4">
                <div className="mono text-xs font-bold text-foreground w-14 shrink-0 pt-0.5">{u}</div>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {(alloc[u]?.length ?? 0) === 0
                    ? <span className="mono text-[11px] text-muted-foreground italic">No satellites assigned</span>
                    : (alloc[u] ?? []).map(sid => {
                        const s = SAT_MAP[sid];
                        return (
                          <div key={sid} className="border border-border bg-secondary rounded-sm px-2 py-1 mono text-[10px]">
                            <div className="font-bold text-foreground">{s?.name}</div>
                            <div className="text-muted-foreground">{s?.pos} · {s?.bands}</div>
                          </div>
                        );
                      })
                  }
                </div>
                <span className={`mono text-xs font-bold shrink-0 tabular-nums ${(alloc[u]?.length ?? 0) > 0 ? "text-primary" : "text-muted-foreground"}`}>
                  {alloc[u]?.length ?? 0} sat{(alloc[u]?.length ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Frequency Expand Dialog ──────────────────────────────────────────── */}
      <Dialog open={freqExpand} onOpenChange={setFreqExpand}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" /> Full Frequency Assignment Table
            </DialogTitle>
          </DialogHeader>
          <table className="w-full text-[11px] mono border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Unit</th>
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Band</th>
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Frequency</th>
                <th className="px-3 py-2 text-left text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {UNIT_LABELS.flatMap(u =>
                (freq[u] ?? []).map((row, i) => (
                  <tr key={`${u}-${i}`} className="hover:bg-secondary/20">
                    <td className="px-3 py-2 font-bold text-foreground">{i === 0 ? u : ""}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.band}</td>
                    <td className="px-3 py-2 font-bold tabular-nums">{row.freq}</td>
                    <td className="px-3 py-2"><span className={freqBadge(row.status)}>{row.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
