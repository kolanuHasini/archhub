"use client";

import { useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// Projects. Each project keeps its own concept plan, sketch and floor plans.
// Everything lives in the visitor's browser; nothing is sent to a server.
//
// The first project is called "default" and uses the original storage names,
// so work made before projects existed is still there.
// ---------------------------------------------------------------------------

export type Project = {
  id: string;
  name: string;
  created: string; // date, as text
};

export type ProjectList = {
  active: string;
  list: Project[];
};

const PROJECTS_KEY = "archhub.projects.v1";
export const DEFAULT_PROJECT = "default";

const EMPTY: ProjectList = {
  active: DEFAULT_PROJECT,
  list: [{ id: DEFAULT_PROJECT, name: "My first project", created: "" }],
};

/** The name a piece of work is saved under, for one project. */
export function projectKey(base: string, projectId: string): string {
  return projectId === DEFAULT_PROJECT ? base : `${base}.${projectId}`;
}

// The kinds of work a project can hold.
export const WORK_KEYS = {
  concept: "archhub.concept-planner.v1",
  sketch: "archhub.concept-sketch.v1",
  plan: "archhub.plan.v1",
  tasks: "archhub.tasks.v1",
  portfolio: "archhub.portfolio.v1",
};

export function useProjects() {
  const [saved, save] = useSavedState(PROJECTS_KEY, EMPTY);
  const list =
    Array.isArray(saved.list) && saved.list.length > 0 ? saved.list : EMPTY.list;
  const active = list.find((p) => p.id === saved.active) ?? list[0];

  function open(id: string) {
    save({ active: id, list });
  }

  function create(name: string): string {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const project: Project = {
      id,
      name: name.trim().slice(0, 60) || "Untitled project",
      created: new Date().toISOString().slice(0, 10),
    };
    save({ active: id, list: [...list, project] });
    return id;
  }

  function rename(id: string, name: string) {
    save({
      active: active.id,
      list: list.map((p) =>
        p.id === id ? { ...p, name: name.trim().slice(0, 60) || p.name } : p,
      ),
    });
  }

  /** Removes a project and all the work saved for it. */
  function remove(id: string) {
    if (list.length < 2) return;
    for (const base of Object.values(WORK_KEYS)) {
      try {
        window.localStorage.removeItem(projectKey(base, id));
      } catch {
        // Storage is blocked; nothing was saved there anyway.
      }
    }
    const remaining = list.filter((p) => p.id !== id);
    save({
      active: active.id === id ? remaining[0].id : active.id,
      list: remaining,
    });
  }

  return { list, active, open, create, rename, remove };
}
