import type { UnitOptimizationData } from "@/lib/operationalState";

export const OPT_FACTOR_DEFS = [
  { key: "resource" as const, label: "Resource Utilization", weight: 1 / 3, abbr: "R" },
  { key: "priority" as const, label: "Prioritization", weight: 1 / 3, abbr: "P" },
  { key: "serviceability" as const, label: "Serviceability", weight: 1 / 3, abbr: "S" },
];

export function scoreColor(n: number) {
  if (n >= 80) return "text-emerald-600";
  if (n >= 50) return "text-amber-500";
  return "text-destructive";
}

export function scorebar(n: number) {
  if (n >= 80) return "bg-emerald-500";
  if (n >= 50) return "bg-amber-400";
  return "bg-destructive/80";
}

export function formatBandPol(band: string, pol: string): string {
  const b =
    band === "Extended C-band"
      ? "EXT-C"
      : band === "C-band"
        ? "C"
        : band === "KU band"
          ? "KU"
          : "KA";
  let p = pol;
  if (p.startsWith("KU-")) p = p.slice(3);
  else if (p.startsWith("C-")) p = p.slice(2);
  else if (p.startsWith("CH-")) p = p.slice(3);
  return `${b} · ${p}`;
}

export function riskLevel(data: UnitOptimizationData): "Low" | "Medium" | "High" {
  if (data.status === "NOT_ALLOTTED") return "Low";
  const hasCritical = OPT_FACTOR_DEFS.some((f) => data[f.key].severity === "critical");
  if (hasCritical || data.compositeScore < 45) return "High";
  if (data.compositeScore < 70) return "Medium";
  return "Low";
}

export function outcomeColor(o: "productive" | "mixed" | "non-productive") {
  return o === "productive" ? "bg-emerald-500" : o === "mixed" ? "bg-amber-400" : "bg-destructive/70";
}

export function unitNavKey(unitDbId: string, unitCode: string): string {
  const letter = unitCode.replace(/^GATE[-\s]?/i, "").trim().charAt(0).toUpperCase();
  return letter || unitDbId;
}
