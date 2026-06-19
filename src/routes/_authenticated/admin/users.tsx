import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/auth";
import { toast } from "sonner";

const ROLES = ["admin", "operator", "viewer"] as const;

export const Route = createFileRoute("/_authenticated/admin/users")({ component: UsersAdmin });

function UsersAdmin() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
      ]);
      const roleMap: Record<string, string[]> = {};
      (roles.data ?? []).forEach((r: any) => { (roleMap[r.user_id] ??= []).push(r.role); });
      return (profiles.data ?? []).map((p: any) => ({ ...p, roles: roleMap[p.id] ?? [] }));
    },
  });

  if (!isAdmin) return <AppShell title="User Roles" subtitle="Admin" showBack><div className="panel p-6 mono text-muted-foreground">Admin access required.</div></AppShell>;

  async function toggleRole(userId: string, role: string, has: boolean) {
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["users-with-roles"] });
  }

  return (
    <AppShell title="User Roles" subtitle="Administration" showBack>
      <div className="panel overflow-auto">
        <table className="min-w-full text-sm mono">
          <thead className="bg-secondary"><tr>{["Operator","Email","Admin","Operator","Viewer"].map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider border-r border-border">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((u: any) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-3 py-2 font-bold">{u.full_name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                {ROLES.map((r) => {
                  const has = u.roles.includes(r);
                  return (
                    <td key={r} className="px-3 py-2">
                      <button onClick={() => toggleRole(u.id, r, has)} className={`px-2 py-1 rounded-sm text-[11px] uppercase tracking-wider border ${has ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                        {has ? "Granted" : "Grant"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] mono text-muted-foreground mt-3">First registered account is auto-granted ADMIN. Operators can edit data; Viewers are read-only.</p>
    </AppShell>
  );
}