import { createFileRoute } from "@tanstack/react-router";
import { UnitTilePicker } from "@/components/UnitTilePicker";

export const Route = createFileRoute("/_authenticated/inventory/")({
  component: () => (
    <UnitTilePicker title="Resource Inventory" subtitle="Module 01 // Select Unit" basePath="/inventory" />
  ),
});