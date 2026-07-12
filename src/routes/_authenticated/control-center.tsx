import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path — Satellite Monitoring Dashboard now lives at `/`. */
export const Route = createFileRoute("/_authenticated/control-center")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
  head: () => ({ meta: [{ title: "Control Center — SSACC" }] }),
});
