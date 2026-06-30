import { useId } from "react";

export type RingPalette = { base: string; light: string; dark: string };

/** Load rings — high utilization = red (matches engColor thresholds). */
export function loadRingPalette(pct: number): RingPalette {
  if (pct >= 80) return { base: "#ef4444", light: "#f87171", dark: "#dc2626" };
  if (pct >= 50) return { base: "#f59e0b", light: "#fbbf24", dark: "#d97706" };
  return { base: "#10b981", light: "#34d399", dark: "#059669" };
}

/** Score rings — high score = green (matches RadialGauge thresholds). */
export function scoreRingPalette(score: number): RingPalette {
  if (score >= 70) return { base: "#10b981", light: "#34d399", dark: "#059669" };
  if (score >= 45) return { base: "#f59e0b", light: "#fbbf24", dark: "#d97706" };
  return { base: "#ef4444", light: "#f87171", dark: "#dc2626" };
}

const TRACK = {
  light: "oklch(0.93 0.01 250 / 0.95)",
  mid: "oklch(0.78 0.02 250 / 0.85)",
  dark: "oklch(0.72 0.02 250 / 0.75)",
};

export function EngagementRingDefs({
  uid,
  palette,
}: {
  uid: string;
  palette: RingPalette;
}) {
  return (
    <defs>
      <linearGradient id={`${uid}-track`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={TRACK.light} />
        <stop offset="55%" stopColor={TRACK.mid} />
        <stop offset="100%" stopColor={TRACK.dark} />
      </linearGradient>
      <linearGradient id={`${uid}-arc`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={palette.light} />
        <stop offset="45%" stopColor={palette.base} />
        <stop offset="100%" stopColor={palette.dark} />
      </linearGradient>
    </defs>
  );
}

export function useEngagementRingVisuals(palette: RingPalette) {
  const uid = useId().replace(/:/g, "");
  return {
    trackStroke: `url(#${uid}-track)`,
    arcStroke: `url(#${uid}-arc)`,
    palette,
    defs: <EngagementRingDefs uid={uid} palette={palette} />,
  };
}
