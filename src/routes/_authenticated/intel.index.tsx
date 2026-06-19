import { createFileRoute } from "@tanstack/react-router";
import { UnitTilePicker } from "@/components/UnitTilePicker";

export const Route = createFileRoute("/_authenticated/intel/")({
  component: () => (
    <UnitTilePicker title="INT Repository" subtitle="Module 05 // Select Unit" basePath="/intel" />
  ),
});