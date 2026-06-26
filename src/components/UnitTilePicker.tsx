import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { listUnits } from "@/lib/queries";
import {
  slotFromIndex,
  unitTileTitle,
  UNIT_LOCATIONS,
  useAllocationCounts,
} from "@/lib/priorityAllocation";

const SLOT_COUNT = 8;

function UnitTileGrid({ basePath, fill }: { basePath: string; fill?: boolean }) {
  const navigate = useNavigate();
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const counts = useAllocationCounts();
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
    <div
      className={
        fill
          ? "grid grid-cols-2 sm:grid-cols-4 grid-rows-4 sm:grid-rows-2 gap-2 flex-1 min-h-0 h-full auto-rows-fr"
          : "grid grid-cols-2 sm:grid-cols-4 gap-2"
      }
    >
      {Array.from({ length: SLOT_COUNT }, (_, idx) => {
        const unit = units[idx];
        const slot = slotFromIndex(idx);
        const unavailable = warn === idx && !unit;
        const title = slot ? unitTileTitle(slot) : `Unit ${String.fromCharCode(65 + idx)}`;
        const location = slot ? UNIT_LOCATIONS[slot] : "";
        const count = slot ? counts[slot] : 0;

        return (
          <button
            key={idx}
            type="button"
            onClick={() => pick(idx)}
            className={`tile text-center flex flex-col justify-between focus:outline-none focus:border-primary p-3 ${
              fill ? "h-full min-h-0" : "min-h-[72px]"
            } ${unit ? "hover:border-primary cursor-pointer" : "opacity-80"}`}
          >
            <div className="min-w-0">
              <div className="mono text-[14px] sm:text-[15px] font-bold uppercase leading-tight">
                {title}
              </div>
              {unit ? (
                <div className="text-[10px] text-muted-foreground mono mt-1 truncate">{location}</div>
              ) : (
                <div
                  className={`text-[10px] mono mt-1 ${
                    unavailable ? "text-destructive" : "text-foreground/75"
                  }`}
                >
                  {unavailable ? "No agent registered for this unit" : "Unassigned"}
                </div>
              )}
            </div>

            {unit && slot && (
              <div className="flex flex-col items-center justify-center flex-1 py-2 min-h-[3rem]">
                <span className="mono text-[26px] sm:text-[32px] font-bold text-primary leading-none tabular-nums">
                  {count}
                </span>
                <span className="mono text-[10px] sm:text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">
                  Satellite{count !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Embedded in Control Center — no AppShell wrapper */
export function PriorityAllocationView() {
  return (
    <div className="flex flex-col -m-4 sm:-m-6 p-4 sm:p-6 h-[calc(100dvh-7.5rem)] min-h-0 overflow-hidden">
      <UnitTileGrid basePath="/priority" fill />
    </div>
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
      <UnitTileGrid basePath={basePath} fill />
    </AppShell>
  );
}
