import type { ThurayaUnit } from "@/lib/thurayaStore";
import { ThurayaEquipmentPanel } from "@/components/thuraya/ThurayaEquipmentPanel";

type ThurayaUnitTileProps = {
  unit: ThurayaUnit;
  onOpenLightbox: (unit: ThurayaUnit) => void;
  onTilePanelMove: (unitId: string, position: { x: number; y: number }) => void;
};

export function ThurayaUnitTile({ unit, onOpenLightbox, onTilePanelMove }: ThurayaUnitTileProps) {
  return (
    <article className="panel flex flex-col overflow-hidden min-h-[15rem] sm:min-h-[17rem] lg:min-h-[19rem]">
      <header className="shrink-0 border-b border-border/70 bg-secondary/25 px-3 py-2">
        <h3 className="mono text-sm sm:text-base font-bold uppercase tracking-wide truncate">
          {unit.name}
        </h3>
      </header>

      <div className="relative flex-1 min-h-[12rem] w-full overflow-hidden">
        <button
          type="button"
          className="absolute inset-0 z-0 w-full h-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          onClick={() => onOpenLightbox(unit)}
          aria-label={`Enlarge image for ${unit.name}`}
        >
          {unit.imageDataUrl ? (
            <img
              src={unit.imageDataUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover opacity-45"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-muted/30 to-amber-700/10" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10 pointer-events-none" />

          {!unit.imageDataUrl ? (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center mono text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Click to preview · upload image via Advanced Features
            </p>
          ) : null}
        </button>

        <ThurayaEquipmentPanel
          profile={unit.equipmentProfile}
          position={unit.tilePanelPosition}
          draggable
          size="tile"
          onPositionChange={(position) => onTilePanelMove(unit.id, position)}
        />
      </div>
    </article>
  );
}
