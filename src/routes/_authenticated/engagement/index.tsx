import { createFileRoute } from "@tanstack/react-router";
import { UnitTilePicker } from "@/components/UnitTilePicker";

export const Route = createFileRoute("/_authenticated/engagement/")({
  component: () => (
    <UnitTilePicker title="Present Engagement Status" subtitle="Module 04 // Select Unit" basePath="/engagement" />
  ),
});