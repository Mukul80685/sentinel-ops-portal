import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/priority/")({
  beforeLoad: () => {
    throw redirect({ to: "/administrator", search: { module: "priority" } });
  },
  component: () => null,
});
