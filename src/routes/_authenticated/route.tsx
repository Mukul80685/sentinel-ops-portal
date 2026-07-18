import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMockSession } from "@/lib/passwordRecovery";
import { OperationalStoreGate } from "@/components/OperationalStoreGate";
import { OperationalDerivedRevisionProvider } from "@/hooks/OperationalDerivedRevisionContext";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    const session = getMockSession();
    if (!session) throw redirect({ to: "/auth" });
    return { user: { id: session.userId, email: session.email } };
  },
  component: () => (
    <OperationalDerivedRevisionProvider>
      <OperationalStoreGate />
      <Outlet />
    </OperationalDerivedRevisionProvider>
  ),
});
