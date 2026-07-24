import { Link } from "@tanstack/react-router";
import { Orbit, Satellite } from "lucide-react";
import { HomeLauncherIcon } from "@/components/home/HomeNavIcons";
import { VSAT_DASHBOARD_PATH } from "@/lib/dashboardLabels";

const LAUNCHER_TILE_CLASS =
  "home-module-tile home-launcher-tile relative flex flex-col items-center justify-center gap-3 sm:gap-4 lg:gap-5 " +
  "h-full w-full py-6 sm:py-8 lg:py-10 px-3 sm:px-5 text-center no-underline group";

const HOME_CORNER_LOGO_RIGHT_CLASS =
  "pointer-events-none absolute top-3 z-20 h-32 w-32 object-contain sm:top-4 sm:h-36 sm:w-36";

const HOME_CORNER_LOGO_LEFT_CLASS =
  "pointer-events-none absolute top-3 z-20 h-[8.75rem] w-[8.75rem] object-contain sm:top-4 sm:h-40 sm:w-40";

export function HomeLauncher() {
  return (
    <div className="home-launcher relative flex flex-1 min-h-0 h-full w-full overflow-hidden rounded-md">
      <img
        src="/logo-left.png"
        alt=""
        draggable={false}
        aria-hidden="true"
        className={`${HOME_CORNER_LOGO_LEFT_CLASS} left-3 sm:left-4`}
      />
      <img
        src="/logo-right.png"
        alt=""
        draggable={false}
        aria-hidden="true"
        className={`${HOME_CORNER_LOGO_RIGHT_CLASS} right-3 sm:right-4`}
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

      <div className="relative z-10 flex flex-1 min-h-0 items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="grid w-full max-w-5xl grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 auto-rows-fr min-h-[20rem] sm:min-h-[22rem] lg:min-h-[26rem]">
          <Link to={VSAT_DASHBOARD_PATH} className={LAUNCHER_TILE_CLASS}>
            <HomeLauncherIcon icon={Satellite} theme="engagement" />
            <span className="mono text-xs sm:text-sm md:text-base lg:text-lg xl:text-2xl font-bold uppercase tracking-[0.09em] text-foreground leading-snug group-hover:text-primary transition-colors">
              VSAT
            </span>
            <span className="mono text-[10px] sm:text-[11px] md:text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground max-w-[16rem] leading-snug">
              Satellite monitoring dashboard
            </span>
            <span
              className="home-card-accent bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
              aria-hidden="true"
            />
          </Link>

          <div
            className={`${LAUNCHER_TILE_CLASS} home-launcher-tile--disabled`}
            aria-disabled="true"
            title="Coming soon"
          >
            <HomeLauncherIcon icon={Orbit} theme="satellite" />
            <span className="mono text-xs sm:text-sm md:text-base lg:text-lg xl:text-2xl font-bold uppercase tracking-[0.09em] text-muted-foreground leading-snug">
              Thuraya and Others
            </span>
            <span className="mono text-[10px] sm:text-[11px] md:text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 max-w-[16rem] leading-snug">
              Available in a future release
            </span>
            <span
              className="home-card-accent bg-gradient-to-r from-transparent via-amber-500 to-transparent"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
