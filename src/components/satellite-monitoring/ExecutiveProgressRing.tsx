import { useEffect, useState } from "react";
import { loadRingPalette, scoreRingPalette, useEngagementRingVisuals } from "@/lib/engagementRingVisuals";

type RingMode = "engagement" | "optimization";

function scoreTextColor(n: number, mode: RingMode) {
  if (mode === "optimization") {
    if (n >= 70) return "text-emerald-600";
    if (n >= 45) return "text-amber-500";
    return "text-destructive";
  }
  if (n >= 80) return "text-destructive";
  if (n >= 50) return "text-amber-500";
  return "text-emerald-600";
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

export function ExecutiveProgressRing({
  value,
  mode = "engagement",
  size = 140,
  stroke = 12,
  suffix = "%",
  animate = false,
  animateDelay = 0,
  animateDuration = 900,
}: {
  value: number;
  mode?: RingMode;
  size?: number;
  stroke?: number;
  suffix?: string;
  /** Animate fill from zero on mount — respects prefers-reduced-motion. */
  animate?: boolean;
  animateDelay?: number;
  animateDuration?: number;
}) {
  const target = Math.min(100, Math.max(0, value));
  const [displayValue, setDisplayValue] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(target);
      return;
    }

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setDisplayValue(target);
      return;
    }

    let frame = 0;
    let start: number | null = null;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;

    const run = (timestamp: number) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const t = Math.min(1, elapsed / animateDuration);
      setDisplayValue(Math.round(target * easeOutCubic(t)));
      if (t < 1) frame = requestAnimationFrame(run);
    };

    setDisplayValue(0);
    delayTimer = setTimeout(() => {
      frame = requestAnimationFrame(run);
    }, animateDelay);

    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      cancelAnimationFrame(frame);
    };
  }, [animate, animateDelay, animateDuration, target]);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const palette =
    mode === "optimization" ? scoreRingPalette(displayValue) : loadRingPalette(displayValue);
  const { trackStroke, arcStroke, defs } = useEngagementRingVisuals(palette);
  const dashOffset = c * (1 - displayValue / 100);

  return (
    <div className="le-progress-ring relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {defs}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackStroke} strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={arcStroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`mono font-bold leading-none ${scoreTextColor(displayValue, mode)}`}
          style={{ fontSize: size * 0.22 }}
        >
          {displayValue}
          {suffix}
        </span>
      </div>
    </div>
  );
}

export function OptimizationScoreLegend() {
  return (
    <div
      className="h-1.5 w-full max-w-[10rem] rounded-full overflow-hidden flex"
      aria-hidden="true"
    >
      <span className="flex-1 bg-emerald-500" />
      <span className="flex-1 bg-amber-400" />
      <span className="flex-1 bg-destructive/80" />
    </div>
  );
}
