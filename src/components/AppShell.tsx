import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Boxes,
  Radar,
  ListOrdered,
  Activity,
  Archive,
  Shield,
  Power,
  ArrowLeft,
  Satellite,
  Users,
  Settings,
  Star,
} from "lucide-react";
import { useAuth, useIsAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

const navItems = [
  { to: "/", label: "Command", icon: Home, exact: true },
  { to: "/inventory", label: "Resource Inventory", icon: Boxes },
  { to: "/visibility", label: "Visibility Metrics", icon: Radar },
  { to: "/priority", label: "Priority & Allocation", icon: ListOrdered },
  { to: "/engagement", label: "Engagement Status", icon: Activity },
  { to: "/intel", label: "INT Repository", icon: Archive },
  { to: "/important", label: "Important Frequencies", icon: Star },
  { to: "/serviceability", label: "Serviceability State", icon: Shield },
];

const adminItems = [
  { to: "/admin/units", label: "Units", icon: Users },
  { to: "/admin/satellites", label: "Satellites", icon: Satellite },
  { to: "/admin/users", label: "User Roles", icon: Settings },
];

export function AppShell({
  title,
  subtitle,
  showBack = false,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, roles, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const primaryRole = roles[0] ?? "viewer";
  const now = new Date();
  const stamp = now.toISOString().replace("T", " ").slice(0, 19) + "Z";

  return (
    <div className="flex min-h-screen text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="px-4 py-4 border-b border-border">
          <div className="label-eyebrow">SSACC // v1.0</div>
          <div className="mono text-sm font-bold tracking-tight mt-1">SATELLITE SIGNAL</div>
          <div className="mono text-[11px] text-muted-foreground">ANALYSIS &amp; COORDINATION CTR</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          <div className="px-3 label-eyebrow mb-2">Operations</div>
          <ul className="space-y-0.5 px-2">
            {navItems.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={`flex items-center gap-2.5 px-3 py-2 mono text-[12px] uppercase tracking-wider rounded-sm border-l-2 ${
                      active
                        ? "bg-secondary text-primary border-primary"
                        : "border-transparent text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          {isAdmin && (
            <>
              <div className="px-3 label-eyebrow mt-5 mb-2">Administration</div>
              <ul className="space-y-0.5 px-2">
                {adminItems.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={`flex items-center gap-2.5 px-3 py-2 mono text-[12px] uppercase tracking-wider rounded-sm border-l-2 ${
                          active
                            ? "bg-secondary text-primary border-primary"
                            : "border-transparent text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
                        }`}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>
        <div className="border-t border-border px-3 py-3 text-[11px] mono text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="truncate" title={user?.email ?? ""}>
              {user?.email ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="uppercase">{primaryRole}</span>
            <button
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <Power className="h-3 w-3" /> SIGN OUT
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
            {showBack && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.history.back()}
                className="mono text-[11px] h-8 uppercase tracking-wider"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            )}
            <Link
              to="/"
              className="mono text-[11px] h-8 px-3 inline-flex items-center uppercase tracking-wider border border-border rounded-sm hover:border-primary hover:text-primary"
            >
              <Home className="h-3.5 w-3.5 mr-1" /> Home
            </Link>
            <div className="min-w-0 flex-1">
              <div className="label-eyebrow">{subtitle ?? "Module"}</div>
              <h1 className="mono text-base sm:text-lg font-bold tracking-tight uppercase truncate">
                {title}
              </h1>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-0.5 text-[11px] mono text-muted-foreground">
              <span className="text-primary">● LINK OK</span>
              <span>{stamp}</span>
            </div>
            {actions}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 overflow-x-auto">{children}</main>
      </div>
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