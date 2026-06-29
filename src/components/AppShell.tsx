import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Power,
  ArrowLeft,
  Orbit,
  Satellite,
  Landmark,
  Settings,
  User,
  FileText,
  Clock,
  Trash2,
  Star,
  Megaphone,
} from "lucide-react";
import { performSignOut, useAuth, useIsAdmin } from "@/lib/auth";
import { ccHubSearch } from "@/lib/controlCenter";
import {
  renderSidebarIcon,
  HOME_SIDEBAR_BTN,
  type HomeIconTheme,
} from "@/components/home/HomeNavIcons";
import { useSidebarModules } from "@/components/sidebar/SidebarModulesProvider";
import { SidebarProfileButton } from "@/components/sidebar/SidebarProfileButton";
import { TIMEZONES, type IanaTimezone } from "@/lib/appTimezones";
import { PasswordResetNotice } from "@/components/auth/PasswordResetNotice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState, type ReactNode } from "react";

/** Support / utility navigation — NOT main dashboard modules (those live on the homepage). */
const supportNavItems = [
  { key: "satellites", label: "Satellites",         icon: Satellite, adminTo: "/admin/satellites", userTo: "/visibility" },
  { key: "minutes",    label: "Recent Discussions", icon: Clock,     adminTo: "/minutes",           userTo: "/minutes" },
  { key: "reports",    label: "Reports",            icon: FileText,  adminTo: "/reports",           userTo: "/reports" },
  { key: "discarded",  label: "Discarded Frequencies", icon: Trash2, adminTo: "/discarded",       userTo: "/discarded" },
] as const;

const standardNavItems = [
  { key: "units",      label: "Units",               icon: Landmark,  adminTo: "/admin/units",      userTo: "/inventory" },
  { key: "satellites", label: "Satellites",          icon: Satellite, adminTo: "/admin/satellites", userTo: "/visibility" },
  { key: "reports",    label: "Reports and Returns", icon: FileText,  adminTo: "/reports",           userTo: "/reports" },
  { key: "discarded",  label: "Discarded Frequencies", icon: Trash2, adminTo: "/discarded",       userTo: "/discarded" },
  { key: "minutes",    label: "Recent Discussions",  icon: Clock,     adminTo: "/minutes",           userTo: "/minutes" },
] as const;

// ─── Live clocks ───────────────────────────────────────────────────────────────

function useLiveStamp() {
  const [stamp, setStamp] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    setStamp(fmt());
    const id = setInterval(() => setStamp(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return stamp;
}

/** Timezone-aware live clock — returns { time, date, full } */
function useLiveTzStamp(tz: string) {
  const [stamp, setStamp] = useState({ time: "", date: "", full: "" });
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      const time = `${now.toLocaleTimeString("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })} Hrs`;
      const date = now.toLocaleDateString("en-GB", {
        timeZone: tz,
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return { time, date, full: `${date} · ${time}` };
    };
    setStamp(fmt());
    const id = setInterval(() => setStamp(fmt()), 1000);
    return () => clearInterval(id);
  }, [tz]);
  return stamp;
}

type TzStamp = ReturnType<typeof useLiveTzStamp>;

function SidebarClock({
  stamp,
  onClockClick,
  muted = false,
}: {
  stamp: TzStamp;
  onClockClick: () => void;
  muted?: boolean;
}) {
  const textCls = muted ? "text-muted-foreground" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClockClick}
      title="Open Date / Time Control Panel"
      className="w-full text-left px-2 py-1 hover:bg-secondary/50 transition-colors rounded-sm flex items-start gap-2"
    >
      <Clock className={`h-3 w-3 shrink-0 mt-0.5 ${textCls}`} />
      <span className="flex flex-col gap-0.5 min-w-0 leading-tight">
        <span className={`mono text-[10px] ${textCls}`}>{stamp.date || "\u00A0"}</span>
        <span className={`mono text-[10px] ${textCls}`}>{stamp.time || "\u00A0"}</span>
      </span>
    </button>
  );
}

function navActive(pathname: string, to: string, exact?: boolean) {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

/** Shared style for Settings + Sign Out — identical font/size/weight */
const secondaryCtrlCls =
  "flex w-full items-center gap-2 px-2 py-1 mono text-[11px] uppercase tracking-wider text-foreground rounded-sm hover:bg-secondary/50 transition-colors";

function SidebarLink({
  to,
  label,
  icon: Icon,
  active,
  bold = false,
  search,
  isHome = false,
  iconTheme,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  bold?: boolean;
  search?: Record<string, unknown>;
  isHome?: boolean;
  iconTheme?: HomeIconTheme;
}) {
  const base = isHome
    ? `${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap`
    : "flex items-center gap-2 px-2 py-1 mono text-[11px] uppercase tracking-wider rounded-sm transition-colors leading-tight text-left";
  const state = active
    ? isHome
      ? "home-sidebar-btn-active"
      : "bg-secondary text-foreground"
    : isHome
      ? ""
      : "text-sidebar-foreground hover:bg-secondary/50 hover:text-foreground";

  return (
    <Link to={to} search={search} className={`${base} ${state} ${bold ? "font-bold" : ""}`}>
      {iconTheme ? renderSidebarIcon(isHome, Icon, iconTheme) : <Icon className="h-3 w-3 shrink-0" />}
      <span className="min-w-0">{label}</span>
    </Link>
  );
}

function SidebarModalButton({
  label,
  icon: Icon,
  active,
  onClick,
  isHome = false,
  iconTheme,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
  isHome?: boolean;
  iconTheme?: HomeIconTheme;
}) {
  const base = isHome
    ? `${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap`
    : "flex w-full items-center gap-2 px-2 py-1 mono text-[11px] uppercase tracking-wider rounded-sm transition-colors leading-tight text-left";
  const state = active
    ? isHome
      ? "home-sidebar-btn-active"
      : "bg-secondary text-foreground"
    : isHome
      ? ""
      : "text-sidebar-foreground hover:bg-secondary/50 hover:text-foreground";

  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`}>
      {iconTheme ? renderSidebarIcon(isHome, Icon, iconTheme) : <Icon className="h-3 w-3 shrink-0" />}
      <span className="min-w-0">{label}</span>
    </button>
  );
}

/**
 * Standard horizontal navigation bar — rendered automatically on all module pages
 * unless a custom horizontalNav is passed to AppShell.
 */
function StandardModuleNav() {
  const isAdmin = useIsAdmin();
  const resolveTo = (item: (typeof standardNavItems)[number]) =>
    isAdmin ? item.adminTo : item.userTo;

  return (
    <nav className="border-b border-border bg-sidebar">
      <div className="flex items-center overflow-x-auto px-4 sm:px-5 py-1.5 gap-0.5 min-w-0">
        {standardNavItems.map((item) => (
          <Link
            key={item.key}
            to={resolveTo(item)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-sm whitespace-nowrap shrink-0 transition-colors text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

// ─── Date / Time Control Panel modal ─────────────────────────────────────────

function DateTimeModal({
  open,
  onOpenChange,
  selectedTz,
  onTzChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedTz: string;
  onTzChange: (tz: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const tzStamp = useLiveTzStamp(selectedTz);

  // Group timezones by region for the dropdown
  const groupedTz = useMemo(() => {
    const map: Record<string, typeof TIMEZONES[number][]> = {};
    for (const tz of TIMEZONES) {
      (map[tz.group] ??= []).push(tz);
    }
    return map;
  }, []);

  const tzLabel = TIMEZONES.find((t) => t.iana === selectedTz)?.label ?? selectedTz;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="mono uppercase tracking-wider text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Date / Time Control Panel
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row overflow-y-auto max-h-[70vh]">
          {/* ── LEFT: Calendar ── */}
          <div className="flex-1 border-b sm:border-b-0 sm:border-r border-border p-4">
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
              Calendar
            </div>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="w-full"
            />
          </div>

          {/* ── RIGHT: Clock + Timezone ── */}
          <div className="flex-1 p-5 flex flex-col gap-5">
            {/* Live clock */}
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Current Time
              </div>
              <div className="mono text-4xl font-bold tabular-nums tracking-tight text-foreground leading-none">
                {tzStamp.time || "──:──:──"}
              </div>
              <div className="mono text-[11px] text-muted-foreground mt-1.5">
                {tzStamp.date}
              </div>
            </div>

            {/* Selected date display */}
            {selectedDate && (
              <div className="panel px-3 py-2">
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Selected Date
                </div>
                <div className="mono text-sm font-semibold mt-0.5">
                  {selectedDate.toLocaleDateString("en-GB", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
            )}

            {/* Timezone selector */}
            <div>
              <Label className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Time Zone
              </Label>
              <Select value={selectedTz} onValueChange={onTzChange}>
                <SelectTrigger className="mt-1.5 mono text-[12px]">
                  <SelectValue>
                    <span className="truncate">{tzLabel}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {Object.entries(groupedTz).map(([group, zones]) => (
                    <SelectGroup key={group}>
                      <SelectLabel className="mono text-[10px] uppercase tracking-widest px-2 py-1">
                        {group}
                      </SelectLabel>
                      {zones.map((tz) => (
                        <SelectItem key={tz.iana} value={tz.iana} className="mono text-[12px]">
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sidebars ──────────────────────────────────────────────────────────────────

/**
 * Primary navigation sidebar — used on homepage and all main modules.
 * TOP: User Profile, Settings, Clock, Sign Out
 * MAIN: four primary application functions
 */
/**
 * Primary sidebar — support / utility navigation only.
 * Operational modules (Control Center, Visibility, Inventory, Serviceability) are on the homepage.
 */
function PrimaryNavSidebar({
  pathname,
  stamp,
  onClockClick,
  isHome = false,
}: {
  pathname: string;
  stamp: TzStamp;
  onClockClick: () => void;
  isHome?: boolean;
}) {
  const { activeModule, openModule } = useSidebarModules();
  const ccModule = useRouterState({
    select: (s) => (s.location.search as { module?: string }).module,
  });
  const importantActive =
    pathname === "/control-center" && ccModule === "important";

  return (
    <div className="flex flex-col h-full">
      {/* TOP — profile name, then Clock */}
      <div className="px-2 pt-1.5 pb-1 flex flex-col gap-0.5 shrink-0">
        <SidebarProfileButton
          active={activeModule === "profile"}
          onClick={() => openModule("profile")}
          className={`${secondaryCtrlCls} cursor-pointer ${activeModule === "profile" ? "bg-secondary" : ""}`}
        />
        <SidebarClock stamp={stamp} onClockClick={onClockClick} />
      </div>

      <div className="border-t border-border mx-1.5 shrink-0" />

      {/* MAIN — utility navigation */}
      <nav className={`flex-1 py-1 px-1.5 flex flex-col gap-0.5 min-h-0 ${isHome ? "home-sidebar-nav" : ""}`}>
        <SidebarModalButton
          label="Satellites"
          icon={Orbit}
          active={activeModule === "satellites"}
          onClick={() => openModule("satellites")}
          isHome={isHome}
          iconTheme="satellite"
        />
        <SidebarModalButton
          label="Recent Discussions"
          icon={Megaphone}
          active={activeModule === "discussions"}
          onClick={() => openModule("discussions")}
          isHome={isHome}
          iconTheme="discussions"
        />
        <SidebarModalButton
          label="Reports"
          icon={FileText}
          active={activeModule === "reports"}
          onClick={() => openModule("reports")}
          isHome={isHome}
          iconTheme="reports"
        />
        <SidebarLink
          to="/control-center"
          search={ccHubSearch("important")}
          label="Important Frequency"
          icon={Star}
          active={importantActive}
          isHome={isHome}
          iconTheme="important"
        />
        <SidebarLink
          to="/discarded"
          label="Discarded Frequency"
          icon={Trash2}
          active={navActive(pathname, "/discarded")}
          isHome={isHome}
          iconTheme="discarded"
        />
      </nav>

      {/* BOTTOM — Settings, Sign Out */}
      <div className="border-t border-border px-2 py-1.5 flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={() => openModule("settings")}
          className={
            isHome
              ? `${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap ${activeModule === "settings" ? "home-sidebar-btn-active" : ""}`
              : `${secondaryCtrlCls} ${activeModule === "settings" ? "bg-secondary" : ""}`
          }
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Settings</span>
        </button>
        <button
          type="button"
          onClick={() => void performSignOut()}
          className={isHome ? `${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap` : secondaryCtrlCls}
        >
          <Power className="h-3.5 w-3.5 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Secondary sidebar — used by the Resource Inventory module.
 * Layout: User/nav items evenly distributed (flex-1) → Settings → Clock + Sign Out (pinned bottom).
 */
function SecondarySidebar({
  pathname,
  resolveSecondaryTo,
  stamp,
  onClockClick,
}: {
  pathname: string;
  resolveSecondaryTo: (item: (typeof standardNavItems)[number]) => string;
  stamp: TzStamp;
  onClockClick: () => void;
}) {
  const { activeModule, openModule } = useSidebarModules();

  return (
    <div className="flex flex-col h-full">
      <nav className="flex-1 flex flex-col justify-between px-1.5 py-3">
        <SidebarProfileButton
          active={activeModule === "profile"}
          onClick={() => openModule("profile")}
          className={`flex w-full items-center gap-2 px-2 py-1.5 mono text-[11px] uppercase tracking-wider rounded-sm transition-colors ${
            activeModule === "profile"
              ? "bg-secondary text-foreground font-bold"
              : "text-sidebar-foreground hover:bg-secondary/50"
          } cursor-pointer`}
        />

        {standardNavItems.map((item) => {
          if (item.key === "satellites") {
            return (
              <SidebarModalButton
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={activeModule === "satellites"}
                onClick={() => openModule("satellites")}
              />
            );
          }
          if (item.key === "minutes") {
            return (
              <SidebarModalButton
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={activeModule === "discussions"}
                onClick={() => openModule("discussions")}
              />
            );
          }
          if (item.key === "reports") {
            return (
              <SidebarModalButton
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={activeModule === "reports"}
                onClick={() => openModule("reports")}
              />
            );
          }
          const to = resolveSecondaryTo(item);
          return (
            <SidebarLink
              key={item.key}
              to={to}
              label={item.label}
              icon={item.icon}
              active={navActive(pathname, to)}
            />
          );
        })}
      </nav>

      <div className="border-t border-border px-2 py-1.5">
        <button
          type="button"
          onClick={() => openModule("settings")}
          className={`${secondaryCtrlCls} ${activeModule === "settings" ? "bg-secondary" : ""}`}
          title="Settings"
        >
          <Settings className="h-3 w-3 shrink-0" />
          Settings
        </button>
      </div>

      <div className="border-t border-border px-2 py-1.5 space-y-0.5">
        <SidebarClock stamp={stamp} onClockClick={onClockClick} muted />
        <button type="button" onClick={() => void performSignOut()} className={secondaryCtrlCls}>
          <Power className="h-3 w-3 shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  headerIcon,
  headerTitleClassName,
  showBack = false,
  backLink,
  isHome = false,
  hideSidebar = false,
  sidebarVariant = "primary",
  horizontalNav,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  headerIcon?: ReactNode;
  /** Override default module title styling (e.g. smaller, no truncate). */
  headerTitleClassName?: string;
  showBack?: boolean;
  /** When set, Back navigates here instead of browser history */
  backLink?: {
    to: string;
    search?: Record<string, unknown>;
    params?: Record<string, string>;
  };
  isHome?: boolean;
  hideSidebar?: boolean;
  /** "primary" = support nav (default). "secondary" = inventory admin layout. */
  sidebarVariant?: "primary" | "secondary";
  /** Pass `null` to suppress horizontal nav entirely. Omit for default StandardModuleNav. */
  horizontalNav?: ReactNode | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Timezone selection persists for the session; defaults to IST
  const [selectedTz, setSelectedTz] = useState<string>("Asia/Kolkata");
  const [dtOpen, setDtOpen] = useState(false);
  const tzStamp = useLiveTzStamp(selectedTz);

  const resolveSecondaryTo = (item: (typeof standardNavItems)[number]) =>
    isAdmin ? item.adminTo : item.userTo;

  return (
    <div className="flex h-screen overflow-hidden text-foreground">
      <aside
        className={`${hideSidebar ? "hidden" : "hidden md:flex"} shrink-0 flex-col border-r border-border bg-sidebar ${
          isHome ? "w-56 lg:w-[15.5rem] home-sidebar" : "w-48"
        }`}
      >
        {sidebarVariant === "secondary" ? (
          <SecondarySidebar
            pathname={pathname}
            resolveSecondaryTo={resolveSecondaryTo}
            stamp={tzStamp}
            onClockClick={() => setDtOpen(true)}
          />
        ) : (
          <PrimaryNavSidebar
            pathname={pathname}
            stamp={tzStamp}
            onClockClick={() => setDtOpen(true)}
            isHome={isHome}
          />
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {isHome ? (
          <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-20 shrink-0">
            <div className="relative flex items-center justify-center w-full min-h-[4.5rem] sm:min-h-[5rem] px-4 sm:px-8 lg:px-10 py-3 sm:py-4">
              <h1
                className="mono font-bold uppercase text-[#000000] tracking-tight leading-none whitespace-nowrap
                           text-[clamp(0.78rem,1.55vw+0.35rem,1.9rem)] max-w-full text-center"
              >
                Satellite Signal Analysis and Coordination Center
              </h1>
              {actions && (
                <div className="absolute right-4 sm:right-6 lg:right-8 top-1/2 -translate-y-1/2 shrink-0">
                  {actions}
                </div>
              )}
            </div>
          </header>
        ) : (
          /* ── MODULE HEADER: back | title | home ── */
          <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 py-3">
              <div className="flex items-center">
                {showBack && (
                  backLink ? (
                    <Link
                      to={backLink.to}
                      search={backLink.search}
                      params={backLink.params}
                      className="mono text-[11px] h-8 px-3 inline-flex items-center uppercase tracking-wider border border-border rounded-sm hover:bg-secondary/50 hover:text-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.history.back()}
                      className="mono text-[11px] h-8 uppercase tracking-wider"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                    </Button>
                  )
                )}
              </div>

              <div className="min-w-0 text-center px-2">
                <div className="label-eyebrow">SSACC</div>
                {headerIcon && (
                  <div className="flex justify-center mt-1.5 mb-1">
                    <div className="h-9 w-9 grid place-items-center rounded-lg border border-primary/30 bg-primary/10
                                    shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_6px_rgba(0,0,0,0.1)]">
                      {headerIcon}
                    </div>
                  </div>
                )}
                <h1
                  className={
                    headerTitleClassName ??
                    "mono text-base sm:text-lg font-bold tracking-tight uppercase truncate"
                  }
                >
                  {title ?? "Module"}
                </h1>
                {subtitle && (
                  <div className="text-[11px] text-foreground/80 mt-0.5">{subtitle}</div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                {actions}
                <Link
                  to="/"
                  className="mono text-[11px] h-8 px-3 inline-flex items-center uppercase tracking-wider border border-border rounded-sm hover:bg-secondary/50 hover:text-foreground"
                >
                  <Home className="h-3.5 w-3.5 mr-1" /> Home
                </Link>
              </div>
            </div>
          </header>
        )}

        {/* Sidebar is the sole module navigation — no duplicate horizontal strip */}
        {horizontalNav}

        <main className={`flex-1 min-h-0 overflow-hidden ${isHome ? "p-3 sm:p-4 lg:p-5 xl:p-6" : "overflow-y-auto overflow-x-hidden p-4 sm:p-6"}`}>
          <PasswordResetNotice email={user?.email} />
          {children}
        </main>
      </div>

      {/* Date / Time Control Panel — global, rendered at AppShell level */}
      <DateTimeModal
        open={dtOpen}
        onOpenChange={setDtOpen}
        selectedTz={selectedTz}
        onTzChange={setSelectedTz}
      />
    </div>
  );
}

export function Tile({
  title,
  meta,
  to,
  params,
  onClick,
  children,
}: {
  title: string;
  meta?: ReactNode;
  to?: any;
  params?: any;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <div className="tile cursor-pointer h-full flex flex-col" onClick={onClick}>
      <div className="label-eyebrow">{meta}</div>
      <div className="mono text-base font-bold uppercase tracking-tight mt-1">{title}</div>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
  if (to) {
    return (
      <Link to={to} params={params} className="block">
        {body}
      </Link>
    );
  }
  return body;
}
