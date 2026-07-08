import { createFileRoute, redirect } from "@tanstack/react-router";
import { ccHubSearch } from "@/lib/controlCenter";

export const Route = createFileRoute("/_authenticated/intel/")({
  beforeLoad: () => {
    throw redirect({ to: "/administrator", search: ccHubSearch("intel") });
  },
  component: () => null,
});

export { IntelRepositoryView } from "@/components/intel/IntelRepositoryView";
