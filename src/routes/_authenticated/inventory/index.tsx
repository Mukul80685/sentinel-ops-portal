import { createFileRoute } from "@tanstack/react-router";
import { ResourceInventoryHome } from "@/components/inventory/ResourceInventoryHome";

export const Route = createFileRoute("/_authenticated/inventory/")({
  component: ResourceInventoryHome,
  head: () => ({ meta: [{ title: "Resource Inventory — SSACC" }] }),
});
