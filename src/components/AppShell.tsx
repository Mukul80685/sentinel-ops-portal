import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import earthBg from "@/assets/earth-bg.png";
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
  Info,
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
import {
  SidebarModalBody,
  SidebarModalContent,
  SidebarModalHeader,
  SidebarModalSection,
} from "@/components/sidebar/SidebarModalLayout";
import { TIMEZONES, type IanaTimezone } from "@/lib/appTimezones";
import { getActiveResetNotification } from "@/lib/passwordRecovery";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { Input } from "@/components/ui/input";
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
function useLiveTzStamp(tz: string, offsetMs = 0) {
  const [stamp, setStamp] = useState({ time: "", date: "", full: "" });
  useEffect(() => {
    const fmt = () => {
      const now = new Date(Date.now() + offsetMs);
      const time = `${now.toLocaleTimeString("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
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
  }, [tz, offsetMs]);
  return stamp;
}

type TzStamp = ReturnType<typeof useLiveTzStamp>;

function SidebarClock({
  stamp,
  onClockClick,
}: {
  stamp: TzStamp;
  onClockClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClockClick}
      title="Open Date / Time Control Panel"
      className="home-sidebar-clock w-full flex items-center gap-2 px-2.5 py-2 mono text-[10px] uppercase tracking-wide whitespace-nowrap"
    >
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="flex flex-col gap-0.5 min-w-0 leading-tight text-left">
        <span>{stamp.date || "\u00A0"}</span>
        <span>{stamp.time || "\u00A0"}</span>
      </span>
    </button>
  );
}

function navActive(pathname: string, to: string, exact?: boolean) {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

function SidebarLink({
  to,
  label,
  icon: Icon,
  active,
  bold = false,
  search,
  iconTheme,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  bold?: boolean;
  search?: Record<string, unknown>;
  iconTheme?: HomeIconTheme;
}) {
  const base = `${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap`;
  const state = active ? "home-sidebar-btn-active" : "";

  return (
    <Link to={to} search={search} className={`${base} ${state} ${bold ? "font-bold" : ""}`}>
      {iconTheme ? renderSidebarIcon(Icon, iconTheme) : <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0">{label}</span>
    </Link>
  );
}

function SidebarModalButton({
  label,
  icon: Icon,
  active,
  onClick,
  iconTheme,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
  iconTheme?: HomeIconTheme;
}) {
  const base = `${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap`;
  const state = active ? "home-sidebar-btn-active" : "";

  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`}>
      {iconTheme ? renderSidebarIcon(Icon, iconTheme) : <Icon className="h-3.5 w-3.5 shrink-0" />}
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
  offsetMs,
  onOffsetChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedTz: string;
  onTzChange: (tz: string) => void;
  offsetMs: number;
  onOffsetChange: (ms: number) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const tzStamp = useLiveTzStamp(selectedTz, offsetMs);

  const [overrideHH, setOverrideHH] = useState("");
  const [overrideMM, setOverrideMM] = useState("");
  const [overrideSS, setOverrideSS] = useState("");
  const [overrideErr, setOverrideErr] = useState("");

  // Pre-fill override inputs with current time in selected TZ whenever the modal opens
  useEffect(() => {
    if (!open) return;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: selectedTz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(Date.now() + offsetMs);
    setOverrideHH(parts.find((p) => p.type === "hour")?.value ?? "00");
    setOverrideMM(parts.find((p) => p.type === "minute")?.value ?? "00");
    setOverrideSS(parts.find((p) => p.type === "second")?.value ?? "00");
    setOverrideErr("");
  }, [open, selectedTz]);

  // Group timezones by region for the dropdown
  const groupedTz = useMemo(() => {
    const map: Record<string, typeof TIMEZONES[number][]> = {};
    for (const tz of TIMEZONES) {
      (map[tz.group] ??= []).push(tz);
    }
    return map;
  }, []);

  const tzLabel = TIMEZONES.find((t) => t.iana === selectedTz)?.label ?? selectedTz;

  function applyOverride() {
    setOverrideErr("");
    const hh = parseInt(overrideHH || "0", 10);
    const mm = parseInt(overrideMM || "0", 10);
    const ss = parseInt(overrideSS || "0", 10);
    if (isNaN(hh) || hh < 0 || hh > 23) return setOverrideErr("Hour must be 0–23.");
    if (isNaN(mm) || mm < 0 || mm > 59) return setOverrideErr("Minute must be 0–59.");
    if (isNaN(ss) || ss < 0 || ss > 59) return setOverrideErr("Second must be 0–59.");

    // Read current time parts in the selected timezone
    const now = Date.now();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: selectedTz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const curHH = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
    const curMM = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
    const curSS = parseInt(parts.find((p) => p.type === "second")!.value, 10);

    const diffMs = ((hh - curHH) * 3600 + (mm - curMM) * 60 + (ss - curSS)) * 1000;
    onOffsetChange(diffMs);
    setOverrideHH("");
    setOverrideMM("");
    setOverrideSS("");
  }

  function resetOverride() {
    onOffsetChange(0);
    setOverrideErr("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SidebarModalContent className="max-w-2xl">
        <SidebarModalHeader
          icon={Clock}
          title="Date / Time Control Panel"
          subtitle="Timezone selection and manual clock override"
        />

        <div className="flex max-h-[72vh] flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">
          {/* ── LEFT: Calendar ── */}
          <div className="flex-1 border-b border-border bg-muted/15 p-4 sm:border-b-0 sm:border-r">
            <div className="label-eyebrow mb-3 text-[10px]">Calendar</div>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="w-full rounded-sm border border-border/60 bg-card/80 p-2 shadow-sm"
            />
          </div>

          {/* ── RIGHT: Clock + Timezone ── */}
          <SidebarModalBody className="max-h-none flex-1 space-y-4 sm:max-h-[72vh]">
            {/* Live clock */}
            <div className="panel relative overflow-hidden px-4 py-3 shadow-sm">
              <div className="absolute inset-y-0 left-0 w-1 bg-primary/70" />
              <div className="label-eyebrow mb-2 text-[10px]">Current Time</div>
              <div className="mono text-4xl font-bold tabular-nums leading-none tracking-tight text-foreground">
                {tzStamp.time || "──:──:──"}
              </div>
              <div className="mono mt-1.5 text-[11px] text-muted-foreground">{tzStamp.date}</div>
              <div className="mono mt-2 text-[10px] text-primary/80">{tzLabel}</div>
            </div>

            {/* Selected date display */}
            {selectedDate ? (
              <div className="rounded-sm border border-border/70 bg-muted/20 px-3 py-2.5">
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Selected Date
                </div>
                <div className="mono mt-0.5 text-sm font-semibold">
                  {selectedDate.toLocaleDateString("en-GB", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
            ) : null}

            {/* Timezone selector */}
            <SidebarModalSection title="Time Zone">
              <Select value={selectedTz} onValueChange={onTzChange}>
                <SelectTrigger className="mono bg-background/80 text-[12px]">
                  <SelectValue>
                    <span className="truncate">{tzLabel}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {Object.entries(groupedTz).map(([group, zones]) => (
                    <SelectGroup key={group}>
                      <SelectLabel className="mono px-2 py-1 text-[10px] uppercase tracking-widest">
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
            </SidebarModalSection>

            {/* ── Manual Time Override ── */}
            <SidebarModalSection
              title="Manual Time Override"
              bodyClassName="space-y-3"
            >
              {offsetMs !== 0 ? (
                <div className="mono flex items-center gap-2 rounded-sm border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Override active
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-2 rounded-sm border border-border/70 bg-muted/15 p-3">
                <div className="flex flex-col gap-1">
                  <Label className="mono text-[10px] text-muted-foreground">HH</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    placeholder="00"
                    value={overrideHH}
                    onChange={(e) => {
                      setOverrideHH(e.target.value);
                      setOverrideErr("");
                    }}
                    className="mono h-9 w-14 bg-background/90 text-center text-sm"
                  />
                </div>
                <span className="mono mb-2 text-lg font-bold text-muted-foreground">:</span>
                <div className="flex flex-col gap-1">
                  <Label className="mono text-[10px] text-muted-foreground">MM</Label>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="00"
                    value={overrideMM}
                    onChange={(e) => {
                      setOverrideMM(e.target.value);
                      setOverrideErr("");
                    }}
                    className="mono h-9 w-14 bg-background/90 text-center text-sm"
                  />
                </div>
                <span className="mono mb-2 text-lg font-bold text-muted-foreground">:</span>
                <div className="flex flex-col gap-1">
                  <Label className="mono text-[10px] text-muted-foreground">SS</Label>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="00"
                    value={overrideSS}
                    onChange={(e) => {
                      setOverrideSS(e.target.value);
                      setOverrideErr("");
                    }}
                    className="mono h-9 w-14 bg-background/90 text-center text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={applyOverride}
                  className="mono mb-0.5 h-9 text-[10px] uppercase tracking-wider"
                >
                  Apply
                </Button>
              </div>

              {overrideErr ? (
                <p className="mono text-[10px] text-destructive">{overrideErr}</p>
              ) : null}

              {offsetMs !== 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetOverride}
                  className="mono h-8 border-amber-500/40 text-[10px] uppercase tracking-wider text-amber-700 hover:bg-amber-500/10"
                >
                  Reset to System Time
                </Button>
              ) : null}

              <p className="mono text-[10px] leading-snug text-muted-foreground">
                Enter the correct time in the selected timezone. The clock will continue ticking from
                that point.
              </p>
            </SidebarModalSection>
          </SidebarModalBody>
        </div>
      </SidebarModalContent>
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
 * Compact password-reset notice for the sidebar bottom area.
 * Reads the current user from auth context directly so it can be used in any sidebar variant.
 */
function SidebarResetNotice() {
  const { user } = useAuth();
  if (!user?.email) return null;
  const record = getActiveResetNotification(user.email);
  if (!record) return null;
  return (
    <div className="rounded-md border border-amber-400/70 bg-amber-500/25 px-2.5 py-2 flex items-start gap-2 mb-0.5">
      <Info className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="mono text-[9px] font-bold uppercase tracking-wider text-amber-200 leading-none">
          Password Reset
        </p>
        <p className="mono text-[9px] text-amber-100/85 leading-snug mt-1 break-words">
          Reset on {record.displayLine}
        </p>
      </div>
    </div>
  );
}

/**
 * Primary sidebar — support / utility navigation only.
 * Operational modules (Control Center, Visibility, Inventory, Serviceability) are on the homepage.
 */
function PrimaryNavSidebar({
  pathname,
  stamp,
  onClockClick,
}: {
  pathname: string;
  stamp: TzStamp;
  onClockClick: () => void;
}) {
  const { activeModule, openModule } = useSidebarModules();
  const ccModule = useRouterState({
    select: (s) => (s.location.search as { module?: string }).module,
  });
  const importantActive =
    pathname === "/control-center" && ccModule === "important";

  const profileBtnCls = (active: boolean) =>
    `${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap cursor-pointer ${
      active ? "home-sidebar-btn-active" : ""
    }`;

  return (
    <div className="flex flex-col h-full">
      {/* TOP — profile name, then Clock */}
      <div className="px-2 pt-2 pb-1.5 flex flex-col gap-1 shrink-0">
        <SidebarProfileButton
          active={activeModule === "profile"}
          onClick={() => openModule("profile")}
          className={profileBtnCls(activeModule === "profile")}
        />
      </div>
      <div className="home-sidebar-sep shrink-0" />
      <div className="px-2 py-1.5 shrink-0">
        <SidebarClock stamp={stamp} onClockClick={onClockClick} />
      </div>
      <div className="home-sidebar-sep shrink-0" />

      {/* MAIN — utility navigation + satellite banner */}
      <div className="flex-1 flex flex-col min-h-0">
        <nav className="py-2 px-1.5 flex flex-col gap-1 shrink-0 home-sidebar-nav">
          <SidebarModalButton
            label="Satellites"
            icon={Orbit}
            active={activeModule === "satellites"}
            onClick={() => openModule("satellites")}
            iconTheme="satellite"
          />
          <SidebarModalButton
            label="Recent Discussions"
            icon={Megaphone}
            active={activeModule === "discussions"}
            onClick={() => openModule("discussions")}
            iconTheme="discussions"
          />
          <SidebarModalButton
            label="Reports"
            icon={FileText}
            active={activeModule === "reports"}
            onClick={() => openModule("reports")}
            iconTheme="reports"
          />
          <SidebarLink
            to="/control-center"
            search={ccHubSearch("important")}
            label="Important Frequencies"
            icon={Star}
            active={importantActive}
            iconTheme="important"
          />
          <SidebarLink
            to="/discarded"
            label="Discarded Frequencies"
            icon={Trash2}
            active={navActive(pathname, "/discarded")}
            iconTheme="discarded"
          />
        </nav>

        <SidebarSatelliteBanner />

        <div className="flex-1 min-h-0" aria-hidden="true" />
      </div>

      <div className="home-sidebar-sep shrink-0" />
      {/* BOTTOM — Settings, Sign Out */}
      <div className="px-2 pt-1.5 pb-2.5 flex flex-col gap-1.5 shrink-0">
        <SidebarResetNotice />
        <button
          type="button"
          onClick={() => openModule("settings")}
          className={`${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap ${
            activeModule === "settings" ? "home-sidebar-btn-active" : ""
          }`}
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Settings</span>
        </button>
        <button
          type="button"
          onClick={() => void performSignOut()}
          className={`${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap`}
        >
          <Power className="h-3.5 w-3.5 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

function SidebarSatelliteBanner() {
  return (
    <div
      className="relative shrink-0 overflow-hidden mx-1.5 mb-3 mt-1"
      style={{ height: "10.25rem" }}
    >
      <img
        src="/satellite-earth.png"
        alt=""
        aria-hidden="true"
        className="absolute left-1/2 top-[58%] w-[112%] h-[112%] -translate-x-1/2 -translate-y-1/2 object-cover"
        style={{ mixBlendMode: "luminosity", opacity: 0.42 }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, oklch(0.260 0.060 145) 0%, transparent 28%, transparent 72%, oklch(0.250 0.058 145) 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 100% 100% at 50% 55%, transparent 38%, oklch(0.240 0.055 145 / 0.65) 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "oklch(0.265 0.063 145 / 0.28)" }}
      />
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

  const profileBtnCls = (active: boolean) =>
    `${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap cursor-pointer ${
      active ? "home-sidebar-btn-active" : ""
    }`;

  const secondaryIconTheme: Partial<Record<(typeof standardNavItems)[number]["key"], HomeIconTheme>> = {
    units: "inventory",
    satellites: "satellite",
    reports: "reports",
    discarded: "discarded",
    minutes: "discussions",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pt-2 pb-1.5 flex flex-col gap-1 shrink-0">
        <SidebarProfileButton
          active={activeModule === "profile"}
          onClick={() => openModule("profile")}
          className={profileBtnCls(activeModule === "profile")}
        />
      </div>
      <div className="home-sidebar-sep shrink-0" />
      <div className="px-2 py-1.5 shrink-0">
        <SidebarClock stamp={stamp} onClockClick={onClockClick} />
      </div>
      <div className="home-sidebar-sep shrink-0" />

      <nav className="flex-1 py-2 px-1.5 flex flex-col gap-1 min-h-0 home-sidebar-nav">
        {standardNavItems.map((item) => {
          const iconTheme = secondaryIconTheme[item.key];
          if (item.key === "satellites") {
            return (
              <SidebarModalButton
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={activeModule === "satellites"}
                onClick={() => openModule("satellites")}
                iconTheme={iconTheme}
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
                iconTheme={iconTheme}
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
                iconTheme={iconTheme}
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
              iconTheme={iconTheme}
            />
          );
        })}
      </nav>

      <div className="home-sidebar-sep shrink-0" />
      <div className="px-2 pt-1.5 pb-2.5 flex flex-col gap-1.5 shrink-0">
        <SidebarResetNotice />
        <button
          type="button"
          onClick={() => openModule("settings")}
          className={`${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap ${
            activeModule === "settings" ? "home-sidebar-btn-active" : ""
          }`}
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Settings</span>
        </button>
        <button
          type="button"
          onClick={() => void performSignOut()}
          className={`${HOME_SIDEBAR_BTN} mono text-[10px] uppercase tracking-wide whitespace-nowrap`}
        >
          <Power className="h-3.5 w-3.5 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  pageTitle,
  headerIcon,
  headerTitleClassName,
  showBack = false,
  backLink,
  isHome = false,
  hideSidebar = false,
  sidebarVariant = "primary",
  horizontalNav,
  actions,
  /** When true, main becomes a flex column so children can fill remaining viewport height. */
  fillMain = false,
  children,
}: {
  title?: string;
  subtitle?: string;
  /** Page-level title shown under the constant module identity in the header. */
  pageTitle?: string;
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
  fillMain?: boolean;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Timezone selection persists for the session; defaults to IST
  const [selectedTz, setSelectedTz] = useState<string>("Asia/Kolkata");
  const [dtOpen, setDtOpen] = useState(false);
  const [timeOffsetMs, setTimeOffsetMs] = useState<number>(() => {
    try { return Number(localStorage.getItem("ssacc_time_offset") ?? "0") || 0; } catch { return 0; }
  });
  const tzStamp = useLiveTzStamp(selectedTz, timeOffsetMs);

  function handleOffsetChange(ms: number) {
    setTimeOffsetMs(ms);
    try { localStorage.setItem("ssacc_time_offset", String(ms)); } catch { /* noop */ }
  }

  const resolveSecondaryTo = (item: (typeof standardNavItems)[number]) =>
    isAdmin ? item.adminTo : item.userTo;

  return (
    <div className="flex h-screen overflow-hidden text-foreground">
      <aside
        className={`${
          hideSidebar ? "hidden" : "hidden md:flex"
        } shrink-0 flex-col border-r border-border w-56 lg:w-[15.5rem] home-sidebar`}
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
          />
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {isHome ? (
          <header
            className="border-b border-border sticky top-0 z-20 shrink-0 relative overflow-hidden"
            style={{
              backgroundImage: `url(${earthBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center 35%",
            }}
          >
            {/* Warm cream overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(160deg, rgba(242,239,229,0.62) 0%, rgba(234,239,230,0.65) 100%)",
              }}
            />
            <div className="relative z-10 flex items-center justify-center w-full min-h-[4.5rem] sm:min-h-[5rem] px-4 sm:px-8 lg:px-10 py-3 sm:py-4">
              <div className="flex flex-col items-center gap-1">
                <h1
                  className="mono font-bold uppercase text-foreground tracking-[0.13em] leading-none whitespace-nowrap
                             text-[clamp(0.78rem,1.55vw+0.35rem,1.9rem)] max-w-full text-center"
                  style={{ textShadow: "0 1px 6px rgba(255,255,255,0.8)" }}
                >
                  Satellite Signal Analysis and Coordination Center
                </h1>
                <span className="home-title-divider">────────◆──◆──◆────────</span>
              </div>
              {actions && (
                <div className="absolute right-4 sm:right-6 lg:right-8 top-1/2 -translate-y-1/2 shrink-0">
                  {actions}
                </div>
              )}
            </div>
          </header>
        ) : (
          /* ── MODULE HEADER: [back?] | icon + title | home ── */
          <header
            className="border-b border-border sticky top-0 z-20 relative overflow-hidden"
            style={{
              backgroundImage: `url(${earthBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center 28%",
            }}
          >
            {/* Slightly more opaque overlay for functional module pages */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(160deg, rgba(242,239,229,0.60) 0%, rgba(234,239,230,0.62) 100%)",
              }}
            />

            <div className="relative z-10 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 py-2 sm:py-2.5">
              <div className="flex items-center">
                {showBack && (
                  backLink ? (
                    <Link
                      to={backLink.to}
                      search={backLink.search}
                      params={backLink.params}
                      className="mono text-[11px] h-8 px-3 inline-flex items-center uppercase tracking-wider border border-border rounded-sm hover:bg-secondary/50 hover:text-foreground bg-card/70"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.history.back()}
                      className="mono text-[11px] h-8 uppercase tracking-wider bg-card/70"
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                    </Button>
                  )
                )}
              </div>

              <div className="min-w-0 text-center px-2">
                {headerIcon && (
                  <div className="flex justify-center mb-1.5">
                    {headerIcon}
                  </div>
                )}
                <h1
                  className={
                    headerTitleClassName ??
                    "mono text-base sm:text-xl font-bold tracking-[0.10em] uppercase truncate"
                  }
                  style={{ textShadow: "0 1px 4px rgba(255,255,255,0.65)" }}
                >
                  {title ?? "Module"}
                </h1>
                {pageTitle && (
                  <p
                    className="mono text-[10px] sm:text-[11px] font-semibold tracking-[0.14em] uppercase text-foreground/75 truncate mt-0.5"
                    style={{ textShadow: "0 1px 4px rgba(255,255,255,0.65)" }}
                  >
                    {pageTitle}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                {actions}
                <Link
                  to="/"
                  className="mono text-[11px] h-8 px-3 inline-flex items-center uppercase tracking-wider border border-border rounded-sm hover:bg-secondary/50 hover:text-foreground bg-card/70"
                >
                  <Home className="h-3.5 w-3.5 mr-1" /> Home
                </Link>
              </div>
            </div>
          </header>
        )}

        {/* Sidebar is the sole module navigation — no duplicate horizontal strip */}
        {horizontalNav}

        <main
          className={`flex-1 min-h-0 ${
            fillMain
              ? "flex flex-col overflow-hidden p-4 sm:p-6"
              : isHome
                ? "overflow-hidden p-3 sm:p-4 lg:p-5 xl:p-6"
                : "overflow-y-auto overflow-x-hidden p-4 sm:p-6"
          }`}
        >
          {children}
        </main>
      </div>

      {/* Date / Time Control Panel — global, rendered at AppShell level */}
      <DateTimeModal
        open={dtOpen}
        onOpenChange={setDtOpen}
        selectedTz={selectedTz}
        onTzChange={setSelectedTz}
        offsetMs={timeOffsetMs}
        onOffsetChange={handleOffsetChange}
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
