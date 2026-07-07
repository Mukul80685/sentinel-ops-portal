import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { listCategories, getUnitById, listEquipmentForUnit } from "@/lib/queries";
import {
  Activity,
  Boxes,
  Package,
  Radio,
  Satellite,
  Server,
  Zap,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";

export const Route = createFileRoute("/_authenticated/inventory/$unitId/")({
  component: InventoryCategories,
});

// ── Per-category icon map ─────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, ComponentType<LucideProps>> = {
  "Antenna":            Satellite,   // parabolic / dish
  "LNA":                Zap,         // amplifier / signal boost
  "LNB":                Radio,       // RF block downconverter
  "Demodulators":       Activity,    // waveform / signal processing
  "Processing Servers": Server,      // server rack / compute
  "Other Resources":    Package,     // generic equipment
};

function InventoryCategories() {
  const { unitId } = Route.useParams();
  const { data: unit } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: () => getUnitById(unitId),
  });
  const { data: cats = [] } = useQuery({ queryKey: ["cats"], queryFn: listCategories });
  const { data: counts = {} } = useQuery({
    queryKey: ["eq-counts", unitId],
    queryFn: async () => {
      const data = await listEquipmentForUnit(unitId);
      const map: Record<string, number> = {};
      data.forEach((r) => (map[r.category_id] = (map[r.category_id] ?? 0) + 1));
      return map;
    },
  });

  // Derive clean unit label from code (falls back to full unit name for dynamic units)
  const unitLetter = unit?.code?.split("-").pop() ?? "";
  const unitLabel = unit
    ? (unitLetter.length === 1 ? `Unit ${unitLetter}` : unit.name)
    : "";

  return (
    <AppShell
      title="Resource Inventory"
      pageTitle={unitLabel ? `${unitLabel} — Equipment Categories` : undefined}
      headerIcon={<HomeNavIconBadge icon={Boxes} theme="inventory" size="md" />}
      showBack
      horizontalNav={null}
    >
      {/* Square icon tiles — 3 columns × 2 rows for 6 categories */}
      <div className="grid grid-cols-3 gap-4">
        {cats.map((c) => {
          const CatIcon = CATEGORY_ICONS[c.name] ?? Boxes;
          const count = counts[c.id] ?? 0;
          return (
            <Link
              key={c.id}
              to="/inventory/$unitId/$categoryId"
              params={{ unitId, categoryId: c.id }}
              className="tile flex flex-col items-center justify-center gap-3 aspect-square hover:bg-secondary/60 hover:text-secondary-foreground transition-colors"
            >
              {/* Large icon box */}
              <div className="h-14 w-14 grid place-items-center rounded-sm border border-border bg-secondary text-secondary-foreground">
                <CatIcon className="h-7 w-7" />
              </div>

              {/* Label + count */}
              <div className="text-center space-y-0.5">
                <div className="mono text-xs font-bold uppercase tracking-tight leading-tight">
                  {c.name}
                </div>
                <div className="mono text-[11px] text-muted-foreground">
                  {count} item{count !== 1 ? "s" : ""}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}