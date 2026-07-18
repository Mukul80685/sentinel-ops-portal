import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth";
import { Toaster } from "../components/ui/sonner";
import { SidebarModulesProvider } from "../components/sidebar/SidebarModulesProvider";
import { SidebarModulesHost } from "../components/sidebar/SidebarModulesHost";
import {
  bootstrapElectronStorage,
  isElectronPersistAvailable,
  whenElectronStorageReady,
} from "../lib/electronPersist";

/**
 * IMPORTANT:
 * Prevents hydration mismatch from multiple QueryClient instances
 */
function createStableQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          This page didn't load
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again or return home.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Try again
          </button>

          <Link
            to="/"
            className="rounded-md border px-4 py-2 text-sm"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title:
          "SSACC — Satellite Signal Analysis & Coordination Center",
      },
      {
        name: "description",
        content:
          "Command-and-control portal for satellite observation activities across multiple agencies.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" as const },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

/**
 * CRITICAL FIX:
 * QueryClient must be stable per app lifecycle, not recreated per render context mismatch
 */
function RootComponent() {
  const [queryClient] = useState(() => createStableQueryClient());
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    if (!isElectronPersistAvailable()) {
      setStorageReady(true);
      return;
    }

    const disposeHooks = bootstrapElectronStorage();
    void whenElectronStorageReady().then(() => setStorageReady(true));

    return () => disposeHooks();
  }, []);

  if (!storageReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SidebarModulesProvider>
          <Outlet />
          <SidebarModulesHost />
          <Toaster richColors position="top-right" />
        </SidebarModulesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}