import { createFileRoute, Link, redirect, type ComponentType } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HomeNavIconBadge, type HomeIconTheme } from "@/components/home/HomeNavIcons";
import {
  ADMIN_HUB_STANDALONE,
  CONTROL_CENTER_MODULE_MAP,
  ccHubSearch,
  isControlCenterModule,
  type ControlCenterModuleId,
} from "@/lib/controlCenter";
import {
  ImportantFrequenciesView,
  IntelRepositoryView,
  PriorityAllocationView,
} from "@/components/control-center/ControlCenterModuleViews";
import { BackupRestore } from "@/components/BackupRestore";
import type { ModuleSnapshotId } from "@/lib/moduleSnapshots/types";

function isModuleSnapshotId(module: ControlCenterModuleId): module is ModuleSnapshotId {
  return module === "intel" || module === "priority";
}

export const Route = createFileRoute("/_authenticated/administrator")({
  component: AdministratorPage,
  head: () => ({ meta: [{ title: "Administrator — SSACC" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const moduleRaw = typeof search.module === "string" ? search.module : undefined;
    const module = moduleRaw && isControlCenterModule(moduleRaw) ? moduleRaw : undefined;
    return {
      unit: typeof search.unit === "string" ? search.unit : undefined,
      module,
    };
  },
  beforeLoad: ({ search }) => {
    if (search.module === "engagement") {
      throw redirect({ to: "/" });
    }
  },
});

const ACCENT_GRADIENT: Record<string, string> = {
  intel: "bg-gradient-to-r from-transparent via-indigo-500 to-transparent",
  priority: "bg-gradient-to-r from-transparent via-red-500 to-transparent",
  visibility: "bg-gradient-to-r from-transparent via-sky-500 to-transparent",
  inventory: "bg-gradient-to-r from-transparent via-amber-500 to-transparent",
  serviceability: "bg-gradient-to-r from-transparent via-slate-500 to-transparent",
};

const CC_TAB_THEMES: Record<string, HomeIconTheme> = {
  intel: "intel",
  priority: "priority",
};

type AdminHubTile =
  | { kind: "module"; id: ControlCenterModuleId; placement: string }
  | {
      kind: "route";
      to: "/visibility" | "/inventory" | "/serviceability";
      title: string;
      icon: React.ComponentType<{ className?: string }>;
      theme: HomeIconTheme;
      placement: string;
    };

const ADMIN_HUB_ROUTE_PLACEMENTS = [
  "col-span-2 col-start-5 row-start-1",
  "col-span-2 col-start-2 row-start-2",
  "col-span-2 col-start-4 row-start-2",
] as const;

const ADMIN_HUB_TILES: AdminHubTile[] = [
  { kind: "module", id: "intel", placement: "col-span-2 col-start-1 row-start-1" },
  { kind: "module", id: "priority", placement: "col-span-2 col-start-3 row-start-1" },
  ...ADMIN_HUB_STANDALONE.map((mod, i) => ({
    kind: "route" as const,
    to: mod.to,
    title: mod.title,
    icon: mod.icon,
    theme: mod.theme,
    placement: ADMIN_HUB_ROUTE_PLACEMENTS[i],
  })),
];

const MODULE_TILE_CLASS =
  "home-module-tile relative flex flex-col items-center justify-center gap-2 sm:gap-3 lg:gap-4 " +
  "h-full min-h-0 py-4 sm:py-5 lg:py-6 px-3 sm:px-4 text-center no-underline group";

function AdminHubTileLink({ tile }: { tile: AdminHubTile }) {
  if (tile.kind === "module") {
    const meta = CONTROL_CENTER_MODULE_MAP[tile.id];
    const theme = CC_TAB_THEMES[tile.id] ?? "intel";
    return (
      <Link
        to="/administrator"
        search={ccHubSearch(tile.id)}
        className={`${MODULE_TILE_CLASS} ${tile.placement}`}
      >
        <HomeNavIconBadge icon={meta.icon} theme={theme} size="lg" />
        <span className="mono text-[10px] sm:text-xs md:text-sm lg:text-base xl:text-xl font-bold uppercase tracking-[0.09em] text-foreground leading-snug group-hover:text-primary transition-colors">
          {meta.title}
        </span>
        <span className={`home-card-accent ${ACCENT_GRADIENT[theme] ?? ""}`} aria-hidden="true" />
      </Link>
    );
  }

  const accent = ACCENT_GRADIENT[tile.theme] ?? "";
  return (
    <Link to={tile.to} className={`${MODULE_TILE_CLASS} ${tile.placement}`}>
      <HomeNavIconBadge icon={tile.icon} theme={tile.theme} size="lg" />
      <span className="mono text-[10px] sm:text-xs md:text-sm lg:text-base xl:text-xl font-bold uppercase tracking-[0.09em] text-foreground leading-snug group-hover:text-primary transition-colors">
        {tile.title}
      </span>
      <span className={`home-card-accent ${accent}`} aria-hidden="true" />
    </Link>
  );
}

const MODULE_VIEWS: Record<ControlCenterModuleId, ComponentType> = {
  intel: IntelRepositoryView,
  important: ImportantFrequenciesView,
  priority: PriorityAllocationView,
};

function AdministratorHubView() {
  return (
    <div className="administrator-hub h-full min-h-0 max-w-[1600px] mx-auto w-full">
      <div className="h-full min-h-0 grid grid-cols-6 grid-rows-2 gap-4 sm:gap-5 lg:gap-6 auto-rows-fr">
        {ADMIN_HUB_TILES.map((tile) => (
          <AdminHubTileLink key={tile.kind === "module" ? tile.id : tile.to} tile={tile} />
        ))}
      </div>
    </div>
  );
}

function AdministratorPage() {
  const { module } = Route.useSearch();

  if (!module) {
    return (
      <AppShell isHome homeTitle="Administrator" horizontalNav={null}>
        <AdministratorHubView />
      </AppShell>
    );
  }

  const meta = CONTROL_CENTER_MODULE_MAP[module];
  const View = MODULE_VIEWS[module];
  if (!meta || !View) {
    return (
      <AppShell title="Administrator" horizontalNav={null}>
        <p className="mono text-sm text-muted-foreground">Unknown module.</p>
      </AppShell>
    );
  }

  const Icon = meta.icon;
  const ADMIN_ICON_THEME: Record<string, HomeIconTheme> = {
    intel: "intel",
    important: "important",
    priority: "priority",
  };

  return (
    <AppShell
      title={meta.title}
      headerIcon={<HomeNavIconBadge icon={Icon} theme={ADMIN_ICON_THEME[module] ?? "intel"} size="md" />}
      horizontalNav={null}
    >
      <View />
      {isModuleSnapshotId(module) ? <BackupRestore module={module} /> : null}
    </AppShell>
  );
}
