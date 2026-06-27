import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMockSession } from "@/lib/passwordRecovery";
import { OperationalStoreGate } from "@/components/OperationalStoreGate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Mock session first — synchronous read, no Supabase init delay.
    const mock = getMockSession();
    if (mock) {
      return { user: { id: mock.userId, email: mock.email } };
    }

    // Use getSession() (reads localStorage, no network) instead of getUser()
    // because the preview fetch proxy intermittently blocks /auth/v1/user,
    // which would otherwise bounce signed-in users back to /auth.
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: () => (
    <>
      <OperationalStoreGate />
      <Outlet />
    </>
  ),
});