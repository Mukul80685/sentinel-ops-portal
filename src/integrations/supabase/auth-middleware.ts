import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/** Validates local session headers set by attachLocalAuth (no Supabase). */
export const requireLocalAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();

    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const userId = request.headers.get("x-local-user-id");
    const email = request.headers.get("x-local-user-email");

    if (!userId || !email) {
      throw new Error("Unauthorized: No local session provided");
    }

    return next({
      context: {
        userId,
        email,
      },
    });
  },
);

/** @deprecated Use requireLocalAuth — kept for imports not yet migrated. */
export const requireSupabaseAuth = requireLocalAuth;
