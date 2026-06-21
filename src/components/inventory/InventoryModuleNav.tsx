import { Link } from "@tanstack/react-router";
import { Clock, FileText, Landmark, Satellite, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { useIsAdmin } from "@/lib/auth";

const navItems = [
  { key: "units",     label: "Units",                icon: Landmark, adminTo: "/admin/units",      userTo: "/admin/units" },
  { key: "sats",      label: "Satellites",           icon: Satellite, adminTo: "/admin/satellites", userTo: "/admin/satellites" },
  { key: "reports",   label: "Reports and Returns",  icon: FileText,  adminTo: "/reports",           userTo: "/reports" },
  { key: "minutes",   label: "Recent Discussions",   icon: Clock,     adminTo: "/minutes",           userTo: "/minutes" },
] as const;

export function InventoryModuleNav() {
  const isAdmin = useIsAdmin();
  const [mode, setMode] = useState<"admin" | "user">("user");

  const resolveTo = (item: (typeof navItems)[number]) =>
    mode === "admin" && isAdmin ? item.adminTo : item.userTo;

  const itemCls = "flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[12px] rounded-sm transition-colors text-muted-foreground hover:bg-secondary/50 hover:text-foreground";

  return (
    <nav className="border-b border-border bg-sidebar">
      <div className="flex items-stretch w-full px-2 sm:px-3">
        {/* Admin/User toggle — equal share */}
        <button
          type="button"
          onClick={() => setMode((m) => (m === "admin" ? "user" : "admin"))}
          disabled={!isAdmin}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[12px] rounded-sm transition-colors ${
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

        {navItems.map((item) => (
          <Link
            key={item.key}
            to={resolveTo(item)}
            className={itemCls}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
