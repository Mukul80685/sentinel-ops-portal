import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy route — redirects to Administrator workspace. */
export const Route = createFileRoute("/_authenticated/control-center")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/administrator", search });
  },
});
