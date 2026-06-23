import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { listUnits } from "@/lib/queries";
import { Building2, Radar } from "lucide-react";

const LABELS = ["Unit A", "Unit B", "Unit C", "Unit D", "Unit E", "Unit F", "Unit G", "Unit H"];

function UnitTileGrid({ basePath }: { basePath: string }) {
  const navigate = useNavigate();
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const [warn, setWarn] = useState<number | null>(null);

  function pick(idx: number) {
    const unit = units[idx];
    if (!unit) {
      setWarn(idx);
      return;
    }
    navigate({ to: `${basePath}/$unitId`, params: { unitId: unit.id } });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {LABELS.map((label, idx) => {
        const unit = units[idx];
        const unavailable = warn === idx && !unit;
        return (
          <button
            key={label}
            type="button"
            onClick={() => pick(idx)}
            className={`tile text-left min-h-[72px] flex flex-col justify-between focus:outline-none focus:border-primary p-2.5 ${
              unit ? "hover:border-primary cursor-pointer" : "opacity-80"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span className="label-eyebrow text-[9px]">Slot {String.fromCharCode(65 + idx)}</span>
              </div>
              <Radar
                className="h-3 w-3 text-primary/45 shrink-0"
                aria-label="Visibility matrix participant"
              />
            </div>
            <div>
              <div className="mono text-[13px] font-bold uppercase leading-tight">{label}</div>
              {unit ? (
                <div className="text-[10px] text-foreground/85 mono mt-0.5 truncate">
                  {unit.code} — {unit.name}
                </div>
              ) : (
                <div
                  className={`text-[10px] mono mt-0.5 ${
                    unavailable ? "text-destructive" : "text-foreground/75"
                  }`}
                >
                  {unavailable ? "No agent registered for this unit" : "Unassigned"}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Embedded in Control Center — no AppShell wrapper */
export function PriorityAllocationView() {
  return (
    <>
      <div className="panel p-4 mb-3">
        <div className="label-eyebrow">Select Unit</div>
        <div className="mono text-[11px] text-foreground/85 mt-1">
          Choose a unit (A–H) to enter satellite priority and allocation.
        </div>
      </div>
      <UnitTileGrid basePath="/priority" />
    </>
  );
}

export function UnitTilePicker({
  title,
  subtitle,
  basePath,
}: {
  title: string;
  subtitle: string;
  basePath: string;
}) {
  return (
    <AppShell title={title} subtitle={subtitle} horizontalNav={null}>
      <div className="panel p-4 mb-3">
        <div className="label-eyebrow">Select Unit</div>
        <div className="mono text-[11px] text-foreground/85 mt-1">
          Choose a unit (A–H) to enter this module.
        </div>
      </div>
      <UnitTileGrid basePath={basePath} />
    </AppShell>
  );
}
