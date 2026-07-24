import { useRef } from "react";
import { GripVertical } from "lucide-react";
import type { ThurayaEquipmentProfile, ThurayaPanelPosition } from "@/lib/thurayaStore";
import {
  formatThurayaEquipmentLine,
  getThurayaEquipment,
} from "@/lib/thurayaEquipment";

type ThurayaEquipmentPanelProps = {
  profile: ThurayaEquipmentProfile;
  position: ThurayaPanelPosition;
  draggable?: boolean;
  onPositionChange?: (position: ThurayaPanelPosition) => void;
  /** Tile grid uses medium panel; lightbox popup uses larger text and padding. */
  size?: "tile" | "lightbox";
};

const SIZE_STYLES = {
  tile: {
    shell:
      "max-w-[min(20rem,94%)] min-w-[11rem] px-3 py-2.5 rounded-lg border-white/55 bg-black/60",
    title: "text-[10px] sm:text-xs",
    list: "text-[11px] sm:text-sm leading-snug",
    grip: "h-3.5 w-3.5",
    headerGap: "gap-1.5 pb-1.5 mb-1.5",
    itemGap: "space-y-1",
  },
  lightbox: {
    shell:
      "max-w-[min(28rem,90%)] min-w-[16rem] px-4 py-3.5 rounded-lg border-white/60 bg-black/65",
    title: "text-xs sm:text-sm",
    list: "text-sm sm:text-base leading-relaxed",
    grip: "h-4 w-4",
    headerGap: "gap-2 pb-2 mb-2",
    itemGap: "space-y-1.5",
  },
} as const;

export function ThurayaEquipmentPanel({
  profile,
  position,
  draggable = false,
  onPositionChange,
  size = "tile",
}: ThurayaEquipmentPanelProps) {
  const styles = SIZE_STYLES[size];
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);

  const items = getThurayaEquipment(profile);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggable || !onPositionChange) return;
    const container = event.currentTarget.offsetParent as HTMLElement | null;
    if (!container) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = dragState.current;
    if (!state || !onPositionChange || state.pointerId !== event.pointerId) return;

    event.stopPropagation();
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    const nextX = state.originX + (dx / state.containerWidth) * 100;
    const nextY = state.originY + (dy / state.containerHeight) * 100;

    onPositionChange({
      x: Math.min(82, Math.max(0, nextX)),
      y: Math.min(82, Math.max(0, nextY)),
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current || dragState.current.pointerId !== event.pointerId) return;
    dragState.current = null;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      className={`absolute z-10 border text-white shadow-lg backdrop-blur-sm ${styles.shell} ${
        draggable ? "cursor-grab active:cursor-grabbing touch-none" : ""
      }`}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className={`flex items-center border-b border-white/25 ${styles.headerGap}`}>
        {draggable ? (
          <GripVertical className={`${styles.grip} shrink-0 opacity-75`} />
        ) : null}
        <p className={`mono font-bold uppercase tracking-wider ${styles.title}`}>
          Equipment Details
        </p>
      </div>
      <ul className={`mono ${styles.list} ${styles.itemGap}`}>
        {items.map((item) => (
          <li key={item.label}>{formatThurayaEquipmentLine(item)}</li>
        ))}
      </ul>
    </div>
  );
}
