import { createFileRoute } from "@tanstack/react-router";
import { UnitTilePicker } from "@/components/UnitTilePicker";

export const Route = createFileRoute("/_authenticated/priority/")({
  component: () => (
    <UnitTilePicker title="Satellite Priority & Allocation" subtitle="Module 03 // Select Unit" basePath="/priority" />
  ),
});