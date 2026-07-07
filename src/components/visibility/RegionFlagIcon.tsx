import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { getRegionFlagUrl } from "@/lib/regionFlags";

type Props = {
  flagCode?: string;
  label: string;
  emoji?: string;
  fallback?: ReactNode;
  className?: string;
  /** Compact row variant in the available-regions list */
  variant?: "tile" | "row";
};

export function RegionFlagIcon({
  flagCode,
  label,
  emoji,
  fallback,
  className,
  variant = "tile",
}: Props) {
  const sizeClass =
    variant === "row"
      ? "w-9 h-6"
      : "w-12 h-8";

  if (flagCode) {
    return (
      <img
        src={getRegionFlagUrl(flagCode)}
        alt={label}
        className={`${sizeClass} object-cover rounded-sm border border-border shrink-0 ${className ?? ""}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (emoji) {
    return (
      <span
        className={`${variant === "row" ? "text-xl" : "text-3xl"} leading-none select-none`}
        role="img"
        aria-label={label}
      >
        {emoji}
      </span>
    );
  }

  return (
    fallback ?? <Globe className={`${variant === "row" ? "h-6 w-6" : "h-7 w-7"} text-muted-foreground`} />
  );
}
