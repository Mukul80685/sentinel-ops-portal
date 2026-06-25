import { supabase } from "@/integrations/supabase/client";
import { clearMockSession } from "@/lib/passwordRecovery";

/** Remove Supabase persisted session keys when SDK sign-out is slow or unavailable. */
function clearSupabaseAuthStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("sb-") && key.includes("auth")) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Terminate session and redirect to login.
 * Uses local-only Supabase sign-out (no network) — preview proxies often block /auth/v1/logout.
 */
export async function performSignOut(): Promise<void> {
  clearMockSession();
  clearSupabaseAuthStorage();

  try {
    await Promise.race([
      supabase.auth.signOut({ scope: "local" }),
      new Promise<void>((resolve) => setTimeout(resolve, 750)),
    ]);
  } catch {
    // Continue — local storage already cleared above.
  }

  clearSupabaseAuthStorage();
  window.location.replace("/auth");
}
