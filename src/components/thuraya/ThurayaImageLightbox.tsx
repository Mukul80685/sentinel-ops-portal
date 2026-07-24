import { useEffect } from "react";
import { X } from "lucide-react";
import type { ThurayaUnit } from "@/lib/thurayaStore";
import { ThurayaEquipmentPanel } from "@/components/thuraya/ThurayaEquipmentPanel";
import { Button } from "@/components/ui/button";

type ThurayaImageLightboxProps = {
  unit: ThurayaUnit | null;
  onClose: () => void;
  onLightboxPanelMove: (unitId: string, position: { x: number; y: number }) => void;
};

export function ThurayaImageLightbox({
  unit,
  onClose,
  onLightboxPanelMove,
}: ThurayaImageLightboxProps) {
  useEffect(() => {
    if (!unit) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [unit, onClose]);

  if (!unit) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${unit.name} image preview`}
      onClick={onClose}
    >
      <div
        className="relative w-[min(92vw,56rem)] h-[min(78vh,40rem)] rounded-xl border border-border/80 bg-card shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-20 h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
          onClick={onClose}
          aria-label="Close preview"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="absolute top-2 left-3 z-20 mono text-xs sm:text-sm font-bold uppercase tracking-wide text-white drop-shadow">
          {unit.name}
        </div>

        <div className="relative h-full w-full">
          {unit.imageDataUrl ? (
            <img
              src={unit.imageDataUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-contain bg-black/20"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/40 px-6 text-center">
              <p className="mono text-sm text-muted-foreground">
                No image uploaded yet. Use Advanced Features to upload an image for this unit.
              </p>
            </div>
          )}

          <ThurayaEquipmentPanel
            profile={unit.equipmentProfile}
            position={unit.lightboxPanelPosition}
            draggable
            size="lightbox"
            onPositionChange={(position) => onLightboxPanelMove(unit.id, position)}
          />
        </div>
      </div>
    </div>
  );
}
