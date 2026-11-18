"use client";

import { useRouter } from "next/navigation";
import PlanThumb, { summarisePlan } from "@/components/dashboard/PlanThumb";
import { WORK_KEYS, projectKey, useProjects, type Project } from "@/lib/projects";
import { useSavedState } from "@/lib/useSavedState";

// The list of projects. Each one keeps its own concept, sketch and plans.

const NOTHING: Record<string, unknown> = {};

function ProjectCard({
  project,
  current,
  canDelete,
  onOpen,
  onRename,
  onDelete,
}: {
  project: Project;
  current: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [savedPlan] = useSavedState(projectKey(WORK_KEYS.plan, project.id), NOTHING);
  const [concept] = useSavedState(projectKey(WORK_KEYS.concept, project.id), NOTHING);
  const plan = summarisePlan(savedPlan);
  const about = [concept.type, concept.location]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .join(" · ");

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-md border bg-paper ${
        current ? "border-ink" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="crop group block text-left"
        aria-label={`Open ${project.name}`}
      >
        <div className="border-b border-line">
          <PlanThumb plan={plan} />
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="display text-3xl">{project.name}</h2>
            {current && <span className="annotation mt-2 shrink-0 text-accent">Open now</span>}
          </div>
          <p className="mt-1 text-[15px] text-muted">
            {about || "No brief yet"}
            {project.created ? ` · started ${project.created}` : ""}
          </p>
          <p className="mt-3 text-[13px] text-muted">
            {plan.floors} floor{plan.floors === 1 ? "" : "s"} · {plan.objects} drawn object
            {plan.objects === 1 ? "" : "s"}
          </p>
        </div>
      </button>
      <div className="mt-auto flex border-t border-line text-[14px]">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 px-4 py-2.5 font-medium transition-colors hover:bg-ink hover:text-paper"
        >
          Open
        </button>
        <button
          type="button"
          onClick={onRename}
          className="border-l border-line px-4 py-2.5 text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="border-l border-line px-4 py-2.5 text-muted transition-colors hover:bg-surface hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export default function Projects() {
  const router = useRouter();
  const { list, active, open, create, rename, remove } = useProjects();

  function newProject() {
    const name = window.prompt("Name of the new project:");
    if (name === null) return;
    create(name);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="annotation text-accent">
            {list.length} project{list.length === 1 ? "" : "s"}
          </p>
          <h1 className="display mt-2 text-4xl sm:text-6xl">Projects</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Each project keeps its own concept, sketch, floor plans and tasks. They are saved in
            this browser; use Save inside a tool to keep a file elsewhere.
          </p>
        </div>
        <button
          type="button"
          onClick={newProject}
          className="rounded-md bg-ink px-4 py-2.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
        >
          + New project
        </button>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            current={project.id === active.id}
            canDelete={list.length > 1}
            onOpen={() => {
              open(project.id);
              router.push("/dashboard");
            }}
            onRename={() => {
              const name = window.prompt("New name for this project:", project.name);
              if (name !== null) rename(project.id, name);
            }}
            onDelete={() => {
              if (
                window.confirm(
                  `Delete "${project.name}" and all its work? This cannot be undone.`,
                )
              ) {
                remove(project.id);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
