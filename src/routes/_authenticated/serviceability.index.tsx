import { createFileRoute } from "@tanstack/react-router";
import { UnitTilePicker } from "@/components/UnitTilePicker";

export const Route = createFileRoute("/_authenticated/serviceability/")({
  component: () => (
    <UnitTilePicker title="Serviceability State" subtitle="Operational Readiness // Select Unit" basePath="/serviceability" />
  ),
});