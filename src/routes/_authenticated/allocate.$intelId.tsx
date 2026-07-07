import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/Empty";
import { listUnits, listAllEquipment, getIntelRecordById } from "@/lib/queries";
import { fetchAllEngagements } from "@/lib/engagementEngine";
import { insertOperationalEngagement } from "@/lib/operationalStore";
import {
  findGeoSatelliteEntry,
  getVisibleBeams,
  bandsFromVisibleBeams,
} from "@/lib/visibilityMatrix";
import { Button } from "@/components/ui/button";
import { useCanEdit } from "@/lib/auth";
import { Target, CheckCircle2, XCircle, ArrowRight, Sigma, TrendingUp, Eye, Activity } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/allocate/$intelId")({
  component: AllocateRecommendation,
});

const ACTIVE_STATUSES = new Set(["Planned", "In Progress", "Paused"]);

// Scoring weights — surfaced in UI for transparency
const W_AVAILABLE = 10;
const W_VISIBILITY = 5;
const W_SATURATION = 1; // penalty multiplier on pct

function AllocateRecommendation() {
  const { intelId } = Route.useParams();
  const canEdit = useCanEdit();
  const router = useRouter();

  const { data: intel } = useQuery({
    queryKey: ["intel-single", intelId],
    queryFn: () => getIntelRecordById(intelId),
  });

  const satId = intel?.satellite_id ?? null;
  const satelliteName = intel?.satellites?.name ?? null;
  const satEntry = satelliteName ? findGeoSatelliteEntry(satelliteName) : null;

  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-all"],
    queryFn: listAllEquipment,
  });
  const { data: engagements = [] } = useQuery({
    queryKey: ["eng-all"],
    queryFn: fetchAllEngagements,
  });

  const evaluations = useMemo(() => {
    return units.map((u) => {
      const eq = equipment.filter((e: any) => e.unit_id === u.id);
      const serviceable = eq.filter((e: any) => e.serviceability === "Operational").length;
      const active = engagements.filter((e: any) => e.unit_id === u.id && ACTIVE_STATUSES.has(e.status)).length;
      const available = Math.max(0, serviceable - active);
      const pct = serviceable === 0 ? 100 : Math.round((active / serviceable) * 100);

      let sees = false;
      let visibleBeams: string[] = [];
      let visibleBands: string[] = [];
      if (satEntry) {
        visibleBeams = getVisibleBeams(u.id, satEntry.sat.id, satEntry.regionId);
        sees = visibleBeams.length > 0;
        visibleBands = bandsFromVisibleBeams(visibleBeams);
      }

      const reasons: string[] = [];
      if (!sees) reasons.push("No visibility of satellite");
      if (serviceable === 0) reasons.push("No serviceable equipment");
      if (pct >= 100) reasons.push("Engagement capacity saturated");
      if (available === 0 && serviceable > 0) reasons.push("All resources currently committed");

      const eligible = sees && serviceable > 0 && available > 0 && pct < 100;
      const availPts = available * W_AVAILABLE;
      const visPts = visibleBeams.length * W_VISIBILITY;
      const satPenalty = pct * W_SATURATION;
      const score = eligible ? availPts + visPts - satPenalty : -1;

      return {
        unit: u,
        serviceable,
        active,
        available,
        pct,
        sees,
        visibleBands,
        visibleBeams,
        eligible,
        reasons,
        score,
        availPts,
        visPts,
        satPenalty,
      };
    });
  }, [units, equipment, engagements, satEntry]);

  const eligible = evaluations.filter((e) => e.eligible).sort((a, b) => b.score - a.score);
  const ineligible = evaluations.filter((e) => !e.eligible);
  const topScore = eligible[0]?.score ?? 0;

  async function commitAllocation(unitId: string) {
    if (!intel) return;
    if (!satId) return toast.error("Frequency has no satellite assigned");
    const created = insertOperationalEngagement({
      unit_id: unitId,
      satellite_id: satId,
      status: "Planned",
      remarks: `Allotted from INT ${intel.frequency ?? ""} ${intel.band ?? ""}`.trim(),
    });
    if (!created) return toast.error("Unknown satellite.");
    toast.success("Frequency allotted");
    router.navigate({ to: "/engagement/$unitId", params: { unitId } });
  }

  return (
    <AppShell
      title="Allocation Recommendation"
      subtitle={`Frequency ${intel?.frequency ?? "—"} · ${intel?.satellites?.name ?? "—"}`}
      showBack
      horizontalNav={null}
    >
      <div className="panel p-3 mb-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-[12px] mono">
        <Stat label="Satellite" value={intel?.satellites?.name ?? "—"} />
        <Stat label="Frequency" value={intel?.frequency ?? "—"} />
        <Stat label="Band" value={intel?.band ?? "—"} />
        <Stat label="Eligible Units" value={String(eligible.length)} accent />
      </div>

      <section className="mb-5">
        <div className="label-eyebrow mb-2 flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Recommended Units
        </div>
        {eligible.length > 0 && (
          <div className="panel p-3 mb-2 border-l-2 border-primary">
            <div className="flex items-center gap-1 label-eyebrow mb-1">
              <Sigma className="h-3 w-3" /> Scoring Formula
            </div>
            <div className="mono text-[11px] text-muted-foreground">
              score = (available × {W_AVAILABLE}) + (visible_beams × {W_VISIBILITY}) − (engagement_pct × {W_SATURATION})
            </div>
          </div>
        )}
        {eligible.length === 0 ? (
          <Empty title="No unit currently eligible" hint="Check satellite visibility, serviceability, or engagement saturation." />
        ) : (
          <div className="space-y-2">
            {eligible.map((e, idx) => (
              <div key={e.unit.id} className="panel p-3">
                <div className="flex items-center gap-3">
                  <div className={`mono text-xs px-2 py-1 rounded-sm uppercase tracking-wider ${idx === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    {idx === 0 ? "Best Fit" : idx === 1 ? "Good Fit" : `Option ${idx + 1}`}
                  </div>
                  <div className="mono text-sm font-bold uppercase flex-1">
                    {e.unit.code} <span className="text-muted-foreground font-normal">— {e.unit.name}</span>
                  </div>
                  <div className="mono text-[11px] text-right">
                    <div className="label-eyebrow">Score</div>
                    <div className={`text-base font-bold ${idx === 0 ? "text-primary" : "text-foreground"}`}>{e.score}</div>
                  </div>
                  {canEdit && (
                    <Button size="sm" onClick={() => commitAllocation(e.unit.id)} className="mono text-[11px] uppercase tracking-wider h-8">
                      <Target className="h-3.5 w-3.5 mr-1" /> Allot Here
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 text-[11px] mono">
                  <Cell label="Available" value={String(e.available)} />
                  <Cell label="Serviceable" value={String(e.serviceable)} />
                  <Cell label="Engagement" value={`${e.pct}%`} />
                  <Cell label="Sat Visibility" value={e.sees ? "Yes" : "No"} />
                  <Cell label="Beams" value={e.visibleBeams.join(", ") || "—"} />
                </div>
                <div className="mt-3 pt-2 border-t border-border/50">
                  <div className="label-eyebrow mb-1.5">Score Breakdown</div>
                  <div className="grid grid-cols-3 gap-2">
                    <ScoreBar icon={<TrendingUp className="h-3 w-3" />} label="Availability" value={`+${e.availPts}`} pct={topScore > 0 ? (e.availPts / Math.max(topScore + e.satPenalty, 1)) * 100 : 0} tone="pos" detail={`${e.available} × ${W_AVAILABLE}`} />
                    <ScoreBar icon={<Eye className="h-3 w-3" />} label="Visibility" value={`+${e.visPts}`} pct={topScore > 0 ? (e.visPts / Math.max(topScore + e.satPenalty, 1)) * 100 : 0} tone="pos" detail={`${e.visibleBeams.length} × ${W_VISIBILITY}`} />
                    <ScoreBar icon={<Activity className="h-3 w-3" />} label="Saturation" value={`−${e.satPenalty}`} pct={topScore > 0 ? (e.satPenalty / Math.max(topScore + e.satPenalty, 1)) * 100 : 0} tone="neg" detail={`${e.pct}% load`} />
                  </div>
                  <div className="mt-2 text-[11px] mono text-muted-foreground italic">
                    {idx === 0
                      ? `Top pick: highest available capacity${e.visibleBeams.length > 1 ? ` with ${e.visibleBeams.length} visible beams` : ""}${e.pct < 30 ? " and low saturation" : ""}.`
                      : `Alternative: ${e.available < eligible[0].available ? `${eligible[0].available - e.available} fewer slots available` : e.visibleBeams.length < eligible[0].visibleBeams.length ? "fewer beams in view" : `${e.pct - eligible[0].pct}% higher saturation`} vs Best Fit.`}
                  </div>
                </div>
                {e.visibleBands.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {e.visibleBands.map((b) => (
                      <span key={b} className="text-[10px] mono uppercase border border-border bg-secondary/60 px-1.5 py-0.5 rounded-sm">{b}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {ineligible.length > 0 && (
        <section>
          <div className="label-eyebrow mb-2 flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5 text-destructive" /> Not Eligible
          </div>
          <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
            {ineligible.map((e) => (
              <div key={e.unit.id} className="panel p-3 opacity-80">
                <div className="flex items-center justify-between">
                  <div className="mono text-sm font-bold uppercase">{e.unit.code}</div>
                  <div className="text-[11px] mono text-muted-foreground">{e.pct}% engaged</div>
                </div>
                <ul className="mt-2 space-y-1">
                  {e.reasons.map((r) => (
                    <li key={r} className="text-[11px] mono text-destructive flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 text-[11px] mono text-muted-foreground">
        <Link to="/intel" className="text-primary hover:underline">← Back to INT Repository</Link>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel px-3 py-2">
      <div className="label-eyebrow">{label}</div>
      <div className={`mono text-sm ${accent ? "text-primary font-bold" : "text-foreground"} truncate`}>{value}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function ScoreBar({
  icon,
  label,
  value,
  pct,
  tone,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pct: number;
  tone: "pos" | "neg";
  detail: string;
}) {
  const barColor = tone === "pos" ? "bg-emerald-500/70" : "bg-destructive/70";
  const txtColor = tone === "pos" ? "text-emerald-400" : "text-destructive";
  return (
    <div className="border border-border/60 bg-secondary/30 px-2 py-1.5 rounded-sm">
      <div className="flex items-center justify-between gap-1 mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1">{icon}{label}</span>
        <span className={`${txtColor} font-bold`}>{value}</span>
      </div>
      <div className="h-1 bg-background/60 mt-1 overflow-hidden rounded-sm">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="mono text-[10px] text-muted-foreground mt-0.5">{detail}</div>
    </div>
  );
}