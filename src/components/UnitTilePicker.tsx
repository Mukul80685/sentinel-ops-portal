import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { listUnits } from "@/lib/queries";
import { Building2 } from "lucide-react";

const LABELS = ["Unit A", "Unit B", "Unit C", "Unit D", "Unit E", "Unit F", "Unit G", "Unit H"];

export function UnitTilePicker({
  title,
  subtitle,
  basePath,
}: {
  title: string;
  subtitle: string;
  basePath: string; // e.g. "/inventory" — navigates to `${basePath}/${unitId}`
}) {
  const navigate = useNavigate();
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: listUnits });
  const [warn, setWarn] = useState<number | null>(null);

  function pick(idx: number) {
    const unit = units[idx];
    if (!unit) {
      setWarn(idx);
      return;
    }
    navigate({ to: `${basePath}/$unitId`, params: { unitId: unit.id } });
  }

  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="panel p-4 mb-3">
        <div className="label-eyebrow">Select Unit</div>
        <div className="mono text-[11px] text-muted-foreground mt-1">
          Choose a unit (A–H) to enter this module.
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {LABELS.map((label, idx) => {
          const unit = units[idx];
          const unavailable = warn === idx && !unit;
          return (
            <button
              key={label}
              onClick={() => pick(idx)}
              className={`tile text-left aspect-[5/3] flex flex-col justify-between focus:outline-none focus:border-primary ${
                unit ? "hover:border-primary" : "opacity-80"
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="label-eyebrow">Slot {String.fromCharCode(65 + idx)}</span>
              </div>
              <div>
                <div className="mono text-lg font-bold uppercase">{label}</div>
                {unit ? (
                  <div className="text-[11px] text-muted-foreground mono mt-1 truncate">
                    {unit.code} — {unit.name}
                  </div>
                ) : (
                  <div
                    className={`text-[11px] mono mt-1 ${
                      unavailable ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {unavailable ? "No agent registered for this unit" : "Unassigned"}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </AppShell>
  );
}