import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMockSession } from "@/lib/passwordRecovery";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Use getSession() (reads localStorage, no network) instead of getUser()
    // because the preview fetch proxy intermittently blocks /auth/v1/user,
    // which would otherwise bounce signed-in users back to /auth.
    const { data } = await supabase.auth.getSession();
    const mock = getMockSession();
    if (!data.session?.user && !mock) throw redirect({ to: "/auth" });
    return { user: data.session?.user ?? { id: mock!.userId, email: mock!.email } };
  },
  component: () => <Outlet />,
});