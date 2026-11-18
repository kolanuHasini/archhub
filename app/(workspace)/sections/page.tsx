import type { Metadata } from "next";
import Sections from "@/components/section/Sections";

export const metadata: Metadata = {
  title: "Sections",
  description:
    "Cut a section anywhere through your floor plans, with slabs, plinth, foundation walls and footings.",
};

export default function SectionsPage() {
  return <Sections />;
}
