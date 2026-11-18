import type { Metadata } from "next";
import Link from "next/link";
import ConceptPlanner from "@/components/ConceptPlanner";
import concepts from "@/content/concepts.json";

export const metadata: Metadata = {
  title: "Concept Planner",
  description:
    "A guided way to go from brief, site and climate to a clear design concept statement.",
};

export default function ConceptPlannerPage() {
  return (
    <div className="py-10 sm:py-14">
      <Link
        href="/#studio-tools"
        className="font-mono text-xs text-muted hover:text-accent"
      >
        ← Studio Tools
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        Concept Planner
      </h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-muted">
        No concept yet? Work through five short steps and leave with a clear
        idea, a concept sketch, and a concept statement you can present.
      </p>
      <div className="mt-8">
        <ConceptPlanner
          projectTypes={concepts.projectTypes}
          climates={concepts.climates}
          drivers={concepts.drivers}
        />
      </div>
    </div>
  );
}
