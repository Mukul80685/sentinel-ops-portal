import { Link } from "@tanstack/react-router";
import {
  Activity,
  Check,
  Eye,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import {
  ExecutiveProgressRing,
  OptimizationScoreLegend,
} from "@/components/satellite-monitoring/ExecutiveProgressRing";
import { useExecutiveDashboardMetrics } from "@/components/satellite-monitoring/useExecutiveDashboardMetrics";
import { DASHBOARD_PANEL_LABELS, DASHBOARD_PANEL_PURPOSE, type DashboardPanel } from "@/lib/dashboardLabels";

export type { DashboardPanel };

const TILE_CLASS =
  "home-module-tile relative flex flex-col items-center justify-center gap-4 sm:gap-5 lg:gap-6 " +
  "h-full min-h-[16rem] sm:min-h-[18rem] py-6 sm:py-8 px-4 sm:px-6 text-center no-underline group";

type TileConfig = {
  panel: DashboardPanel;
  accent: string;
};

const TILES: TileConfig[] = [
  { panel: "engagement", accent: "bg-gradient-to-r from-transparent via-emerald-500 to-transparent" },
  { panel: "activity", accent: "bg-gradient-to-r from-transparent via-sky-500 to-transparent" },
  { panel: "optimization", accent: "bg-gradient-to-r from-transparent via-amber-500 to-transparent" },
];

const ZOOM_LEVELS = [1, 1.6, 2.5] as const;
const DRAG_THRESHOLD_PX = 5;
const MAP_MARKERS_LEGACY_KEY = "ssacc_map_markers_v1";
const MAP_MARKERS_STORAGE_KEY = "ssacc_map_markers_v2";
const MARKER_PERCENT_MIN = 2;
const MARKER_PERCENT_MAX = 98;
const LABEL_BLOCK_OFFSET_Y = 10;

const LABEL_TEXT_SHADOW = "0 0 4px rgba(255,255,255,0.9), 0 0 8px rgba(255,255,255,0.7)";

type MapMarkerPosition = {
  xPercent: number;
  yPercent: number;
};

type MapMarker = {
  id: string;
  pin: MapMarkerPosition;
  label: MapMarkerPosition & { line1: string; line2: string };
  locked: boolean;
};

type MarkerSnapshot = {
  pin: MapMarkerPosition;
  label: MapMarkerPosition & { line1: string; line2: string };
};

type MapInteractionState = {
  startX: number;
  startY: number;
  panX: number;
  panY: number;
  panStarted: boolean;
  pointerId: number;
  placementX: number;
  placementY: number;
};

type ScreenCoords = {
  screenX: number;
  screenY: number;
};

function clampPercent(value: number) {
  return Math.min(MARKER_PERCENT_MAX, Math.max(MARKER_PERCENT_MIN, value));
}

function isValidMapMarkerPosition(value: unknown): value is MapMarkerPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Record<string, unknown>;
  return typeof position.xPercent === "number" && typeof position.yPercent === "number";
}

function isValidLabelBlock(value: unknown): value is MapMarkerPosition & { line1: string; line2: string } {
  if (!isValidMapMarkerPosition(value)) return false;
  const label = value as Record<string, unknown>;
  return typeof label.line1 === "string" && typeof label.line2 === "string";
}

function isValidMapMarker(value: unknown): value is MapMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Record<string, unknown>;
  return (
    typeof marker.id === "string" &&
    isValidMapMarkerPosition(marker.pin) &&
    isValidLabelBlock(marker.label) &&
    (marker.locked === undefined || typeof marker.locked === "boolean")
  );
}

function normalizeMapMarker(value: MapMarker): MapMarker {
  return { ...value, locked: value.locked === true };
}

function loadMapMarkers(): MapMarker[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(MAP_MARKERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidMapMarker).map(normalizeMapMarker);
  } catch {
    return [];
  }
}

function saveMapMarkers(markers: MapMarker[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MAP_MARKERS_STORAGE_KEY, JSON.stringify(markers));
}

function clampPan(panX: number, panY: number, scale: number, viewportW: number, viewportH: number) {
  if (scale <= 1) {
    return { panX: 0, panY: 0 };
  }

  const scaledW = viewportW * scale;
  const scaledH = viewportH * scale;

  return {
    panX: Math.min(0, Math.max(viewportW - scaledW, panX)),
    panY: Math.min(0, Math.max(viewportH - scaledH, panY)),
  };
}

function panForZoomAtPoint(
  panX: number,
  panY: number,
  scale: number,
  nextScale: number,
  cx: number,
  cy: number,
  viewportW: number,
  viewportH: number,
) {
  if (nextScale <= 1) {
    return { panX: 0, panY: 0 };
  }

  const contentX = (cx - panX) / scale;
  const contentY = (cy - panY) / scale;
  const nextPanX = cx - contentX * nextScale;
  const nextPanY = cy - contentY * nextScale;

  return clampPan(nextPanX, nextPanY, nextScale, viewportW, viewportH);
}

function viewportToMarkerPercents(
  viewportX: number,
  viewportY: number,
  panX: number,
  panY: number,
  scale: number,
  viewportW: number,
  viewportH: number,
) {
  if (viewportW <= 0 || viewportH <= 0) {
    return { xPercent: 50, yPercent: 50 };
  }

  const contentX = (viewportX - panX) / scale;
  const contentY = (viewportY - panY) / scale;

  return {
    xPercent: clampPercent((contentX / viewportW) * 100),
    yPercent: clampPercent((contentY / viewportH) * 100),
  };
}

function markerToScreenCoords(
  xPercent: number,
  yPercent: number,
  panX: number,
  panY: number,
  scale: number,
  viewportW: number,
  viewportH: number,
): ScreenCoords {
  return {
    screenX: panX + (xPercent / 100) * viewportW * scale,
    screenY: panY + (yPercent / 100) * viewportH * scale,
  };
}

function stopMarkerPointerEvent(event: ReactPointerEvent) {
  event.stopPropagation();
}

function createMarkerPartDragHandlers({
  dragRef,
  enabled,
  onDragActiveChange,
  onMove,
  clientToMarkerPercents,
}: {
  dragRef: MutableRefObject<boolean>;
  enabled: boolean;
  onDragActiveChange: (active: boolean) => void;
  onMove: (position: MapMarkerPosition) => void;
  clientToMarkerPercents: (clientX: number, clientY: number) => MapMarkerPosition;
}) {
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;

    dragRef.current = false;
    onDragActiveChange(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;

      event.stopPropagation();
      event.preventDefault();
      dragRef.current = true;
      onDragActiveChange(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      onMove(clientToMarkerPercents(event.clientX, event.clientY));
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}

function MapPinIcon() {
  return (
    <svg
      width="24"
      height="32"
      viewBox="0 0 24 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="block shrink-0 drop-shadow-md"
    >
      <path
        d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z"
        fill="#E53935"
      />
      <circle cx="12" cy="9" r="3.5" fill="white" />
    </svg>
  );
}

function MapMarkerEditToolbar({
  pinScreen,
  marker,
  onConfirm,
  onDiscard,
  onUnlock,
  onDelete,
}: {
  pinScreen: ScreenCoords;
  marker: MapMarker;
  onConfirm: (id: string) => void;
  onDiscard: (id: string) => void;
  onUnlock: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      data-map-marker
      className="absolute z-[7] pointer-events-none"
      style={{ left: pinScreen.screenX, top: pinScreen.screenY }}
    >
      <div
        className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full pointer-events-auto -mt-1 flex items-center gap-0.5"
        data-map-marker-no-drag
        onPointerDown={stopMarkerPointerEvent}
        onDoubleClick={stopMarkerPointerEvent}
      >
        {!marker.locked ? (
          <>
            <button
              type="button"
              aria-label="Confirm marker"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600/90 text-white shadow hover:bg-emerald-600"
              onClick={(event) => {
                event.stopPropagation();
                onConfirm(marker.id);
              }}
            >
              <Check className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              aria-label="Discard changes"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-600/90 text-white shadow hover:bg-amber-600"
              onClick={(event) => {
                event.stopPropagation();
                onDiscard(marker.id);
              }}
            >
              <Undo2 className="h-2.5 w-2.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label="Edit marker"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0a1628]/90 text-white shadow hover:bg-[#0a1628]"
            onClick={(event) => {
              event.stopPropagation();
              onUnlock(marker.id);
            }}
          >
            <Pencil className="h-2 w-2" />
          </button>
        )}
        <button
          type="button"
          aria-label="Delete marker"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600/90 text-white shadow hover:bg-red-600"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(marker.id);
          }}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

function MapMarker({
  marker,
  pinScreen,
  labelScreen,
  isEditMode,
  autoFocusLine1,
  onUpdateLine1,
  onUpdateLine2,
  onUpdatePinPosition,
  onUpdateLabelPosition,
  onDelete,
  onConfirm,
  onDiscard,
  onUnlock,
  onDragActiveChange,
  clientToMarkerPercents,
}: {
  marker: MapMarker;
  pinScreen: ScreenCoords;
  labelScreen: ScreenCoords;
  isEditMode: boolean;
  autoFocusLine1: boolean;
  onUpdateLine1: (id: string, line1: string) => void;
  onUpdateLine2: (id: string, line2: string) => void;
  onUpdatePinPosition: (id: string, position: MapMarkerPosition) => void;
  onUpdateLabelPosition: (id: string, position: MapMarkerPosition) => void;
  onDelete: (id: string) => void;
  onConfirm: (id: string) => void;
  onDiscard: (id: string) => void;
  onUnlock: (id: string) => void;
  onDragActiveChange: (active: boolean) => void;
  clientToMarkerPercents: (clientX: number, clientY: number) => MapMarkerPosition;
}) {
  const line1InputRef = useRef<HTMLInputElement>(null);
  const line2InputRef = useRef<HTMLInputElement>(null);
  const pinDragRef = useRef(false);
  const labelDragRef = useRef(false);

  useEffect(() => {
    if (autoFocusLine1 && isEditMode && !marker.locked) {
      line1InputRef.current?.focus();
    }
  }, [autoFocusLine1, isEditMode, marker.locked]);

  const pinDragHandlers = createMarkerPartDragHandlers({
    dragRef: pinDragRef,
    enabled: isEditMode,
    onDragActiveChange,
    onMove: (position) => onUpdatePinPosition(marker.id, position),
    clientToMarkerPercents,
  });

  const labelDragHandlers = createMarkerPartDragHandlers({
    dragRef: labelDragRef,
    enabled: isEditMode,
    onDragActiveChange,
    onMove: (position) => onUpdateLabelPosition(marker.id, position),
    clientToMarkerPercents,
  });

  return (
    <>
      <div
        data-map-marker
        className={`absolute z-[6] pointer-events-auto -translate-x-1/2 -translate-y-full touch-none ${
          isEditMode
            ? "cursor-move rounded-full ring-2 ring-white/70 animate-pulse"
            : "transition-transform duration-200 ease-out hover:scale-110"
        }`}
        style={{ left: pinScreen.screenX, top: pinScreen.screenY }}
        onDoubleClick={stopMarkerPointerEvent}
        onPointerDown={pinDragHandlers.onPointerDown}
        onPointerMove={pinDragHandlers.onPointerMove}
        onPointerUp={pinDragHandlers.onPointerUp}
        onPointerCancel={pinDragHandlers.onPointerCancel}
        onClick={(event) => {
          if (isEditMode) return;
          event.stopPropagation();
          console.log(marker.id);
        }}
      >
        <MapPinIcon />
      </div>

      <div
        data-map-marker
        className={`absolute z-[6] pointer-events-auto min-w-[160px] min-h-[52px] ${
          isEditMode ? "" : "transition-transform duration-200 ease-out hover:scale-110"
        }`}
        style={{ left: labelScreen.screenX, top: labelScreen.screenY }}
        onDoubleClick={stopMarkerPointerEvent}
      >
        {isEditMode ? (
          <div
            className="flex items-stretch border border-black/50 bg-transparent"
            onPointerDown={stopMarkerPointerEvent}
          >
            <button
              type="button"
              aria-label="Drag label block"
              title="Drag label"
              className="flex w-5 min-w-[20px] shrink-0 cursor-move touch-none items-center justify-center self-stretch border-r border-black/50 bg-transparent px-0.5 text-[14px] leading-none text-black"
              {...labelDragHandlers}
            >
              ⠿
            </button>
            <div className="flex min-w-0 flex-col px-1 py-0.5">
              <input
                ref={line1InputRef}
                type="text"
                value={marker.label.line1}
                readOnly={marker.locked}
                onChange={(event) => onUpdateLine1(marker.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    line2InputRef.current?.focus();
                  }
                }}
                onPointerDown={stopMarkerPointerEvent}
                placeholder="Unit name"
                className="w-36 border-0 bg-transparent px-0 py-0.5 text-[13px] font-bold text-black placeholder:text-black/40 outline-none read-only:opacity-80"
              />
              <input
                ref={line2InputRef}
                type="text"
                value={marker.label.line2}
                readOnly={marker.locked}
                onChange={(event) => onUpdateLine2(marker.id, event.target.value)}
                onPointerDown={stopMarkerPointerEvent}
                placeholder="Location"
                className="w-36 border-0 bg-transparent px-0 py-0.5 text-[11px] font-bold text-black placeholder:text-black/40 outline-none read-only:opacity-80"
              />
            </div>
          </div>
        ) : (
          <div className="min-w-max pl-5">
            {marker.label.line1 ? (
              <p
                className="text-[13px] font-bold leading-tight whitespace-nowrap text-black"
                style={{ textShadow: LABEL_TEXT_SHADOW }}
              >
                {marker.label.line1}
              </p>
            ) : null}
            {marker.label.line2 ? (
              <p
                className="text-[11px] font-bold leading-tight whitespace-nowrap text-black"
                style={{ textShadow: LABEL_TEXT_SHADOW }}
              >
                {marker.label.line2}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {isEditMode ? (
        <MapMarkerEditToolbar
          pinScreen={pinScreen}
          marker={marker}
          onConfirm={onConfirm}
          onDiscard={onDiscard}
          onUnlock={onUnlock}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

function MapZoomPanViewport() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<MapInteractionState | null>(null);
  const markerDragActiveRef = useRef(false);
  const editSnapshotRef = useRef<Record<string, MarkerSnapshot> | null>(null);
  const newMarkerIdsRef = useRef<Set<string>>(new Set());

  const [zoomIndex, setZoomIndex] = useState(0);
  const [pan, setPan] = useState({ panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [isEditMode, setIsEditMode] = useState(false);
  const [markers, setMarkers] = useState<MapMarker[]>(() => loadMapMarkers());
  const [newMarkerFocusId, setNewMarkerFocusId] = useState<string | null>(null);

  const scale = ZOOM_LEVELS[zoomIndex];

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(MAP_MARKERS_LEGACY_KEY);
    }
  }, []);

  useEffect(() => {
    saveMapMarkers(markers);
  }, [markers]);

  const readViewportSize = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return { w: 0, h: 0 };
    return { w: el.clientWidth, h: el.clientHeight };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateSize = () => {
      const { w, h } = readViewportSize();
      setViewportSize({ w, h });
      setPan((prev) => clampPan(prev.panX, prev.panY, ZOOM_LEVELS[zoomIndex], w, h));
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [readViewportSize, zoomIndex]);

  const applyZoomIndex = useCallback(
    (nextIndex: number, focalX: number, focalY: number) => {
      const { w, h } = readViewportSize();
      const nextScale = ZOOM_LEVELS[nextIndex];
      const nextPan = panForZoomAtPoint(pan.panX, pan.panY, scale, nextScale, focalX, focalY, w, h);
      setZoomIndex(nextIndex);
      setPan(nextPan);
    },
    [pan.panX, pan.panY, readViewportSize, scale],
  );

  const getFocalPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) {
        return { x: viewportSize.w / 2, y: viewportSize.h / 2 };
      }
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [viewportSize.h, viewportSize.w],
  );

  const clientToMarkerPercents = useCallback(
    (clientX: number, clientY: number) => {
      const { x, y } = getFocalPoint(clientX, clientY);
      const { w, h } = readViewportSize();
      return viewportToMarkerPercents(x, y, pan.panX, pan.panY, scale, w, h);
    },
    [getFocalPoint, pan.panX, pan.panY, readViewportSize, scale],
  );

  const updateLine1 = useCallback((id: string, line1: string) => {
    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id === id ? { ...marker, label: { ...marker.label, line1 } } : marker,
      ),
    );
  }, []);

  const updateLine2 = useCallback((id: string, line2: string) => {
    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id === id ? { ...marker, label: { ...marker.label, line2 } } : marker,
      ),
    );
  }, []);

  const updatePinPosition = useCallback((id: string, position: MapMarkerPosition) => {
    setMarkers((prev) =>
      prev.map((marker) => (marker.id === id ? { ...marker, pin: position } : marker)),
    );
  }, []);

  const updateLabelPosition = useCallback((id: string, position: MapMarkerPosition) => {
    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id === id ? { ...marker, label: { ...marker.label, ...position } } : marker,
      ),
    );
  }, []);

  const deleteMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((marker) => marker.id !== id));
    newMarkerIdsRef.current.delete(id);
    setNewMarkerFocusId((prev) => (prev === id ? null : prev));
  }, []);

  const confirmMarker = useCallback((id: string) => {
    setMarkers((prev) =>
      prev.map((marker) => (marker.id === id ? { ...marker, locked: true } : marker)),
    );
    newMarkerIdsRef.current.delete(id);
    setNewMarkerFocusId((prev) => (prev === id ? null : prev));
  }, []);

  const discardMarker = useCallback(
    (id: string) => {
      if (newMarkerIdsRef.current.has(id)) {
        deleteMarker(id);
        return;
      }

      const snapshot = editSnapshotRef.current?.[id];
      if (!snapshot) return;

      setMarkers((prev) =>
        prev.map((marker) =>
          marker.id === id
            ? {
                ...marker,
                pin: snapshot.pin,
                label: snapshot.label,
                locked: true,
              }
            : marker,
        ),
      );
      setNewMarkerFocusId((prev) => (prev === id ? null : prev));
    },
    [deleteMarker],
  );

  const unlockMarker = useCallback((id: string) => {
    setMarkers((prev) =>
      prev.map((marker) => (marker.id === id ? { ...marker, locked: false } : marker)),
    );
    setNewMarkerFocusId(id);
  }, []);

  const addMarkerAtViewportPoint = useCallback(
    (viewportX: number, viewportY: number) => {
      const { xPercent, yPercent } = clientToMarkerPercents(viewportX, viewportY);
      const id = crypto.randomUUID();
      newMarkerIdsRef.current.add(id);
      setMarkers((prev) => [
        ...prev,
        {
          id,
          pin: { xPercent, yPercent },
          label: {
            xPercent,
            yPercent: clampPercent(yPercent + LABEL_BLOCK_OFFSET_Y),
            line1: "",
            line2: "",
          },
          locked: false,
        },
      ]);
      setNewMarkerFocusId(id);
    },
    [clientToMarkerPercents],
  );

  const handleMarkerDragActiveChange = useCallback((active: boolean) => {
    markerDragActiveRef.current = active;
  }, []);

  const beginPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.panStarted) return;

    interaction.panStarted = true;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(interaction.pointerId);
  }, []);

  const handleDoubleClick = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isEditMode) return;

      event.preventDefault();
      const { x, y } = getFocalPoint(event.clientX, event.clientY);
      const nextIndex = zoomIndex >= ZOOM_LEVELS.length - 1 ? 0 : zoomIndex + 1;
      applyZoomIndex(nextIndex, x, y);
    },
    [applyZoomIndex, getFocalPoint, isEditMode, zoomIndex],
  );

  const handleZoomIn = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (zoomIndex >= ZOOM_LEVELS.length - 1) return;
      const { w, h } = readViewportSize();
      applyZoomIndex(zoomIndex + 1, w / 2, h / 2);
    },
    [applyZoomIndex, readViewportSize, zoomIndex],
  );

  const handleZoomOut = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (zoomIndex <= 0) return;
      const { w, h } = readViewportSize();
      applyZoomIndex(zoomIndex - 1, w / 2, h / 2);
    },
    [applyZoomIndex, readViewportSize, zoomIndex],
  );

  const handleReset = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setZoomIndex(0);
    setPan({ panX: 0, panY: 0 });
  }, []);

  const handleToggleEditMode = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    setIsEditMode((prev) => {
      const entering = !prev;

      if (entering) {
        setMarkers((currentMarkers) => {
          editSnapshotRef.current = Object.fromEntries(
            currentMarkers.map((marker) => [
              marker.id,
              {
                pin: { ...marker.pin },
                label: { ...marker.label },
              },
            ]),
          );
          newMarkerIdsRef.current = new Set();
          return currentMarkers.map((marker) => ({ ...marker, locked: false }));
        });
      } else {
        editSnapshotRef.current = null;
        newMarkerIdsRef.current = new Set();
        setMarkers((currentMarkers) => currentMarkers.map((marker) => ({ ...marker, locked: false })));
        setNewMarkerFocusId(null);
      }

      return entering;
    });
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      const target = event.target as HTMLElement;
      if (target.closest("[data-map-marker]")) return;

      const { x, y } = getFocalPoint(event.clientX, event.clientY);

      interactionRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        panX: pan.panX,
        panY: pan.panY,
        panStarted: false,
        pointerId: event.pointerId,
        placementX: x,
        placementY: y,
      };

      if (!isEditMode && scale > 1) {
        beginPan(event);
      }
    },
    [beginPan, getFocalPoint, isEditMode, pan.panX, pan.panY, scale],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      if (!interaction.panStarted) {
        const dx = event.clientX - interaction.startX;
        const dy = event.clientY - interaction.startY;
        const distance = Math.hypot(dx, dy);

        if (isEditMode && scale > 1 && distance > DRAG_THRESHOLD_PX) {
          beginPan(event);
        } else {
          return;
        }
      }

      if (!interaction.panStarted || scale <= 1) return;

      const { w, h } = readViewportSize();
      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;
      const nextPan = clampPan(interaction.panX + dx, interaction.panY + dy, scale, w, h);
      setPan(nextPan);
    },
    [beginPan, isEditMode, readViewportSize, scale],
  );

  const endInteraction = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      if (isEditMode && !interaction.panStarted && !markerDragActiveRef.current) {
        addMarkerAtViewportPoint(interaction.placementX, interaction.placementY);
      }

      if (interaction.panStarted && event.currentTarget.hasPointerCapture(interaction.pointerId)) {
        event.currentTarget.releasePointerCapture(interaction.pointerId);
      }

      interactionRef.current = null;
      setIsDragging(false);
    },
    [addMarkerAtViewportPoint, isEditMode],
  );

  const cursorClass = isEditMode
    ? isDragging
      ? "cursor-grabbing"
      : "cursor-crosshair"
    : scale > 1
      ? isDragging
        ? "cursor-grabbing"
        : "cursor-grab"
      : "cursor-default";

  return (
    <div
      ref={viewportRef}
      className={`relative flex-1 min-h-0 h-full w-full overflow-hidden select-none touch-none ${cursorClass}`}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
    >
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `translate(${pan.panX}px, ${pan.panY}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <img
          src="/map.jpeg"
          alt=""
          draggable={false}
          className="block w-full h-full object-fill object-center pointer-events-none"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-[5]">
        {markers.map((marker) => {
          const pinScreen = markerToScreenCoords(
            marker.pin.xPercent,
            marker.pin.yPercent,
            pan.panX,
            pan.panY,
            scale,
            viewportSize.w,
            viewportSize.h,
          );
          const labelScreen = markerToScreenCoords(
            marker.label.xPercent,
            marker.label.yPercent,
            pan.panX,
            pan.panY,
            scale,
            viewportSize.w,
            viewportSize.h,
          );

          return (
            <MapMarker
              key={marker.id}
              marker={marker}
              pinScreen={pinScreen}
              labelScreen={labelScreen}
              isEditMode={isEditMode}
              autoFocusLine1={newMarkerFocusId === marker.id}
              onUpdateLine1={updateLine1}
              onUpdateLine2={updateLine2}
              onUpdatePinPosition={updatePinPosition}
              onUpdateLabelPosition={updateLabelPosition}
              onDelete={deleteMarker}
              onConfirm={confirmMarker}
              onDiscard={discardMarker}
              onUnlock={unlockMarker}
              onDragActiveChange={handleMarkerDragActiveChange}
              clientToMarkerPercents={clientToMarkerPercents}
            />
          );
        })}
      </div>

      <div
        className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <MapControlButton
          label={isEditMode ? "Switch to view mode" : "Switch to edit mode"}
          onClick={handleToggleEditMode}
          active={isEditMode}
        >
          {isEditMode ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </MapControlButton>
        <MapControlButton
          label="Zoom out"
          onClick={handleZoomOut}
          disabled={zoomIndex <= 0}
        >
          <Minus className="h-3.5 w-3.5" />
        </MapControlButton>
        <MapControlButton label="Reset zoom and pan" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </MapControlButton>
        <MapControlButton
          label="Zoom in"
          onClick={handleZoomIn}
          disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
        >
          <Plus className="h-3.5 w-3.5" />
        </MapControlButton>
      </div>
    </div>
  );
}

function MapControlButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border shadow-sm backdrop-blur-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          active
            ? "border-amber-300/80 bg-amber-500/90 text-[#0a1628] hover:bg-amber-400"
            : "border-white/25 bg-[#0a1628]/85 text-white/90 hover:bg-[#0a1628] hover:text-white"
        }`}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm bg-[#0a1628] px-2 py-1 text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </span>
    </div>
  );
}

export function ExecutiveDashboardOverview() {
  // const metrics = useExecutiveDashboardMetrics();

  return (
    <div className="satellite-monitoring-dashboard flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden">
      <MapZoomPanViewport />
      {/* <div className="h-full min-h-0 max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 auto-rows-fr">
        {TILES.map((tile) => (
          <ExecutiveTile
            key={tile.panel}
            tile={tile}
            metrics={metrics}
          />
        ))}
      </div> */}
    </div>
  );
}

function ExecutiveTile({
  tile,
  metrics,
}: {
  tile: TileConfig;
  metrics: ReturnType<typeof useExecutiveDashboardMetrics>;
}) {
  return (
    <Link
      to="/"
      search={{ unit: undefined, panel: tile.panel }}
      className={TILE_CLASS}
      title={DASHBOARD_PANEL_PURPOSE[tile.panel]}
    >
      <span className="mono text-xs sm:text-sm md:text-base font-bold uppercase tracking-[0.12em] text-foreground leading-snug group-hover:text-primary transition-colors">
        {DASHBOARD_PANEL_LABELS[tile.panel]}
      </span>

      <TileBody panel={tile.panel} metrics={metrics} />

      <span className={`home-card-accent ${tile.accent}`} aria-hidden="true" />
    </Link>
  );
}

function TileBody({
  panel,
  metrics,
}: {
  panel: DashboardPanel;
  metrics: ReturnType<typeof useExecutiveDashboardMetrics>;
}) {
  if (metrics.isLoading) {
    return (
      <p className="mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (panel === "engagement") {
    return (
      <div className="flex flex-col items-center gap-3">
        <ExecutiveProgressRing value={metrics.avgEngagement} mode="engagement" />
        <p className="mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-center max-w-[14rem] leading-snug">
          Average Resource Engagement Across All Units
        </p>
      </div>
    );
  }

  if (panel === "activity") {
    return (
      <div className="flex flex-col items-center gap-4">
        <HomeNavIconBadge icon={Activity} theme="engagement" size="xl" solid />
        <div className="text-center">
          <div className="mono text-4xl sm:text-5xl lg:text-6xl font-bold tabular-nums text-foreground leading-none">
            {metrics.totalActiveSatellites}
          </div>
          <p className="mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mt-2">
            Active Satellites
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <ExecutiveProgressRing
        value={metrics.avgOptimizationScore}
        mode="optimization"
        suffix=""
      />
      <p className="mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-center max-w-[14rem] leading-snug">
        Overall Optimization Score
      </p>
      <OptimizationScoreLegend />
    </div>
  );
}
