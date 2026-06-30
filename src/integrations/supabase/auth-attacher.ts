import { createMiddleware } from "@tanstack/react-start";
import { getMockSession } from "@/lib/passwordRecovery";

/** Attach local session context to server function RPCs (no Supabase). */
export const attachLocalAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const session = getMockSession();
    if (!session) return next();

    return next({
      headers: {
        "X-Local-User-Email": session.email,
        "X-Local-User-Id": session.userId,
      },
    });
  },
);

/** @deprecated Use attachLocalAuth — kept for imports not yet migrated. */
export const attachSupabaseAuth = attachLocalAuth;
