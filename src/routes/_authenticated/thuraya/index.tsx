import { createFileRoute } from "@tanstack/react-router";
import { ThurayaUnitHome } from "@/components/thuraya/ThurayaUnitHome";

export const Route = createFileRoute("/_authenticated/thuraya/")({
  component: ThurayaUnitHome,
  head: () => ({ meta: [{ title: "Thuraya — SSACC" }] }),
});
