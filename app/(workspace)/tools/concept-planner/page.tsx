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
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      <Link
        href="/dashboard"
        className="annotation text-accent hover:underline"
      >
        ← Home
      </Link>
      <h1 className="display mt-5 text-5xl sm:text-7xl">
        Concept Planner
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        No concept yet? Work through six short steps and leave with a clear
        idea, a concept sketch, and a concept statement you can present.
      </p>
      <div className="mt-12">
        <ConceptPlanner
          projectTypes={concepts.projectTypes}
          climates={concepts.climates}
          drivers={concepts.drivers}
          siteOptions={concepts.siteStudy}
          inspirationOptions={concepts.inspiration}
        />
      </div>
    </div>
  );
}
