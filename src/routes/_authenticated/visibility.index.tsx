import { createFileRoute } from "@tanstack/react-router";
import { UnitTilePicker } from "@/components/UnitTilePicker";

export const Route = createFileRoute("/_authenticated/visibility/")({
  component: () => (
    <UnitTilePicker title="Satellite Visibility Metrics" subtitle="Module 02 // Select Unit" basePath="/visibility" />
  ),
});