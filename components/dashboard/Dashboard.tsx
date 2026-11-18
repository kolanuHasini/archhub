"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import PlanThumb, { summarisePlan } from "@/components/dashboard/PlanThumb";
import software from "@/content/software.json";
import { formatArea } from "@/lib/plan/geometry";
import { WORK_KEYS, projectKey, useProjects } from "@/lib/projects";
import { useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// The home screen of the workspace. Everything on it is real: it reads the
// current project's saved work and shows where things stand.
// ---------------------------------------------------------------------------

type Task = { id: string; text: string; due: string; done: boolean };
const NO_TASKS: { items: Task[] } = { items: [] };
const NOTHING: Record<string, unknown> = {};

const panel = "rounded-md border border-line bg-paper";
const panelTitle = "annotation text-muted";

const noSubscription = () => () => {};

/** Today's date as text (2026-11-18). Empty until the page is in the browser. */
function useToday(): string {
  return useSyncExternalStore(
    noSubscription,
    () => new Date().toISOString().slice(0, 10),
    () => "",
  );
}

/** How much of the browser's saving space ArchHub is using, in kilobytes. */
function useStorageUsed(): number {
  return useSyncExternalStore(
    noSubscription,
    () => {
      try {
        let total = 0;
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i) ?? "";
          if (key.startsWith("archhub.")) {
            total += (window.localStorage.getItem(key) ?? "").length;
          }
        }
        return Math.round(total / 1024);
      } catch {
        return 0;
      }
    },
    () => 0,
  );
}

const filled = (value: unknown) => typeof value === "string" && value.trim() !== "";

export default function Dashboard() {
  const { active } = useProjects();
  const [concept] = useSavedState(projectKey(WORK_KEYS.concept, active.id), NOTHING);
  const [sketch] = useSavedState(projectKey(WORK_KEYS.sketch, active.id), NOTHING);
  const [savedPlan] = useSavedState(projectKey(WORK_KEYS.plan, active.id), NOTHING);
  const [tasks, saveTasks] = useSavedState(projectKey(WORK_KEYS.tasks, active.id), NO_TASKS);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const today = useToday();
  const usedKb = useStorageUsed();

  const plan = summarisePlan(savedPlan);
  const drivers = Array.isArray(concept.drivers) ? concept.drivers.length : 0;
  const sketched = Array.isArray(sketch.shapes) && sketch.shapes.length > 0;
  const conceptSteps = [
    filled(concept.name) && filled(concept.type),
    filled(concept.location) && filled(concept.climate) && filled(concept.facing),
    drivers > 0,
    filled(concept.inspName) && filled(concept.inspTranslate),
    sketched,
    filled(concept.statement),
  ];
  const conceptDone = conceptSteps.filter(Boolean).length;

  const stages = [
    {
      title: "Concept",
      state: conceptDone === 6 ? "done" : conceptDone > 0 ? "active" : "todo",
      note: `${conceptDone} of 6 steps`,
      href: "/tools/concept-planner",
    },
    {
      title: "Floor plans",
      state: plan.walls.length > 0 ? "active" : "todo",
      note:
        plan.walls.length > 0
          ? `${plan.floors} floor${plan.floors === 1 ? "" : "s"}`
          : "Not started",
      href: "/studio/plan",
    },
    { title: "Elevations", state: "planned", note: "In progress", href: "" },
    { title: "Sections", state: "planned", note: "In progress", href: "" },
    { title: "3D views", state: "planned", note: "In progress", href: "" },
    { title: "Portfolio", state: "planned", note: "In progress", href: "" },
  ];

  const items = Array.isArray(tasks.items) ? tasks.items : [];
  const open = items
    .filter((task) => !task.done)
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const finished = items.filter((task) => task.done);

  function addTask(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    saveTasks({
      items: [
        ...items,
        {
          id: Date.now().toString(36),
          text: text.trim().slice(0, 120),
          due,
          done: false,
        },
      ],
    });
    setText("");
    setDue("");
  }

  function dueLabel(task: Task): { label: string; late: boolean } {
    if (!task.due) return { label: "No date", late: false };
    if (!today) return { label: task.due, late: false };
    const days = Math.round(
      (new Date(task.due).getTime() - new Date(today).getTime()) / 86_400_000,
    );
    if (days < 0) return { label: `${-days} day${days === -1 ? "" : "s"} late`, late: true };
    if (days === 0) return { label: "Due today", late: true };
    if (days === 1) return { label: "Due tomorrow", late: false };
    return { label: `In ${days} days`, late: false };
  }

  const storagePercent = Math.min(100, Math.round((usedKb / 5000) * 100));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="annotation text-accent">Current project</p>
          <h1 className="display mt-2 truncate text-4xl sm:text-6xl">{active.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/studio/plan"
            className="rounded-md bg-ink px-4 py-2.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
          >
            Open floor plans
          </Link>
          <Link
            href="/projects"
            className="rounded-md border border-ink px-4 py-2.5 text-[15px] font-medium transition-colors hover:bg-ink hover:text-paper"
          >
            All projects
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-12">
        {/* Continue working: floor plan */}
        <Link
          href="/studio/plan"
          className={`${panel} crop group flex flex-col overflow-hidden lg:col-span-5`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className={panelTitle}>Continue · Floor plans</span>
            <span className="text-[15px] transition-transform group-hover:translate-x-1">→</span>
          </div>
          <div className="flex-1 border-b border-line">
            <PlanThumb plan={plan} />
          </div>
          <dl className="grid grid-cols-3 divide-x divide-line text-center">
            <div className="px-2 py-3">
              <dd className="text-xl font-medium">{plan.floors}</dd>
              <dt className="text-[13px] text-muted">Floor{plan.floors === 1 ? "" : "s"}</dt>
            </div>
            <div className="px-2 py-3">
              <dd className="text-xl font-medium">{plan.objects}</dd>
              <dt className="text-[13px] text-muted">Objects</dt>
            </div>
            <div className="px-2 py-3">
              <dd className="text-xl font-medium">
                {plan.area > 0 ? formatArea(plan.area) : "—"}
              </dd>
              <dt className="text-[13px] text-muted">Room area</dt>
            </div>
          </dl>
        </Link>

        {/* Continue working: concept */}
        <Link
          href="/tools/concept-planner"
          className={`${panel} crop group flex flex-col lg:col-span-4`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className={panelTitle}>Continue · Concept</span>
            <span className="text-[15px] transition-transform group-hover:translate-x-1">→</span>
          </div>
          <div className="flex flex-1 flex-col p-5">
            <p className="display text-3xl">
              {filled(concept.name) ? String(concept.name) : "No concept yet"}
            </p>
            <p className="mt-1 text-[15px] text-muted">
              {[concept.type, concept.location].filter(filled).join(" · ") ||
                "Start with the brief and the site."}
            </p>
            <p className="mt-4 line-clamp-4 flex-1 text-[15px] leading-relaxed text-muted">
              {filled(concept.statement)
                ? String(concept.statement)
                : "Your concept statement will appear here once it is written."}
            </p>
            <div className="mt-5">
              <div className="flex gap-1" aria-hidden="true">
                {conceptSteps.map((done, index) => (
                  <span
                    key={index}
                    className={`h-1.5 flex-1 rounded-full ${done ? "bg-accent" : "bg-line"}`}
                  />
                ))}
              </div>
              <p className="mt-2 text-[13px] text-muted">{conceptDone} of 6 steps done</p>
            </div>
          </div>
        </Link>

        {/* Tasks */}
        <section className={`${panel} flex flex-col lg:col-span-3`}>
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className={panelTitle}>Tasks and deadlines</h2>
            <span className="font-mono text-[11px] text-muted">{open.length} open</span>
          </div>
          <ul className="max-h-64 flex-1 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-5 py-6 text-[15px] text-muted">
                Nothing yet. Add your next submission or review below.
              </li>
            )}
            {[...open, ...finished].map((task) => {
              const state = dueLabel(task);
              return (
                <li
                  key={task.id}
                  className="group flex items-start gap-3 border-b border-line px-5 py-2.5 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() =>
                      saveTasks({
                        items: items.map((item) =>
                          item.id === task.id ? { ...item, done: !item.done } : item,
                        ),
                      })
                    }
                    aria-label={`Mark "${task.text}" as done`}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--success)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[15px] leading-snug ${
                        task.done ? "text-muted line-through" : ""
                      }`}
                    >
                      {task.text}
                    </span>
                    {!task.done && (
                      <span
                        className={`text-[13px] ${state.late ? "text-accent" : "text-muted"}`}
                      >
                        {state.label}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      saveTasks({ items: items.filter((item) => item.id !== task.id) })
                    }
                    aria-label={`Delete "${task.text}"`}
                    className="text-muted opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <form onSubmit={addTask} className="space-y-2 border-t border-line p-3">
            <input
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Add a task…"
              aria-label="New task"
              className="h-9 w-full rounded-md border border-line bg-surface px-3 text-[15px] outline-none focus:border-ink"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
                aria-label="Due date"
                className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-[14px] outline-none focus:border-ink"
              />
              <button
                type="submit"
                className="h-9 rounded-md bg-ink px-3.5 text-[14px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
              >
                Add
              </button>
            </div>
          </form>
        </section>

        {/* Timeline */}
        <section className={`${panel} lg:col-span-9`}>
          <div className="border-b border-line px-5 py-3">
            <h2 className={panelTitle}>Project timeline</h2>
          </div>
          <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {stages.map((stage, index) => {
              const dot =
                stage.state === "done"
                  ? "border-success bg-success"
                  : stage.state === "active"
                    ? "border-accent bg-accent"
                    : "border-line bg-paper";
              const body = (
                <>
                  <span className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full border-2 ${dot}`} />
                    <span className="font-mono text-[11px] text-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </span>
                  <span className="mt-3 block text-[17px] font-medium">{stage.title}</span>
                  <span className="block text-[13px] text-muted">{stage.note}</span>
                </>
              );
              const cell =
                "block h-full border-b border-r border-line p-4 last:border-r-0 lg:border-b-0";
              return (
                <li key={stage.title}>
                  {stage.href ? (
                    <Link href={stage.href} className={`${cell} transition-colors hover:bg-surface`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={`${cell} opacity-60`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* Storage */}
        <section className={`${panel} lg:col-span-3`}>
          <div className="border-b border-line px-5 py-3">
            <h2 className={panelTitle}>Saved in this browser</h2>
          </div>
          <div className="p-5">
            <p className="text-3xl font-medium tracking-tight">
              {usedKb.toLocaleString("en")}
              <span className="ml-1 text-[15px] font-normal text-muted">KB of about 5 MB</span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full ${storagePercent > 80 ? "bg-accent" : "bg-success"}`}
                style={{ width: `${Math.max(storagePercent, 2)}%` }}
              />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Work is kept on this device only. Use Save in each tool to keep a file you can
              back up or send.
            </p>
          </div>
        </section>

        {/* Software */}
        <section className={`${panel} lg:col-span-12`}>
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className={panelTitle}>Software guides</h2>
            <Link href="/software" className="text-[14px] text-muted hover:text-accent">
              All {software.length} →
            </Link>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
            {software.slice(0, 8).map((app) => (
              <li key={app.id}>
                <Link
                  href={`/software/${app.id}`}
                  className="block h-full border-b border-r border-line p-4 transition-colors hover:bg-surface lg:border-b-0"
                >
                  <span className="block text-[15px] font-medium">{app.name}</span>
                  <span className="block text-[13px] text-muted">{app.maker}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
