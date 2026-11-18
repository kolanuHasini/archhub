import type { Metadata } from "next";
import PlanStudio from "@/components/plan/PlanStudio";

export const metadata: Metadata = {
  title: "Floor Plan Studio",
  description:
    "Draw accurate floor plans in the browser: walls, doors, windows, furniture, dimensions, room areas, render styles and DXF export.",
};

export default function PlanStudioPage() {
  return <PlanStudio />;
}
