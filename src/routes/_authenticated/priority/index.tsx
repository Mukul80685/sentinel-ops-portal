import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/priority/")({
  beforeLoad: () => {
    throw redirect({ to: "/control-center", search: { module: "priority" } });
  },
  component: () => null,
});
