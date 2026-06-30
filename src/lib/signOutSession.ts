import { clearMockSession } from "@/lib/passwordRecovery";

/** Remove legacy Supabase auth keys from older sessions. */
function clearLegacySupabaseAuthStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("sb-") && key.includes("auth")) {
      localStorage.removeItem(key);
    }
  }
}

/** Terminate local session and redirect to login. */
export async function performSignOut(): Promise<void> {
  clearMockSession();
  clearLegacySupabaseAuthStorage();
  window.location.replace("/auth");
}
