import { useEffect, useState } from "react";
import { Orbit } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge } from "@/components/home/HomeNavIcons";
import { ThurayaAdvancedFeatures } from "@/components/thuraya/ThurayaAdvancedFeatures";
import { ThurayaImageLightbox } from "@/components/thuraya/ThurayaImageLightbox";
import { ThurayaUnitTile } from "@/components/thuraya/ThurayaUnitTile";
import {
  THURAYA_DATA_EVENT,
  listThurayaUnits,
  setThurayaLightboxPanelPosition,
  setThurayaTilePanelPosition,
  type ThurayaUnit,
} from "@/lib/thurayaStore";

export function ThurayaUnitHome() {
  const [units, setUnits] = useState<ThurayaUnit[]>(() => listThurayaUnits());
  const [lightboxUnit, setLightboxUnit] = useState<ThurayaUnit | null>(null);

  useEffect(() => {
    const refresh = () => setUnits(listThurayaUnits());
    window.addEventListener(THURAYA_DATA_EVENT, refresh);
    return () => window.removeEventListener(THURAYA_DATA_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!lightboxUnit) return;
    const latest = listThurayaUnits().find((u) => u.id === lightboxUnit.id);
    if (latest) setLightboxUnit(latest);
  }, [units, lightboxUnit?.id]);

  function handleTilePanelMove(unitId: string, position: { x: number; y: number }) {
    setThurayaTilePanelPosition(unitId, position);
  }

  function handleLightboxPanelMove(unitId: string, position: { x: number; y: number }) {
    setThurayaLightboxPanelPosition(unitId, position);
  }

  return (
    <AppShell
      title="Thuraya"
      headerIcon={<HomeNavIconBadge icon={Orbit} theme="important" size="md" />}
      showBack
      backLink={{ to: "/" }}
      horizontalNav={null}
      fillMain
    >
      <div className="flex flex-col gap-4 min-h-0 flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-h-0 overflow-y-auto pb-2">
          {units.map((unit) => (
            <ThurayaUnitTile
              key={unit.id}
              unit={unit}
              onOpenLightbox={setLightboxUnit}
              onTilePanelMove={handleTilePanelMove}
            />
          ))}
        </div>

        <div className="shrink-0 border-t border-border/40 pt-3">
          <ThurayaAdvancedFeatures units={units} onChanged={() => setUnits(listThurayaUnits())} />
        </div>
      </div>

      <ThurayaImageLightbox
        unit={lightboxUnit}
        onClose={() => setLightboxUnit(null)}
        onLightboxPanelMove={handleLightboxPanelMove}
      />
    </AppShell>
  );
}
