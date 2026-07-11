import { unitLabelFromCode } from "@/lib/operationalDataset";
import { getOperationalDataset } from "@/lib/operationalStore";

export type UnitDisplayRecord = {
  code: string;
  name: string;
  description?: string | null;
};

/** Resolve a unit from the operational store by id or INT slug (e.g. alpha → op-unit-alpha). */
export function resolveOperationalUnitRecord(unitId: string): UnitDisplayRecord | null {
  const ds = getOperationalDataset();
  const direct = ds.units.find((u) => u.id === unitId);
  if (direct) return direct;
  const slugged = ds.units.find((u) => u.id === `op-unit-${unitId}`);
  if (slugged) return slugged;
  const viaSlug = ds.units.find((u) => {
    const m = u.id.match(/^op-unit-(.+)$/i);
    return m && m[1].toLowerCase() === unitId.toLowerCase();
  });
  return viaSlug ?? null;
}

/** Canonical display name + location from operational store (SSOT). */
export function unitDisplayFromRecord(unit: UnitDisplayRecord): {
  name: string;
  location: string;
} {
  const name = unit.name?.trim() || unitLabelFromCode(unit.code);
  const location = unit.description?.trim() || "—";
  return { name, location };
}

export function getUnitDisplayName(unitId: string, fallback = "Current Unit"): string {
  const unit = resolveOperationalUnitRecord(unitId);
  return unit ? unitDisplayFromRecord(unit).name : fallback;
}

export function getUnitDisplayLocation(unitId: string, fallback = "—"): string {
  const unit = resolveOperationalUnitRecord(unitId);
  return unit ? unitDisplayFromRecord(unit).location : fallback;
}
