import type { Metadata } from "next";
import Elevations from "@/components/elevation/Elevations";

export const metadata: Metadata = {
  title: "Elevations",
  description:
    "Front, back and side elevations drawn automatically from your floor plans, with levels and dimensions.",
};

export default function ElevationsPage() {
  return <Elevations />;
}
