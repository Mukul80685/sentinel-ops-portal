import { Link } from "@tanstack/react-router";
import {
  Activity,
  Check,
  ChevronLeft,
  Eye,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import {
  ExecutiveProgressRing,
  OptimizationScoreLegend,
} from "@/components/satellite-monitoring/ExecutiveProgressRing";
import { useExecutiveDashboardMetrics } from "@/components/satellite-monitoring/useExecutiveDashboardMetrics";
import { useOperationalState } from "@/hooks/useOperationalState";
import { DASHBOARD_PANEL_LABELS, DASHBOARD_PANEL_PURPOSE, type DashboardPanel } from "@/lib/dashboardLabels";
import { listIntelMonitoringSatellites } from "@/lib/intelLiveBridge";
import { buildOperationalFleetState, buildUnitOptimizationData, type UnitOptimizationData } from "@/lib/operationalState";
import { scorebar } from "@/components/satellite-monitoring/dashboardUtils";
import { computeUnitResourceEngagementPct } from "@/lib/resourceEngagementStats";
import {
  getUnitScanHistory,
  previewScanHistoryFromActiveSatellites,
} from "@/lib/scanHistoryStore";

export type { DashboardPanel };

const TILE_CLASS =
  "home-module-tile relative flex flex-col items-center justify-center gap-4 sm:gap-5 lg:gap-6 " +
  "h-full min-h-[16rem] sm:min-h-[18rem] py-6 sm:py-8 px-4 sm:px-6 text-center no-underline group";

const PANEL_TILE_CLASS =
  "home-module-tile relative flex flex-col items-center justify-center gap-3 sm:gap-4 py-5 px-3 text-center min-h-[14rem]";

const UNIT_LOCATION_FIELD_KEYS = ["location", "base", "station", "place", "description"] as const;

type TileConfig = {
  panel: DashboardPanel;
  accent: string;
};

const TILES: TileConfig[] = [
  { panel: "engagement", accent: "bg-gradient-to-r from-transparent via-emerald-500 to-transparent" },
  { panel: "activity", accent: "bg-gradient-to-r from-transparent via-sky-500 to-transparent" },
  { panel: "optimization", accent: "bg-gradient-to-r from-transparent via-amber-500 to-transparent" },
];

const ZOOM_LEVELS = [1, 1.6, 2.5, 4] as const;
const DRAG_THRESHOLD_PX = 5;
const MAP_MARKERS_LEGACY_KEY_V1 = "ssacc_map_markers_v1";
const MAP_MARKERS_LEGACY_KEY_V2 = "ssacc_map_markers_v2";
const MAP_MARKERS_STORAGE_KEY = "ssacc_map_markers_v3";
const MARKER_PERCENT_MIN = 2;
const MARKER_PERCENT_MAX = 98;
const LABEL_BLOCK_OFFSET_Y = 8;

const LABEL_TEXT_SHADOW = "0 0 4px rgba(255,255,255,0.9), 0 0 8px rgba(255,255,255,0.7)";

type MapMarkerPosition = {
  xPercent: number;
  yPercent: number;
};

type MapMarker = {
  id: string;
  pin: MapMarkerPosition;
  label: MapMarkerPosition & { line1: string; line2: string };
  unitId: string | null;
  locked: boolean;
};

type MarkerSnapshot = {
  pin: MapMarkerPosition;
  label: MapMarkerPosition & { line1: string; line2: string };
  unitId: string | null;
};

type MapUnitSummary = {
  engagementPct: number;
  monitoredSatelliteCount: number;
  optimizationScore: number;
  optimization: UnitOptimizationData;
};

type OperationalUnit = {
  id: string;
  code: string;
  name?: string;
  description?: string | null;
  location?: string | null;
  base?: string | null;
  station?: string | null;
  place?: string | null;
};

function resolveUnitLocationLine(unit: OperationalUnit): string {
  for (const key of UNIT_LOCATION_FIELD_KEYS) {
    const value = unit[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveUnitLabelFields(unit: OperationalUnit): { line1: string; line2: string } {
  return {
    line1: unit.name?.trim() || unit.code,
    line2: resolveUnitLocationLine(unit),
  };
}

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

function isValidUnitId(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidMapMarker(value: unknown): value is MapMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Record<string, unknown>;
  return (
    typeof marker.id === "string" &&
    isValidMapMarkerPosition(marker.pin) &&
    isValidLabelBlock(marker.label) &&
    isValidUnitId(marker.unitId) &&
    (marker.locked === undefined || typeof marker.locked === "boolean")
  );
}

function normalizeMapMarker(value: MapMarker): MapMarker {
  return {
    ...value,
    unitId: value.unitId ?? null,
    locked: value.locked === true,
  };
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

function buildMapUnitSummary(
  unitId: string,
  input: {
    units: OperationalUnit[];
    equipment: any[];
    engagements: any[];
    intelRows: any[];
  },
): MapUnitSummary | null {
  const unit = input.units.find((entry) => entry.id === unitId);
  if (!unit) return null;

  const fleetState = buildOperationalFleetState({
    dbUnits: [
      {
        id: unit.id,
        code: unit.code,
        name: unit.name ?? unit.code,
        description: null,
      },
    ],
    equipment: input.equipment,
    engagements: input.engagements,
    intelRows: input.intelRows,
  });

  const state = fleetState.byUnitId.get(unitId);
  if (!state) return null;

  const cap = state.capability;

  const intMonitoring = listIntelMonitoringSatellites(
    unitId,
    unit.code,
    input.engagements,
    input.equipment,
    input.intelRows,
  );
  const monitoredSatelliteCount = intMonitoring.length;
  const isMonitoring = monitoredSatelliteCount > 0;
  const monitoredSatelliteNames = intMonitoring.map((row) => row.satelliteName);
  const historyNames = isMonitoring
    ? previewScanHistoryFromActiveSatellites(unitId, monitoredSatelliteNames).map((row) => row.satellite)
    : getUnitScanHistory(unitId).map((row) => row.satellite);
  const recentScanSatelliteNames = [...new Set([...monitoredSatelliteNames, ...historyNames])];
  const resourceEngagementPct = isMonitoring
    ? computeUnitResourceEngagementPct(
        unitId,
        input.equipment,
        input.engagements,
        intMonitoring,
      )
    : cap.totalChains > 0
      ? Math.min(100, Math.round((cap.activeChains / cap.totalChains) * 100))
      : 0;

  const unitEq = input.equipment.filter((entry) => entry.unit_id === unitId);
  const optimization = buildUnitOptimizationData(state, unitEq, {
    isMonitoring,
    monitoredSatelliteNames,
    recentScanSatelliteNames,
    resourceEngagementPct,
  });

  return {
    engagementPct: resourceEngagementPct,
    monitoredSatelliteCount,
    optimizationScore: optimization.compositeScore,
    optimization,
  };
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

type LabelBox = { x: number; y: number; w: number; h: number };

const VIEW_LABEL_HEIGHT = 24;
const VIEW_PIN_COLLISION_RADIUS = 12;
const VIEW_LABEL_GAP = 8;
const VIEWPORT_LABEL_MARGIN = 6;

function estimateViewLabelWidth(text: string) {
  return Math.min(220, Math.max(72, text.length * 7.5 + 20));
}

function pinCollisionRect(screenX: number, screenY: number, radius = VIEW_PIN_COLLISION_RADIUS): LabelBox {
  return { x: screenX - radius, y: screenY - radius, w: radius * 2, h: radius * 2 };
}

function labelBoxesOverlap(a: LabelBox, b: LabelBox, gap = 4) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function viewLabelViewportOverflow(box: LabelBox, viewportW: number, viewportH: number, margin = VIEWPORT_LABEL_MARGIN) {
  let overflow = 0;
  if (box.x < margin) overflow += margin - box.x;
  if (box.y < margin) overflow += margin - box.y;
  if (box.x + box.w > viewportW - margin) overflow += box.x + box.w - (viewportW - margin);
  if (box.y + box.h > viewportH - margin) overflow += box.y + box.h - (viewportH - margin);
  return overflow;
}

function computeViewLabelPlacement(
  pinScreen: ScreenCoords,
  labelText: string,
  viewportW: number,
  viewportH: number,
  otherPinScreens: ScreenCoords[],
) {
  const estW = estimateViewLabelWidth(labelText);
  const estH = VIEW_LABEL_HEIGHT;
  const { screenX: px, screenY: py } = pinScreen;
  const pinRects = [pinScreen, ...otherPinScreens].map((pin) =>
    pinCollisionRect(pin.screenX, pin.screenY, VIEW_PIN_COLLISION_RADIUS),
  );

  const makeBox = (x: number, y: number): LabelBox => ({ x, y, w: estW, h: estH });

  const candidates: Array<{ box: LabelBox; bias: number }> = [
    { box: makeBox(px + VIEW_PIN_COLLISION_RADIUS + VIEW_LABEL_GAP, py - estH / 2), bias: px < viewportW * 0.55 ? 0 : 20 },
    {
      box: makeBox(px - VIEW_PIN_COLLISION_RADIUS - VIEW_LABEL_GAP - estW, py - estH / 2),
      bias: px >= viewportW * 0.55 ? 0 : 20,
    },
    { box: makeBox(px - estW / 2, py - VIEW_PIN_COLLISION_RADIUS - VIEW_LABEL_GAP - estH), bias: 10 },
    { box: makeBox(px - estW / 2, py + VIEW_PIN_COLLISION_RADIUS + VIEW_LABEL_GAP), bias: 10 },
    {
      box: makeBox(px + VIEW_PIN_COLLISION_RADIUS + VIEW_LABEL_GAP, py - VIEW_PIN_COLLISION_RADIUS - VIEW_LABEL_GAP - estH),
      bias: 15,
    },
    {
      box: makeBox(
        px - VIEW_PIN_COLLISION_RADIUS - VIEW_LABEL_GAP - estW,
        py - VIEW_PIN_COLLISION_RADIUS - VIEW_LABEL_GAP - estH,
      ),
      bias: 15,
    },
    { box: makeBox(px + VIEW_PIN_COLLISION_RADIUS + VIEW_LABEL_GAP, py + VIEW_PIN_COLLISION_RADIUS + VIEW_LABEL_GAP), bias: 15 },
    {
      box: makeBox(
        px - VIEW_PIN_COLLISION_RADIUS - VIEW_LABEL_GAP - estW,
        py + VIEW_PIN_COLLISION_RADIUS + VIEW_LABEL_GAP,
      ),
      bias: 15,
    },
  ];

  let best = candidates[0]!;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    let score = candidate.bias;
    score += viewLabelViewportOverflow(candidate.box, viewportW, viewportH) * 50;

    for (const pinRect of pinRects) {
      if (labelBoxesOverlap(candidate.box, pinRect, 2)) {
        score += 1000;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return { left: best.box.x, top: best.box.y };
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

function MapPinDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-black shadow-[0_1px_2px_rgba(0,0,0,0.4)] ${className}`}
    />
  );
}

function MapUnitSummaryCard({
  panel,
  accent,
  className = "",
  children,
}: {
  panel: DashboardPanel;
  accent: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${PANEL_TILE_CLASS} ${className}`}>
      <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground leading-snug">
        {DASHBOARD_PANEL_LABELS[panel]}
      </span>
      {children}
      <span className={`home-card-accent ${accent}`} aria-hidden="true" />
    </div>
  );
}

const MAP_OPTIMIZATION_FACTORS = [
  { key: "resource" as const, label: "Resource Utilization Score" },
  { key: "priority" as const, label: "Satellite Prioritization Score" },
  { key: "serviceability" as const, label: "Serviceability Score" },
] as const;

const EMBOOSSED_RING_OUTER =
  "rounded-full bg-gradient-to-br from-white via-[#f6f8f4] to-[#dce6d4] p-[0.55rem] shadow-[inset_0_3px_8px_rgba(255,255,255,0.95),inset_0_-4px_10px_rgba(55,75,48,0.14),0_5px_0_rgba(55,75,48,0.07),0_16px_32px_rgba(45,65,40,0.14)]";
const EMBOOSSED_RING_INNER =
  "rounded-full bg-gradient-to-br from-[#fcfdfb] to-[#e9efe6] p-1 shadow-[inset_0_2px_6px_rgba(255,255,255,0.85),inset_0_-2px_5px_rgba(0,0,0,0.07)]";

function optimizationScoreHalo(score: number, muted: boolean): string {
  if (muted) return "0 0 0 rgba(100,116,139,0.08)";
  if (score >= 70) return "0 0 28px rgba(16,185,129,0.18), 0 0 56px rgba(16,185,129,0.08)";
  if (score >= 45) return "0 0 28px rgba(245,158,11,0.16), 0 0 56px rgba(245,158,11,0.07)";
  return "0 0 28px rgba(239,68,68,0.14), 0 0 56px rgba(239,68,68,0.06)";
}

function optimizationStatusMeta(data: UnitOptimizationData): { label: string; className: string } {
  if (!data.monitoringActive) {
    return {
      label: "Not Monitoring",
      className: "border-[#c5cec0] bg-[#eef1eb] text-[#5a6654]",
    };
  }
  if (data.status === "OPTIMIZED") {
    return {
      label: "Optimized",
      className: "border-[#9ec4a8] bg-[#e8f3ea] text-[#2d5a3a]",
    };
  }
  if (data.status === "SUBOPTIMAL") {
    return {
      label: "Sub-optimal",
      className: "border-[#d4c48a] bg-[#f5f0e3] text-[#6b5a28]",
    };
  }
  return {
    label: "Misallocated",
    className: "border-[#d4a8a8] bg-[#f5ecec] text-[#7a3a3a]",
  };
}

function EmbossedOptimizationRing({
  value,
  label,
  size,
  stroke,
  muted = false,
  animate = false,
  animateDelay = 0,
}: {
  value: number;
  label: string;
  size: number;
  stroke: number;
  muted?: boolean;
  animate?: boolean;
  animateDelay?: number;
}) {
  const displayValue = muted ? 0 : value;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={EMBOOSSED_RING_OUTER}
        style={{ boxShadow: `${optimizationScoreHalo(displayValue, muted)}, inset 0 3px 8px rgba(255,255,255,0.95), inset 0 -4px 10px rgba(55,75,48,0.14), 0 5px 0 rgba(55,75,48,0.07), 0 16px 32px rgba(45,65,40,0.14)` }}
      >
        <div className={EMBOOSSED_RING_INNER}>
          <ExecutiveProgressRing
            value={displayValue}
            mode="optimization"
            size={size}
            stroke={stroke}
            suffix=""
            animate={animate}
            animateDelay={animateDelay}
          />
        </div>
      </div>
      <p className="mono max-w-[13rem] text-center text-[10px] font-semibold uppercase leading-snug tracking-[0.11em] text-[#3d5244] sm:text-[11px]">
        {label}
      </p>
    </div>
  );
}

function OptimizationFactorCard({
  value,
  label,
  muted,
  animateDelay,
}: {
  value: number;
  label: string;
  muted: boolean;
  animateDelay: number;
}) {
  return (
    <div
      className="home-module-tile flex flex-col items-center justify-center px-2 py-2 animate-in fade-in duration-700 fill-mode-both"
      style={{ animationDelay: `${animateDelay}ms` }}
    >
      <EmbossedOptimizationRing
        value={value}
        label={label}
        size={106}
        stroke={9}
        muted={muted}
        animate
        animateDelay={animateDelay + 80}
      />
    </div>
  );
}

function OptimizationHubLines() {
  return (
    <svg
      className="pointer-events-none mx-auto h-7 w-full max-w-[720px] text-[#b8c9b0]"
      viewBox="0 0 720 36"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        d="M360 0 V14 M360 14 L120 36 M360 14 L360 36 M360 14 L600 36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.45"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OptimizationContributionBar({
  scores,
  muted,
}: {
  scores: [number, number, number];
  muted: boolean;
}) {
  return (
    <div
      className="flex h-1 w-56 max-w-full gap-1 rounded-full bg-[#dde5d8]/80 p-px animate-in fade-in duration-700 delay-300 fill-mode-both"
      aria-hidden="true"
    >
      {scores.map((score, index) => {
        const display = muted && index < 2 ? 0 : score;
        return (
          <div key={index} className="h-full flex-1 overflow-hidden rounded-full bg-[#e8efe6]">
            <div
              className={`h-full rounded-full transition-all duration-700 ${muted && index < 2 ? "bg-[#c5cec0]/60" : scorebar(display)}`}
              style={{ width: `${display}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function MapUnitOptimizationFullscreen({
  unitTitle,
  unitLocation,
  data,
  onBack,
}: {
  unitTitle: string;
  unitLocation: string;
  data: UnitOptimizationData;
  onBack: () => void;
}) {
  const mutedFactors = !data.monitoringActive;
  const overallScore = data.monitoringActive ? data.compositeScore : 0;
  const statusMeta = optimizationStatusMeta(data);
  const factors = MAP_OPTIMIZATION_FACTORS.map((def) => ({
    ...def,
    score: mutedFactors && def.key !== "serviceability" ? 0 : data[def.key].score,
    muted: mutedFactors && def.key !== "serviceability",
  }));
  const contributionScores: [number, number, number] = [
    factors[0].score,
    factors[1].score,
    factors[2].score,
  ];

  return (
    <div
      data-optimization-overlay
      className="absolute inset-0 z-[60] flex min-h-0 flex-col bg-gradient-to-br from-[#f8faf6] via-[#f0f4ed] to-[#e4ebe0] animate-in fade-in duration-300"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.4]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(110,130,100,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(110,130,100,0.07) 1px, transparent 1px)
          `,
          backgroundSize: "52px 52px",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-24 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(120,155,105,0.14)_0%,transparent_68%)]"
        aria-hidden="true"
      />

      <div className="relative z-[1] flex shrink-0 items-center gap-3 border-b border-[#c8d4c0]/80 bg-white/75 px-4 py-2.5 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#b8c9b0] bg-[#f4f7f2] px-3 py-1.5 text-xs font-semibold text-[#2f4535] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(45,65,40,0.08)] transition-colors hover:bg-[#eef3ea]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to map
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-[#1B2A3A]">{unitTitle}</h2>
          {unitLocation ? (
            <p className="truncate text-xs text-[#1B2A3A]/60">{unitLocation}</p>
          ) : null}
        </div>
        <span className="mono shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#4a6350]">
          {DASHBOARD_PANEL_LABELS.optimization}
        </span>
      </div>

      <div className="relative z-[1] min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[920px] flex-col items-center justify-center gap-2 px-4 py-2 sm:gap-3 sm:px-6">
          <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-500 fill-mode-both">
            <EmbossedOptimizationRing
              value={overallScore}
              label="Overall Optimization Score"
              size={172}
              stroke={12}
              animate
              animateDelay={120}
            />
            <span
              className={`mono rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
            <OptimizationContributionBar scores={contributionScores} muted={mutedFactors} />
          </div>

          <OptimizationHubLines />

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {factors.map((factor, index) => (
              <OptimizationFactorCard
                key={factor.key}
                value={factor.score}
                label={factor.label}
                muted={factor.muted}
                animateDelay={380 + index * 140}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MapUnitPanel({
  marker,
  summary,
  isLoading,
  onClose,
  onOpenOptimization,
}: {
  marker: MapMarker;
  summary: MapUnitSummary | null;
  isLoading: boolean;
  onClose: () => void;
  onOpenOptimization: () => void;
}) {
  const unitTitle = marker.label.line1.trim() || "Unnamed unit";
  const showLinkedContent = !isLoading && marker.unitId != null && summary != null;
  const unitSlug = marker.unitId?.replace("op-unit-", "") ?? "";

  return (
    <div
      data-unit-panel
      className="pointer-events-auto absolute right-[30px] top-1/2 z-20 w-[680px] max-h-[calc(100%-5rem)] -translate-y-1/2 overflow-hidden rounded-lg border border-white/15 bg-[#0a1628]/92 shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-right-4 duration-200"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="relative border-b border-white/10 px-4 py-3 pr-10">
        <h2 className="mono text-sm font-bold uppercase leading-snug tracking-wide text-white">{unitTitle}</h2>
        {marker.label.line2.trim() ? (
          <p className="mono mt-0.5 text-xs leading-snug tracking-wide text-white/55">{marker.label.line2.trim()}</p>
        ) : null}
        <button
          type="button"
          aria-label="Close panel"
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 py-3">
        {isLoading ? (
          <p className="mono py-6 text-center text-[11px] font-semibold uppercase tracking-wider text-white/55">
            Loading…
          </p>
        ) : !showLinkedContent ? (
          <p className="py-6 text-center text-sm leading-snug text-white/60">
            No unit linked — select a unit in edit mode
          </p>
        ) : (
          <div className="flex flex-row gap-3">
            <Link
              to="/engagement/$unitId"
              params={{ unitId: marker.unitId! }}
              className="flex-1 min-w-0 cursor-pointer rounded-md no-underline transition-[filter,box-shadow] hover:brightness-110 hover:ring-1 hover:ring-white/20"
            >
              <MapUnitSummaryCard panel="engagement" accent={TILES[0].accent} className="h-full w-full">
                <div className="flex flex-col items-center gap-3">
                  <ExecutiveProgressRing value={summary.engagementPct} mode="engagement" />
                  <p className="mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-center max-w-[12rem] leading-snug">
                    Resource Engagement Across Serviceable Capacity
                  </p>
                </div>
              </MapUnitSummaryCard>
            </Link>

            <Link
              to="/intel/$unitId"
              params={{ unitId: unitSlug }}
              search={{ from: "map" }}
              className="flex-1 min-w-0 cursor-pointer rounded-md no-underline transition-[filter,box-shadow] hover:brightness-110 hover:ring-1 hover:ring-white/20"
            >
              <MapUnitSummaryCard panel="activity" accent={TILES[1].accent} className="h-full w-full">
                <div className="flex flex-col items-center gap-4">
                  <HomeNavIconBadge icon={Activity} theme="engagement" size="xl" solid />
                  <div className="text-center">
                    <div className="mono text-4xl sm:text-5xl font-bold tabular-nums text-foreground leading-none">
                      {summary.monitoredSatelliteCount}
                    </div>
                    <p className="mono mt-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Active Satellites
                    </p>
                  </div>
                </div>
              </MapUnitSummaryCard>
            </Link>

            <button
              type="button"
              onClick={onOpenOptimization}
              className="flex-1 min-w-0 cursor-pointer rounded-md border-0 bg-transparent p-0 text-left transition-[filter,box-shadow] hover:brightness-110 hover:ring-1 hover:ring-white/20"
            >
              <MapUnitSummaryCard panel="optimization" accent={TILES[2].accent} className="h-full w-full">
                <div className="flex flex-col items-center gap-3">
                  <ExecutiveProgressRing
                    value={summary.optimizationScore}
                    mode="optimization"
                    suffix=""
                  />
                  <p className="mono text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-center max-w-[12rem] leading-snug">
                    Overall Optimization Score
                  </p>
                  <OptimizationScoreLegend />
                </div>
              </MapUnitSummaryCard>
            </button>
          </div>
        )}
      </div>
    </div>
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
        className="absolute left-0 top-0 -translate-x-1/2 -translate-y-[calc(100%+10px)] pointer-events-auto flex items-center gap-0.5"
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
  otherPinScreens,
  viewportWidth,
  viewportHeight,
  isEditMode,
  isRevealed,
  isPanelOpen,
  units,
  onPinSelect,
  onNameClick,
  onUpdateUnitId,
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
  otherPinScreens: ScreenCoords[];
  viewportWidth: number;
  viewportHeight: number;
  isEditMode: boolean;
  isRevealed: boolean;
  isPanelOpen: boolean;
  units: OperationalUnit[];
  onPinSelect: (id: string) => void;
  onNameClick: (id: string) => void;
  onUpdateUnitId: (id: string, unitId: string | null) => void;
  onUpdatePinPosition: (id: string, position: MapMarkerPosition) => void;
  onUpdateLabelPosition: (id: string, position: MapMarkerPosition) => void;
  onDelete: (id: string) => void;
  onConfirm: (id: string) => void;
  onDiscard: (id: string) => void;
  onUnlock: (id: string) => void;
  onDragActiveChange: (active: boolean) => void;
  clientToMarkerPercents: (clientX: number, clientY: number) => MapMarkerPosition;
}) {
  const pinDragRef = useRef(false);
  const labelDragRef = useRef(false);

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

  const unitName = marker.label.line1.trim() || "Unnamed unit";
  const labelPlacement =
    !isEditMode && isRevealed
      ? computeViewLabelPlacement(pinScreen, unitName, viewportWidth, viewportHeight, otherPinScreens)
      : null;

  if (!isEditMode) {
    return (
      <>
        <div
          data-map-marker
          data-map-marker-pin
          className="absolute z-[6] pointer-events-auto touch-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: pinScreen.screenX, top: pinScreen.screenY }}
          onDoubleClick={stopMarkerPointerEvent}
        >
          <button
            type="button"
            aria-label={unitName}
            aria-expanded={isRevealed}
            className="cursor-pointer rounded-full outline-none"
            onClick={(event) => {
              event.stopPropagation();
              onPinSelect(marker.id);
            }}
          >
            <MapPinDot />
          </button>
        </div>
        {labelPlacement ? (
          <div
            data-map-marker
            className="absolute z-[7] pointer-events-auto touch-none"
            style={{ left: labelPlacement.left, top: labelPlacement.top }}
            onDoubleClick={stopMarkerPointerEvent}
          >
            <button
              type="button"
              data-map-marker-panel-trigger
              aria-label={`Open ${unitName} panel`}
              className={`mono min-w-0 max-w-[220px] truncate text-left text-[13px] font-bold uppercase leading-tight tracking-wide whitespace-nowrap text-black cursor-pointer rounded-sm px-1.5 py-0.5 hover:underline ${
                isPanelOpen ? "underline bg-white/75" : "bg-white/60 hover:bg-white/75"
              }`}
              style={{ textShadow: LABEL_TEXT_SHADOW }}
              onClick={(event) => {
                event.stopPropagation();
                onNameClick(marker.id);
              }}
            >
              {unitName}
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div
        data-map-marker
        data-map-marker-pin
        className="absolute z-[6] pointer-events-auto -translate-x-1/2 -translate-y-1/2 touch-none cursor-move"
        style={{ left: pinScreen.screenX, top: pinScreen.screenY }}
        onDoubleClick={stopMarkerPointerEvent}
        onPointerDown={pinDragHandlers.onPointerDown}
        onPointerMove={pinDragHandlers.onPointerMove}
        onPointerUp={pinDragHandlers.onPointerUp}
        onPointerCancel={pinDragHandlers.onPointerCancel}
      >
        <MapPinDot />
      </div>

      <div
        data-map-marker
        className="absolute z-[6] pointer-events-auto min-w-[160px] min-h-[52px]"
        style={{ left: labelScreen.screenX, top: labelScreen.screenY }}
        onDoubleClick={stopMarkerPointerEvent}
      >
        <div
          className="flex min-w-[160px] items-stretch border border-black/50 bg-transparent"
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
          <select
            aria-label="Link operational unit"
            value={marker.unitId ?? ""}
            disabled={marker.locked}
            onChange={(event) =>
              onUpdateUnitId(marker.id, event.target.value ? event.target.value : null)
            }
            className="mono min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-[11px] font-bold tracking-wide text-black outline-none disabled:opacity-80"
          >
            <option value="">— Select unit —</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name ?? unit.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MapMarkerEditToolbar
        pinScreen={pinScreen}
        marker={marker}
        onConfirm={onConfirm}
        onDiscard={onDiscard}
        onUnlock={onUnlock}
        onDelete={onDelete}
      />
    </>
  );
}

function MapZoomPanViewport() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<MapInteractionState | null>(null);
  const markerDragActiveRef = useRef(false);
  const editSnapshotRef = useRef<Record<string, MarkerSnapshot> | null>(null);
  const newMarkerIdsRef = useRef<Set<string>>(new Set());

  const { units, equipment, engagements, intelRows, isLoading: isOperationalLoading, derivedRevision } =
    useOperationalState();

  const [viewportNode, setViewportNode] = useState<HTMLDivElement | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [pan, setPan] = useState({ panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [isEditMode, setIsEditMode] = useState(false);
  const [markers, setMarkers] = useState<MapMarker[]>(() => loadMapMarkers());
  const [newMarkerFocusId, setNewMarkerFocusId] = useState<string | null>(null);
  const [revealedMarkerId, setRevealedMarkerId] = useState<string | null>(null);
  const [openMarkerId, setOpenMarkerId] = useState<string | null>(null);
  const [optimizationOpen, setOptimizationOpen] = useState(false);

  const scale = ZOOM_LEVELS[zoomIndex];

  const assignViewportRef = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    setViewportNode(node);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(MAP_MARKERS_LEGACY_KEY_V1);
      localStorage.removeItem(MAP_MARKERS_LEGACY_KEY_V2);
    }
  }, []);

  useEffect(() => {
    saveMapMarkers(markers);
  }, [markers]);

  useEffect(() => {
    if ((!revealedMarkerId && !openMarkerId) || !viewportNode) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-unit-panel]")) return;
      if (target.closest("[data-optimization-overlay]")) return;
      if (target.closest("[data-map-marker]")) return;
      setRevealedMarkerId(null);
      setOpenMarkerId(null);
      setOptimizationOpen(false);
    };

    viewportNode.addEventListener("pointerdown", handlePointerDown);
    return () => viewportNode.removeEventListener("pointerdown", handlePointerDown);
  }, [revealedMarkerId, openMarkerId, viewportNode]);

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

  const clearMarkerSelection = useCallback(() => {
    setRevealedMarkerId(null);
    setOpenMarkerId(null);
    setOptimizationOpen(false);
  }, []);

  const closeUnitPanel = useCallback(() => {
    setOpenMarkerId(null);
    setOptimizationOpen(false);
  }, []);

  const openOptimizationFullscreen = useCallback(() => {
    setOptimizationOpen(true);
  }, []);

  const backFromOptimization = useCallback(() => {
    setOptimizationOpen(false);
    setOpenMarkerId(null);
  }, []);

  const handlePinSelect = useCallback((id: string) => {
    setRevealedMarkerId(id);
    setOpenMarkerId(null);
    setOptimizationOpen(false);
  }, []);

  const handleNameClick = useCallback((id: string) => {
    setRevealedMarkerId(id);
    setOptimizationOpen(false);
    setOpenMarkerId((prev) => (prev === id ? null : id));
  }, []);

  const updateUnitId = useCallback(
    (id: string, unitId: string | null) => {
      setMarkers((prev) =>
        prev.map((marker) => {
          if (marker.id !== id) return marker;

          if (!unitId) {
            return {
              ...marker,
              unitId: null,
              label: { ...marker.label, line1: "", line2: "" },
            };
          }

          const unit = units.find((entry) => entry.id === unitId);
          if (!unit) {
            return { ...marker, unitId };
          }

          const { line1, line2 } = resolveUnitLabelFields(unit);
          return {
            ...marker,
            unitId,
            label: { ...marker.label, line1, line2 },
          };
        }),
      );
    },
    [units],
  );

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
    setRevealedMarkerId((prev) => (prev === id ? null : prev));
    setOpenMarkerId((prev) => (prev === id ? null : prev));
    setOptimizationOpen(false);
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
                unitId: snapshot.unitId,
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
      const { w, h } = readViewportSize();
      const { xPercent, yPercent } = viewportToMarkerPercents(
        viewportX,
        viewportY,
        pan.panX,
        pan.panY,
        scale,
        w,
        h,
      );
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
          unitId: null,
          locked: false,
        },
      ]);
      setNewMarkerFocusId(id);
    },
    [pan.panX, pan.panY, readViewportSize, scale],
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
      clearMarkerSelection();
      const { x, y } = getFocalPoint(event.clientX, event.clientY);
      const nextIndex = zoomIndex >= ZOOM_LEVELS.length - 1 ? 0 : zoomIndex + 1;
      applyZoomIndex(nextIndex, x, y);
    },
    [applyZoomIndex, clearMarkerSelection, getFocalPoint, isEditMode, zoomIndex],
  );

  const handleZoomIn = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      clearMarkerSelection();
      if (zoomIndex >= ZOOM_LEVELS.length - 1) return;
      const { w, h } = readViewportSize();
      applyZoomIndex(zoomIndex + 1, w / 2, h / 2);
    },
    [applyZoomIndex, clearMarkerSelection, readViewportSize, zoomIndex],
  );

  const handleZoomOut = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      clearMarkerSelection();
      if (zoomIndex <= 0) return;
      const { w, h } = readViewportSize();
      applyZoomIndex(zoomIndex - 1, w / 2, h / 2);
    },
    [applyZoomIndex, clearMarkerSelection, readViewportSize, zoomIndex],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      clearMarkerSelection();

      if (event.deltaY === 0) return;

      const { x, y } = getFocalPoint(event.clientX, event.clientY);

      if (event.deltaY < 0) {
        if (zoomIndex >= ZOOM_LEVELS.length - 1) return;
        applyZoomIndex(zoomIndex + 1, x, y);
        return;
      }

      if (zoomIndex <= 0) return;
      applyZoomIndex(zoomIndex - 1, x, y);
    },
    [applyZoomIndex, clearMarkerSelection, getFocalPoint, zoomIndex],
  );

  useEffect(() => {
    if (!viewportNode) return;

    viewportNode.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewportNode.removeEventListener("wheel", handleWheel);
  }, [handleWheel, viewportNode]);

  const handleReset = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      clearMarkerSelection();
      setZoomIndex(0);
      setPan({ panX: 0, panY: 0 });
    },
    [clearMarkerSelection],
  );

  const handleToggleEditMode = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      clearMarkerSelection();

      setIsEditMode((prev) => {
        const entering = !prev;

        if (entering) {
          setRevealedMarkerId(null);
          setOpenMarkerId(null);
          setOptimizationOpen(false);
          setMarkers((currentMarkers) => {
            editSnapshotRef.current = Object.fromEntries(
              currentMarkers.map((marker) => [
                marker.id,
                {
                  pin: { ...marker.pin },
                  label: { ...marker.label },
                  unitId: marker.unitId,
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
    },
    [clearMarkerSelection],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      const target = event.target as HTMLElement;
      if (target.closest("[data-map-marker]")) return;
      if (target.closest("[data-unit-panel]")) return;
      if (target.closest("[data-optimization-overlay]")) return;

      clearMarkerSelection();

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
    [beginPan, clearMarkerSelection, getFocalPoint, isEditMode, pan.panX, pan.panY, scale],
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

  const openMarker = openMarkerId ? markers.find((marker) => marker.id === openMarkerId) : null;

  const panelSummary = useMemo(() => {
    if (!openMarker?.unitId) return null;
    return buildMapUnitSummary(openMarker.unitId, {
      units,
      equipment,
      engagements,
      intelRows,
    });
  }, [openMarker, units, equipment, engagements, intelRows, derivedRevision]);

  const operationalUnits = useMemo(
    () =>
      [...units]
        .map((unit) => ({
          id: unit.id,
          code: unit.code,
          name: unit.name,
          description: unit.description,
        }))
        .sort((a, b) => (a.name ?? a.code).localeCompare(b.name ?? b.code)),
    [units],
  );

  return (
    <div
      ref={assignViewportRef}
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

      <img
        src="/logo-left.png"
        alt=""
        draggable={false}
        className="pointer-events-none absolute top-3 left-3 z-10 h-32 w-32 object-contain"
      />
      <img
        src="/logo-right.png"
        alt=""
        draggable={false}
        className="pointer-events-none absolute top-3 right-3 z-10 h-32 w-32 object-contain"
      />

      <div className="pointer-events-none absolute inset-0 z-[5]">
        {markers.map((marker, markerIndex) => {
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
          const otherPinScreens = markers
            .filter((_, index) => index !== markerIndex)
            .map((otherMarker) =>
              markerToScreenCoords(
                otherMarker.pin.xPercent,
                otherMarker.pin.yPercent,
                pan.panX,
                pan.panY,
                scale,
                viewportSize.w,
                viewportSize.h,
              ),
            );

          return (
            <MapMarker
              key={marker.id}
              marker={marker}
              pinScreen={pinScreen}
              labelScreen={labelScreen}
              otherPinScreens={otherPinScreens}
              viewportWidth={viewportSize.w}
              viewportHeight={viewportSize.h}
              isEditMode={isEditMode}
              isRevealed={revealedMarkerId === marker.id}
              isPanelOpen={openMarkerId === marker.id}
              units={operationalUnits}
              onPinSelect={handlePinSelect}
              onNameClick={handleNameClick}
              onUpdateUnitId={updateUnitId}
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

      {viewportNode && openMarker && !optimizationOpen
        ? createPortal(
            <MapUnitPanel
              marker={openMarker}
              summary={panelSummary}
              isLoading={isOperationalLoading}
              onClose={closeUnitPanel}
              onOpenOptimization={openOptimizationFullscreen}
            />,
            viewportNode,
          )
        : null}

      {viewportNode && optimizationOpen && openMarker && panelSummary
        ? createPortal(
            <MapUnitOptimizationFullscreen
              unitTitle={openMarker.label.line1.trim() || "Unnamed unit"}
              unitLocation={openMarker.label.line2.trim()}
              data={panelSummary.optimization}
              onBack={backFromOptimization}
            />,
            viewportNode,
          )
        : null}

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
