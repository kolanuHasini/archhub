import type { Metadata } from "next";
import Portfolio from "@/components/portfolio/Portfolio";

export const metadata: Metadata = {
  title: "Portfolio sheet",
  description:
    "Lay out a presentation sheet from your plans, elevations, sections, pictures and text, and export it as PDF or image.",
};

export default function PortfolioPage() {
  return <Portfolio />;
}
