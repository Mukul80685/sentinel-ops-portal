import { useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { UnitAdvancedFeatures } from "@/components/UnitAdvancedFeatures";
import { useModuleUnits } from "@/hooks/useModuleUnits";
import { unitDisplayLabel, unitDisplayLocation } from "@/lib/operationalDataset";
import {
  allocationSlotForUnit,
  UNIT_LOCATIONS,
  useAllocationCounts,
} from "@/lib/priorityAllocation";

function UnitTileGrid({ basePath, fill }: { basePath: string; fill?: boolean }) {
  const navigate = useNavigate();
  const { units } = useModuleUnits("priority");

  const unitSlots = units.map((u) => allocationSlotForUnit(u));
  const counts = useAllocationCounts(unitSlots);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div
        className={
          fill
            ? "grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-h-0 auto-rows-fr overflow-y-auto"
            : "grid grid-cols-2 sm:grid-cols-4 gap-2"
        }
      >
        {units.map((unit, idx) => {
          const slot = unitSlots[idx];
          const title = unitDisplayLabel(unit);
          const location = unitDisplayLocation(unit, UNIT_LOCATIONS[slot]);
          const count = counts[slot] ?? 0;

          return (
            <button
              key={unit.id}
              type="button"
              onClick={() => navigate({ to: `${basePath}/$unitId`, params: { unitId: unit.id } })}
              className={`tile text-center flex flex-col justify-between focus:outline-none focus:border-primary p-3 hover:border-primary cursor-pointer ${
                fill ? "h-full min-h-[9rem]" : "min-h-[72px]"
              }`}
            >
              <div className="min-w-0">
                <div className="mono text-[14px] sm:text-[15px] font-bold uppercase leading-tight">
                  {title}
                </div>
                <div className="text-[10px] text-muted-foreground mono mt-1 truncate">{location}</div>
              </div>

              <div className="flex flex-col items-center justify-center flex-1 py-2 min-h-[3rem]">
                <span className="mono text-[26px] sm:text-[32px] font-bold text-primary leading-none tabular-nums">
                  {count}
                </span>
                <span className="mono text-[10px] sm:text-[11px] text-muted-foreground mt-1 uppercase tracking-wider">
                  Satellite{count !== 1 ? "s" : ""}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {units.length === 0 && (
        <p className="text-sm text-muted-foreground py-10 text-center">
          No units registered. Use Advanced Features → Add Unit to create one.
        </p>
      )}

      {/* ── Advanced Features — shared across all modules ── */}
      <div className="shrink-0">
        <UnitAdvancedFeatures scope="priority" />
      </div>
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
