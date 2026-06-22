import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Boxes,
  Radar,
  ListOrdered,
  Activity,
  Archive,
  Shield,
  ShieldCheck,
  Power,
  ArrowLeft,
  Satellite,
  Landmark,
  LayoutDashboard,
  Settings,
  User,
  FileText,
  Clock,
  Star,
} from "lucide-react";
import { useAuth, useIsAdmin } from "@/lib/auth";
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

const moduleNavItems = [
  { to: "/control-center", label: "Control Center",                    icon: LayoutDashboard },
  { to: "/engagement",     label: "Engagement Status",                 icon: Activity },
  { to: "/intel",          label: "INT Repository",                    icon: Archive },
  { to: "/visibility",     label: "Satellite Visibility Metrics",      icon: Radar },
  { to: "/priority",       label: "Satellite Priority and Allocation", icon: ListOrdered },
  { to: "/inventory",      label: "Resource Inventory",                icon: Boxes },
  { to: "/serviceability", label: "Serviceability State",              icon: Shield },
  { to: "/important",      label: "Important Frequencies",             icon: Star },
] as const;

const standardNavItems = [
  { key: "units",      label: "Units",               icon: Landmark,  adminTo: "/admin/units",      userTo: "/inventory" },
  { key: "satellites", label: "Satellites",          icon: Satellite, adminTo: "/admin/satellites", userTo: "/visibility" },
  { key: "reports",    label: "Reports and Returns", icon: FileText,  adminTo: "/reports",           userTo: "/reports" },
  { key: "minutes",    label: "Recent Discussions",  icon: Clock,     adminTo: "/minutes",           userTo: "/minutes" },
] as const;

// ─── Timezone registry (IANA) ─────────────────────────────────────────────────

export const TIMEZONES = [
  { group: "India",          label: "Indian Standard Time (IST) — New Delhi / Kolkata", iana: "Asia/Kolkata" },
  { group: "China",          label: "China Standard Time (CST)",                         iana: "Asia/Shanghai" },
  { group: "Pakistan",       label: "Pakistan Standard Time (PKT)",                      iana: "Asia/Karachi" },
  { group: "Bangladesh",     label: "Bangladesh Standard Time (BST)",                    iana: "Asia/Dhaka" },
  { group: "Russia",         label: "Moscow Time",                                       iana: "Europe/Moscow" },
  { group: "Russia",         label: "Vladivostok Time",                                  iana: "Asia/Vladivostok" },
  { group: "Russia",         label: "Yekaterinburg Time",                                iana: "Asia/Yekaterinburg" },
  { group: "Europe",         label: "Greenwich Mean Time (GMT / UK)",                    iana: "Europe/London" },
  { group: "Europe",         label: "Central European Time (CET)",                       iana: "Europe/Paris" },
  { group: "Europe",         label: "Eastern European Time (EET)",                       iana: "Europe/Helsinki" },
  { group: "Middle East",    label: "Gulf Standard Time (GST)",                          iana: "Asia/Dubai" },
  { group: "Middle East",    label: "Arabia Standard Time (AST)",                        iana: "Asia/Riyadh" },
  { group: "Turkey",         label: "Turkey Time (TRT)",                                 iana: "Europe/Istanbul" },
  { group: "Southeast Asia", label: "Thailand Time (THA)",                               iana: "Asia/Bangkok" },
  { group: "Southeast Asia", label: "Vietnam Time (ICT)",                                iana: "Asia/Ho_Chi_Minh" },
  { group: "Southeast Asia", label: "Singapore Time (SGT)",                              iana: "Asia/Singapore" },
  { group: "Southeast Asia", label: "Malaysia Time (MYT)",                               iana: "Asia/Kuala_Lumpur" },
  { group: "Southeast Asia", label: "Philippines Time (PHT)",                            iana: "Asia/Manila" },
  { group: "USA",            label: "Eastern Time (ET)",                                 iana: "America/New_York" },
  { group: "USA",            label: "Central Time (CT)",                                 iana: "America/Chicago" },
  { group: "USA",            label: "Mountain Time (MT)",                                iana: "America/Denver" },
  { group: "USA",            label: "Pacific Time (PT)",                                 iana: "America/Los_Angeles" },
] as const;

export type IanaTimezone = typeof TIMEZONES[number]["iana"];

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
      const time = now.toLocaleTimeString("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const date = now.toLocaleDateString("en-GB", {
        timeZone: tz,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      return { time, date, full: `${date} · ${time}` };
    };
    setStamp(fmt());
    const id = setInterval(() => setStamp(fmt()), 1000);
    return () => clearInterval(id);
  }, [tz]);
  return stamp;
}

function navActive(pathname: string, to: string, exact?: boolean) {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

/** Shared style for Settings + Sign Out — identical font/size/weight */
const secondaryCtrlCls =
  "flex w-full items-center gap-2 px-2 py-1.5 mono text-[11px] uppercase tracking-wider text-muted-foreground rounded-sm hover:bg-secondary/50 hover:text-foreground transition-colors";

function SidebarLink({
  to,
  label,
  icon: Icon,
  active,
  bold = false,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  bold?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-2 py-1.5 mono text-[11px] uppercase tracking-wider rounded-sm transition-colors leading-snug ${
        bold ? "font-bold" : ""
      } ${
        active
          ? "bg-secondary text-foreground"
          : "text-sidebar-foreground hover:bg-secondary/50 hover:text-foreground"
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </Link>
  );
}

/** SSACC insignia — precision space-operations badge */
function SsaccLogo() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-foreground shrink-0"
    >
      {/* Outer precision ring */}
      <circle cx="40" cy="40" r="37" stroke="currentColor" strokeWidth="1.8" />
      {/* Inner dashed ring */}
      <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.45" />

      {/* Earth globe — filled disc with continental suggestion */}
      <circle cx="40" cy="40" r="14" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.08" />
      {/* Globe equatorial band */}
      <ellipse cx="40" cy="40" rx="14" ry="5.5" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
      {/* Globe meridian */}
      <line x1="40" y1="26" x2="40" y2="54" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />

      {/* Main orbital ellipse — tilted 20° */}
      <ellipse cx="40" cy="40" rx="27" ry="10.5" stroke="currentColor" strokeWidth="1.6" transform="rotate(-20 40 40)" />

      {/* Satellite body (upper-right on orbit, at ~–20+70° = 50° CCW from top) */}
      <rect x="59" y="11" width="10" height="7" rx="1.2" fill="currentColor" />
      {/* Left solar panel */}
      <rect x="49" y="12.5" width="10" height="4" rx="0.6" fill="currentColor" opacity="0.72" />
      {/* Right solar panel */}
      <rect x="69" y="12.5" width="10" height="4" rx="0.6" fill="currentColor" opacity="0.72" />
      {/* Satellite nadir antenna dot */}
      <circle cx="64" cy="18.5" r="1.2" fill="currentColor" opacity="0.5" />

      {/* Signal beams — satellite to Earth (2 dashed lines) */}
      <line x1="62" y1="19" x2="50" y2="33" stroke="currentColor" strokeWidth="0.9" strokeDasharray="2 2.5" opacity="0.5" />
      <line x1="66" y1="21" x2="53" y2="37" stroke="currentColor" strokeWidth="0.65" strokeDasharray="1.5 3" opacity="0.35" />

      {/* Ground station */}
      <path d="M 24 65 Q 40 54 56 65" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="40" y1="65" x2="40" y2="74" stroke="currentColor" strokeWidth="1.6" />
      <line x1="33" y1="74" x2="47" y2="74" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />

      {/* Cardinal tick marks — precision compass feel */}
      <line x1="40" y1="2"  x2="40" y2="6"  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="40" y1="74" x2="40" y2="78" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="2"  y1="40" x2="6"  y2="40" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="74" y1="40" x2="78" y2="40" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Standard horizontal navigation bar — rendered automatically on all module pages
 * unless a custom horizontalNav is passed to AppShell.
 */
function StandardModuleNav() {
  const isAdmin = useIsAdmin();
  const [mode, setMode] = useState<"admin" | "user">("user");
  const resolveTo = (item: (typeof standardNavItems)[number]) =>
    mode === "admin" && isAdmin ? item.adminTo : item.userTo;

  return (
    <nav className="border-b border-border bg-sidebar">
      <div className="flex items-center overflow-x-auto px-4 sm:px-5 py-1.5 gap-0.5 min-w-0">
        <button
          type="button"
          onClick={() => setMode((m) => (m === "admin" ? "user" : "admin"))}
          disabled={!isAdmin}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-sm whitespace-nowrap shrink-0 transition-colors ${
            mode === "admin" && isAdmin
              ? "bg-secondary text-foreground font-medium"
              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          } ${!isAdmin ? "opacity-70 cursor-default" : "cursor-pointer"}`}
        >
          {mode === "admin" && isAdmin ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <User className="h-3.5 w-3.5" />
          )}
          {mode === "admin" && isAdmin ? "Admin" : "User"}
        </button>

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

function HomeSidebar({
  mode,
  setMode,
  isAdmin,
  signOut,
  pathname,
  resolveSecondaryTo,
  stamp,
  onClockClick,
}: {
  mode: "admin" | "user";
  setMode: (fn: (m: "admin" | "user") => "admin" | "user") => void;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  pathname: string;
  resolveSecondaryTo: (item: (typeof standardNavItems)[number]) => string;
  stamp: string;
  onClockClick: () => void;
}) {
  return (
    <div className="flex flex-col">
      {/* ── A. USER SECTION: toggle + live clock ── */}
      <div className="px-2 pt-2 pb-1.5 border-b border-border">
        <button
          type="button"
          onClick={() => setMode((m) => (m === "admin" ? "user" : "admin"))}
          disabled={!isAdmin}
          className={`flex w-full items-center gap-2 px-2 py-1.5 mono text-[11px] uppercase tracking-wider rounded-sm transition-colors ${
            mode === "admin" && isAdmin
              ? "bg-secondary text-foreground"
              : "text-sidebar-foreground hover:bg-secondary/50"
          } ${!isAdmin ? "opacity-70 cursor-default" : "cursor-pointer"}`}
          title={isAdmin ? "Toggle admin / user mode" : "User mode"}
        >
          {mode === "admin" && isAdmin ? (
            <ShieldCheck className="h-3 w-3 shrink-0" />
          ) : (
            <User className="h-3 w-3 shrink-0" />
          )}
          <span>{mode === "admin" && isAdmin ? "Admin" : "User"}</span>
        </button>
        {/* Clock directly under User — clickable to open DateTime panel */}
        <button
          type="button"
          onClick={onClockClick}
          title="Open Date / Time Control Panel"
          className="w-full text-left px-2 pt-1 mono text-[10px] text-muted-foreground leading-snug hover:text-foreground transition-colors rounded-sm"
        >
          {stamp || "\u00A0"}
        </button>
      </div>

      {/* ── B. MAIN NAVIGATION ── */}
      <nav className="py-1.5">
        <ul className="space-y-0.5 px-1.5">
          {standardNavItems.map((item) => {
            const to = resolveSecondaryTo(item);
            return (
              <li key={item.key}>
                <SidebarLink
                  to={to}
                  label={item.label}
                  icon={item.icon}
                  active={navActive(pathname, to)}
                />
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── C. SYSTEM CONTROLS: Settings + Sign Out ── */}
      <div className="border-t border-border px-2 py-1.5 space-y-0.5">
        <Link
          to={isAdmin ? "/admin/users" : "/"}
          className={secondaryCtrlCls}
          title="Settings"
        >
          <Settings className="h-3 w-3 shrink-0" />
          Settings
        </Link>
        <button type="button" onClick={() => signOut()} className={secondaryCtrlCls}>
          <Power className="h-3 w-3 shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

/**
 * Module sidebar — used by most module pages.
 * Shows: module links (other than current) → clock → Settings → Sign Out
 */
function ModuleSidebar({
  isAdmin,
  signOut,
  pathname,
  stamp,
  onClockClick,
}: {
  isAdmin: boolean;
  signOut: () => Promise<void>;
  pathname: string;
  stamp: string;
  onClockClick: () => void;
}) {
  const visibleModuleItems = moduleNavItems.filter(
    (item) => !navActive(pathname, item.to),
  );

  return (
    <>
      {/* Module nav — natural height, no flex-1 gap */}
      <nav className="py-2">
        <ul className="space-y-0.5 px-1.5">
          {visibleModuleItems.map((item) => (
            <li key={item.to}>
              <SidebarLink
                to={item.to}
                label={item.label}
                icon={item.icon}
                active={false}
                bold
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Settings + Sign Out + Clock — compact cluster, no spacer */}
      <div className="border-t border-border px-2 pt-1.5 pb-1.5 space-y-0.5">
        <Link
          to={isAdmin ? "/admin/users" : "/"}
          className={secondaryCtrlCls}
          title="Settings"
        >
          <Settings className="h-3 w-3 shrink-0" />
          Settings
        </Link>
        <button type="button" onClick={() => signOut()} className={secondaryCtrlCls}>
          <Power className="h-3 w-3 shrink-0" />
          Sign Out
        </button>
        <button
          type="button"
          onClick={onClockClick}
          title="Open Date / Time Control Panel"
          className="w-full text-left px-2 pt-1 mono text-[10px] text-muted-foreground leading-snug hover:text-foreground transition-colors rounded-sm"
        >
          {stamp || "\u00A0"}
        </button>
      </div>
    </>
  );
}

/**
 * Secondary sidebar — used by the Resource Inventory module.
 * Layout: User/nav items evenly distributed (flex-1) → Settings → Clock + Sign Out (pinned bottom).
 */
function SecondarySidebar({
  mode,
  setMode,
  isAdmin,
  signOut,
  pathname,
  resolveSecondaryTo,
  stamp,
  onClockClick,
}: {
  mode: "admin" | "user";
  setMode: (fn: (m: "admin" | "user") => "admin" | "user") => void;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  pathname: string;
  resolveSecondaryTo: (item: (typeof standardNavItems)[number]) => string;
  stamp: string;
  onClockClick: () => void;
}) {
  return (
    <>
      {/* TOP — User toggle + 4 nav items, evenly distributed vertically */}
      <nav className="flex-1 flex flex-col justify-between px-1.5 py-3">
        <button
          type="button"
          onClick={() => setMode((m) => (m === "admin" ? "user" : "admin"))}
          disabled={!isAdmin}
          className={`flex w-full items-center gap-2 px-2 py-1.5 mono text-[11px] uppercase tracking-wider rounded-sm transition-colors ${
            mode === "admin" && isAdmin
              ? "bg-secondary text-foreground font-bold"
              : "text-sidebar-foreground hover:bg-secondary/50"
          } ${!isAdmin ? "opacity-70 cursor-default" : "cursor-pointer"}`}
          title={isAdmin ? "Toggle admin / user mode" : "User mode"}
        >
          {mode === "admin" && isAdmin ? (
            <ShieldCheck className="h-3 w-3 shrink-0" />
          ) : (
            <User className="h-3 w-3 shrink-0" />
          )}
          <span>{mode === "admin" && isAdmin ? "Admin" : "User"}</span>
        </button>

        {standardNavItems.map((item) => {
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

      {/* MIDDLE — Settings */}
      <div className="border-t border-border px-2 py-1.5">
        <Link
          to={isAdmin ? "/admin/users" : "/"}
          className={secondaryCtrlCls}
          title="Settings"
        >
          <Settings className="h-3 w-3 shrink-0" />
          Settings
        </Link>
      </div>

      {/* BOTTOM — Clock (live) + Sign Out */}
      <div className="border-t border-border px-2 py-1.5 space-y-0.5">
        <button
          type="button"
          onClick={onClockClick}
          title="Open Date / Time Control Panel"
          className="w-full text-left px-2 py-1 mono text-[10px] text-muted-foreground leading-snug hover:text-foreground transition-colors rounded-sm"
        >
          {stamp || "\u00A0"}
        </button>
        <button type="button" onClick={() => signOut()} className={secondaryCtrlCls}>
          <Power className="h-3 w-3 shrink-0" />
          Sign Out
        </button>
      </div>
    </>
  );
}

export function AppShell({
  title,
  subtitle,
  headerIcon,
  showBack = false,
  isHome = false,
  hideSidebar = false,
  sidebarVariant = "modules",
  horizontalNav,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  headerIcon?: ReactNode;
  showBack?: boolean;
  isHome?: boolean;
  hideSidebar?: boolean;
  /** "modules" = show other-module links (default). "secondary" = show nav items (User/Units/…) */
  sidebarVariant?: "modules" | "secondary";
  horizontalNav?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Timezone selection persists for the session; defaults to IST
  const [selectedTz, setSelectedTz] = useState<string>("Asia/Kolkata");
  const [dtOpen, setDtOpen] = useState(false);
  const tzStamp = useLiveTzStamp(selectedTz);
  const stamp = tzStamp.full;

  const [mode, setMode] = useState<"admin" | "user">("user");

  const resolveSecondaryTo = (item: (typeof standardNavItems)[number]) =>
    mode === "admin" && isAdmin ? item.adminTo : item.userTo;

  return (
    <div className="flex h-screen overflow-hidden text-foreground">
      <aside
        className={`${hideSidebar ? "hidden" : "hidden md:flex"} shrink-0 flex-col border-r border-border bg-sidebar ${
          isHome ? "w-44" : "w-48"
        }`}
      >
        {isHome ? (
          <HomeSidebar
            mode={mode}
            setMode={setMode}
            isAdmin={isAdmin}
            signOut={signOut}
            pathname={pathname}
            resolveSecondaryTo={resolveSecondaryTo}
            stamp={stamp}
            onClockClick={() => setDtOpen(true)}
          />
        ) : sidebarVariant === "secondary" ? (
          <SecondarySidebar
            mode={mode}
            setMode={setMode}
            isAdmin={isAdmin}
            signOut={signOut}
            pathname={pathname}
            resolveSecondaryTo={resolveSecondaryTo}
            stamp={stamp}
            onClockClick={() => setDtOpen(true)}
          />
        ) : (
          <ModuleSidebar
            isAdmin={isAdmin}
            signOut={signOut}
            pathname={pathname}
            stamp={stamp}
            onClockClick={() => setDtOpen(true)}
          />
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {isHome ? (
          /* ── HOME HEADER: Logo+SSACC | 3-line title | Settings+Sign Out ── */
          <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-20">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 py-2">
              {/* LEFT: Logo + wordmark */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <SsaccLogo />
                <span className="mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  SSACC
                </span>
              </div>

              {/* CENTER: 3-line title — full-width visual identity */}
              <div className="text-center select-none py-0.5">
                <div className="mono font-bold tracking-widest uppercase text-foreground text-sm sm:text-base underline decoration-2 underline-offset-4 leading-snug">
                  Satellite Signal Analysis
                </div>
                <div className="mono font-semibold text-muted-foreground text-[13px] leading-none py-1">
                  &amp;
                </div>
                <div className="mono font-bold tracking-widest uppercase text-foreground text-sm sm:text-base underline decoration-2 underline-offset-4 leading-snug">
                  Coordination Center
                </div>
              </div>

              {/* RIGHT: actions slot (empty by default on homepage) */}
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                {actions}
              </div>
            </div>
          </header>
        ) : (
          /* ── MODULE HEADER: back | title | home ── */
          <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 py-3">
              <div className="flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.history.back()}
                  className="mono text-[11px] h-8 uppercase tracking-wider"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
              </div>

              <div className="min-w-0 text-center px-2">
                <div className="label-eyebrow">SSACC</div>
                {headerIcon ? (
                  <div className="flex items-center justify-center gap-2 mt-0.5">
                    {headerIcon}
                    <h1 className="mono text-base sm:text-lg font-bold tracking-tight uppercase truncate">
                      {title ?? "Module"}
                    </h1>
                  </div>
                ) : (
                  <h1 className="mono text-base sm:text-lg font-bold tracking-tight uppercase truncate">
                    {title ?? "Module"}
                  </h1>
                )}
                {subtitle && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
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

        {/* Horizontal nav: custom override OR auto standard nav for all module pages */}
        {horizontalNav ?? (!isHome && <StandardModuleNav />)}

        <main className={`flex-1 overflow-y-auto overflow-x-hidden ${isHome ? "p-3 sm:p-4" : "p-4 sm:p-6"}`}>{children}</main>
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
