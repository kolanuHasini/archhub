import type { Metadata } from "next";
import Projects from "@/components/dashboard/Projects";

export const metadata: Metadata = {
  title: "Projects",
  description: "All your projects, each with its own concept, plans and tasks.",
};

export default function ProjectsPage() {
  return <Projects />;
}
