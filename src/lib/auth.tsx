import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import {
  clearMockSession,
  getMockSession,
  MOCK_AUTH_EVENT,
  type MockSession,
} from "@/lib/passwordRecovery";
import { performSignOut } from "@/lib/signOutSession";

export { performSignOut };

export type AppRole = "admin" | "operator" | "viewer";

interface AuthState {
  session: Session | null;
  user: User | null;
  /** Mock session when Supabase sign-in uses recovery override (demo/local) */
  mockSession: MockSession | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  session: null,
  user: null,
  mockSession: null,
  roles: [],
  loading: true,
  signOut: async () => {},
});

function mockUserFromSession(mock: MockSession): User {
  return {
    id: mock.userId,
    email: mock.email,
    app_metadata: {},
    user_metadata: { full_name: mock.email.split("@")[0] },
    aud: "authenticated",
    created_at: new Date(mock.createdAt).toISOString(),
  } as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [mockSession, setMockSession] = useState<MockSession | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  function refreshMockSession() {
    setMockSession(getMockSession());
  }

  useEffect(() => {
    refreshMockSession();

    const onMockAuth = () => refreshMockSession();
    window.addEventListener(MOCK_AUTH_EVENT, onMockAuth);

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) {
        // Only drop mock session on explicit Supabase sign-in — not on INITIAL_SESSION
        // with a stale token, which would silently revoke recovery-override access.
        if (event === "SIGNED_IN") {
          clearMockSession();
          setMockSession(null);
        }
        setTimeout(() => loadRoles(s.user.id), 0);
      } else if (!getMockSession()) {
        setRoles([]);
      } else {
        setRoles(["operator"]);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadRoles(data.session.user.id);
      } else if (getMockSession()) {
        setRoles(["operator"]);
      }
      setLoading(false);
    });
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener(MOCK_AUTH_EVENT, onMockAuth);
    };
  }, []);

  async function loadRoles(uid: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }

  const user = session?.user ?? (mockSession ? mockUserFromSession(mockSession) : null);

  return (
    <AuthCtx.Provider
      value={{
        session,
        user,
        mockSession,
        roles,
        loading,
        signOut: async () => {
          setMockSession(null);
          setSession(null);
          setRoles([]);
          await performSignOut();
        },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}

export function useCanEdit() {
  const { roles } = useAuth();
  return roles.includes("admin") || roles.includes("operator");
}

export function useIsAdmin() {
  const { roles } = useAuth();
  return roles.includes("admin");
}