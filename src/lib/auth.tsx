import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getMockSession,
  MOCK_AUTH_EVENT,
  type MockSession,
} from "@/lib/passwordRecovery";
import { performSignOut } from "@/lib/signOutSession";
import {
  getRolesForEmail,
  USER_ACCOUNT_EVENT,
  type AppRole,
} from "@/lib/userAccountStore";

export { performSignOut };
export type { AppRole };

export type AuthUser = {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: { full_name?: string };
  aud: string;
  created_at: string;
};

interface AuthState {
  user: AuthUser | null;
  /** Active local session (ssacc_mock_session). */
  mockSession: MockSession | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  mockSession: null,
  roles: [],
  loading: true,
  signOut: async () => {},
});

function userFromLocalSession(session: MockSession): AuthUser {
  return {
    id: session.userId,
    email: session.email,
    app_metadata: {},
    user_metadata: { full_name: session.email.split("@")[0] },
    aud: "authenticated",
    created_at: new Date(session.createdAt).toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mockSession, setMockSession] = useState<MockSession | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function syncAuthState() {
      const local = getMockSession();
      setMockSession(local);
      setRoles(local ? getRolesForEmail(local.email) : []);
      setLoading(false);
    }

    syncAuthState();

    window.addEventListener(MOCK_AUTH_EVENT, syncAuthState);
    window.addEventListener(USER_ACCOUNT_EVENT, syncAuthState);

    return () => {
      window.removeEventListener(MOCK_AUTH_EVENT, syncAuthState);
      window.removeEventListener(USER_ACCOUNT_EVENT, syncAuthState);
    };
  }, []);

  const user = mockSession ? userFromLocalSession(mockSession) : null;

  return (
    <AuthCtx.Provider
      value={{
        user,
        mockSession,
        roles,
        loading,
        signOut: async () => {
          setMockSession(null);
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
