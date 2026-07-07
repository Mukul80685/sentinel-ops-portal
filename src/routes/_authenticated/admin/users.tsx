import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useIsAdmin } from "@/lib/auth";
import type { RecoveryUserProfile } from "@/lib/passwordRecovery";
import {
  formatAuthorizedUserLabel,
  findAuthorizedUserByArmyNumber,
  getAuthorizedUsers,
  updateAuthorizedUserRole,
  type AppRole,
} from "@/lib/userAccountStore";
import { toast } from "sonner";

const ROLES = ["admin", "operator", "viewer"] as const;

type LocalUserRow = {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
};

function loadStoredRecoveryProfiles(): Record<string, RecoveryUserProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("ssacc_recovery_profiles");
    return raw ? (JSON.parse(raw) as Record<string, RecoveryUserProfile>) : {};
  } catch {
    return {};
  }
}

function loadLocalUsersWithRoles(): LocalUserRow[] {
  const byEmail = new Map<string, LocalUserRow>();

  for (const user of getAuthorizedUsers()) {
    if (!user.email.trim()) continue;
    byEmail.set(user.email.trim().toLowerCase(), {
      id: user.id,
      email: user.email.trim(),
      displayName: formatAuthorizedUserLabel(user),
      role: user.role,
    });
  }

  for (const profile of Object.values(loadStoredRecoveryProfiles())) {
    const email = profile.accountKey.trim();
    const key = email.toLowerCase();
    if (!email || byEmail.has(key)) continue;

    const authorized = findAuthorizedUserByArmyNumber(profile.serviceNumber);
    byEmail.set(key, {
      id: profile.userId,
      email,
      displayName: authorized ? formatAuthorizedUserLabel(authorized) : profile.userId,
      role: authorized?.role ?? "viewer",
    });
  }

  return Array.from(byEmail.values()).sort((a, b) => a.email.localeCompare(b.email));
}

export const Route = createFileRoute("/_authenticated/admin/users")({ component: UsersAdmin });

function UsersAdmin() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: () => loadLocalUsersWithRoles(),
  });

  if (!isAdmin)
    return (
      <AppShell title="User Roles" subtitle="Admin" showBack>
        <div className="panel p-6 mono text-muted-foreground">Admin access required.</div>
      </AppShell>
    );

  function toggleRole(email: string, role: AppRole, isActive: boolean) {
    updateAuthorizedUserRole(email, isActive ? "viewer" : role);
    qc.invalidateQueries({ queryKey: ["users-with-roles"] });
    toast.success(isActive ? `Role set to viewer for ${email}` : `${role} granted for ${email}`);
  }

  return (
    <AppShell title="User Roles" subtitle="Administration" showBack>
      <div className="panel overflow-auto">
        <table className="min-w-full text-sm mono">
          <thead className="bg-secondary text-secondary-foreground">
            <tr>
              {["Name", "Email", "Admin", "Operator", "Viewer"].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 text-[11px] uppercase tracking-wider border-r border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.email} className="border-t border-border">
                <td className="px-3 py-2 font-bold">{u.displayName}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                {ROLES.map((r) => {
                  const isActive = u.role === r;
                  return (
                    <td key={r} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleRole(u.email, r, isActive)}
                        className={`px-2 py-1 rounded-sm text-[11px] uppercase tracking-wider border ${isActive ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                      >
                        {isActive ? "Granted" : "Grant"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] mono text-muted-foreground mt-3">
        First registered account is auto-granted ADMIN. Operators can edit data; Viewers are read-only.
      </p>
    </AppShell>
  );
}
