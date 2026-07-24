import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Globe, Orbit, Satellite } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HomeLauncherIcon } from "@/components/home/HomeNavIcons";
import { BEIDOU_HOME_PATH, THURAYA_HOME_PATH, VSAT_DASHBOARD_PATH } from "@/lib/dashboardLabels";
const LAUNCHER_TILE_CLASS =
  "home-module-tile home-launcher-tile relative flex flex-col items-center justify-center gap-2 sm:gap-3 " +
  "h-full w-full py-4 sm:py-5 px-3 sm:px-4 text-center no-underline group";

const HOME_CORNER_LOGO_RIGHT_CLASS =
  "pointer-events-none absolute top-0 right-0 z-[5] h-[5.5rem] w-[5.5rem] object-contain object-right-top sm:h-24 sm:w-24 lg:h-28 lg:w-28";

const HOME_CORNER_LOGO_LEFT_CLASS =
  "pointer-events-none absolute top-0 left-0 z-[5] h-[5.5rem] w-[5.5rem] object-contain object-left-top sm:h-24 sm:w-24 lg:h-28 lg:w-28";

type OthersSubTile = {
  id: string;
  label: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
};

const OTHERS_SUB_TILES: OthersSubTile[] = [
  {
    id: "thuraya",
    label: "Thuraya",
    icon: Orbit,
    accent: "bg-gradient-to-r from-transparent via-amber-500 to-transparent",
    iconBg: "bg-amber-500",
  },
  {
    id: "beidou",
    label: "BeiDou",
    icon: Globe,
    accent: "bg-gradient-to-r from-transparent via-emerald-500 to-transparent",
    iconBg: "bg-emerald-600",
  },
];

function OthersSubTileIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span
      className={`grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_8px_rgba(0,0,0,0.12)] ${className}`}
    >
      <Icon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem] text-white" strokeWidth={2.25} />
    </span>
  );
}

function OthersLauncherSlot() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`home-launcher-others-slot relative h-full min-h-0 w-full${expanded ? " home-launcher-others-slot--expanded" : ""}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse Thuraya and Beidou" : "Expand Thuraya and Beidou into Thuraya and BeiDou"}
        className={`${LAUNCHER_TILE_CLASS} home-launcher-others-parent group/others`}
        onClick={() => setExpanded(true)}
      >
        <HomeLauncherIcon icon={Orbit} theme="satellite" />
        <span className="mono text-sm sm:text-base md:text-lg font-bold uppercase tracking-[0.09em] text-foreground leading-snug group-hover/others:text-primary transition-colors">
          Thuraya and Beidou
        </span>
        <span
          className="home-card-accent bg-gradient-to-r from-transparent via-amber-500 to-transparent"
          aria-hidden="true"
        />
      </button>

      <div className="home-launcher-others-split px-0.5 pt-5 pb-0.5" aria-hidden={!expanded}>
        <button
          type="button"
          aria-label="Collapse to Thuraya and Beidou"
          className="home-launcher-others-collapse mono absolute top-0 right-0.5 z-10 inline-flex h-6 items-center gap-0.5 rounded-sm border border-border/60 bg-card/95 px-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm hover:text-foreground"
          onClick={() => setExpanded(false)}
        >
          <ChevronLeft className="h-3 w-3" />
          Back
        </button>
        <div className="grid h-full min-h-0 grid-cols-2 gap-1.5 sm:gap-2">
          {OTHERS_SUB_TILES.map((tile, index) => {
            const className =
              "home-launcher-sub-tile home-module-tile relative flex min-h-0 flex-col items-center justify-center gap-1 sm:gap-1.5 px-1 py-2 sm:py-2.5 text-center no-underline transition-[filter,box-shadow] hover:brightness-105";

            if (tile.id === "thuraya") {
              return (
                <Link
                  key={tile.id}
                  to={THURAYA_HOME_PATH}
                  style={{ animationDelay: `${index * 70}ms` }}
                  className={className}
                >
                  <OthersSubTileIcon icon={tile.icon} className={tile.iconBg} />
                  <span className="mono text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] text-foreground leading-tight">
                    {tile.label}
                  </span>
                  <span className={`home-card-accent w-[70%] ${tile.accent}`} aria-hidden="true" />
                </Link>
              );
            }

            if (tile.id === "beidou") {
              return (
                <Link
                  key={tile.id}
                  to={BEIDOU_HOME_PATH}
                  style={{ animationDelay: `${index * 70}ms` }}
                  className={className}
                >
                  <OthersSubTileIcon icon={tile.icon} className={tile.iconBg} />
                  <span className="mono text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] text-foreground leading-tight">
                    {tile.label}
                  </span>
                  <span className={`home-card-accent w-[70%] ${tile.accent}`} aria-hidden="true" />
                </Link>
              );
            }

            return (
              <button
                key={tile.id}
                type="button"
                disabled
                title="Coming soon"
                style={{ animationDelay: `${index * 70}ms` }}
                className={`${className} opacity-90 cursor-not-allowed`}
              >
                <OthersSubTileIcon icon={tile.icon} className={tile.iconBg} />
                <span className="mono text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] text-foreground leading-tight">
                  {tile.label}
                </span>
                <span className={`home-card-accent w-[70%] ${tile.accent}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HomeLauncher() {
  return (
    <div className="home-launcher relative flex flex-1 min-h-0 h-full w-full overflow-hidden rounded-md">
      <img
        src="/logo-left.png"
        alt=""
        draggable={false}
        aria-hidden="true"
        className={HOME_CORNER_LOGO_LEFT_CLASS}
      />
      <img
        src="/logo-right.png"
        alt=""
        draggable={false}
        aria-hidden="true"
        className={HOME_CORNER_LOGO_RIGHT_CLASS}
      />

      <div
        className="absolute inset-0 pointer-events-none bg-cover bg-center bg-no-repeat opacity-90"
        style={{
          backgroundImage: "url(/satellite-monitoring-bg.png)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(160deg, rgba(242,239,229,0.72) 0%, rgba(234,239,230,0.78) 45%, rgba(242,239,229,0.82) 100%)",
        }}
      />

      <div className="relative z-10 flex flex-1 min-h-0 items-center justify-center px-[max(6.5rem,11vw)] sm:px-[max(7.5rem,13vw)] py-3 sm:py-5">
        <div className="grid w-full max-w-2xl grid-cols-1 items-stretch md:grid-cols-2 gap-3 sm:gap-4">
          <Link to={VSAT_DASHBOARD_PATH} className={LAUNCHER_TILE_CLASS}>
            <HomeLauncherIcon icon={Satellite} theme="engagement" />
            <span className="mono text-sm sm:text-base md:text-lg font-bold uppercase tracking-[0.09em] text-foreground leading-snug group-hover:text-primary transition-colors">
              VSAT
            </span>
            <span
              className="home-card-accent bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
              aria-hidden="true"
            />
          </Link>

          <OthersLauncherSlot />
        </div>
      </div>
    </div>
  );
}
