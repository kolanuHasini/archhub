"use client";

import Link from "next/link";
import { useRef } from "react";
import SiteStudy, {
  EMPTY_SITE,
  siteArea,
  sitePosition,
  type SiteOptions,
  type SiteValues,
} from "@/components/SiteStudy";
import SketchPad, { EMPTY_SKETCH, type Sketch } from "@/components/SketchPad";
import { downloadBlob, safeFileName } from "@/lib/download";
import { useSavedState } from "@/lib/useSavedState";

type Climate = { id: string; label: string; strategies: string[] };
type Driver = {
  id: string;
  title: string;
  question: string;
  moves: string[];
  diagrams: string[];
};

type Plan = SiteValues & {
  name: string;
  type: string;
  users: string;
  location: string;
  climate: string;
  siteNotes: string;
  drivers: string[];
  bigIdea: string;
  statement: string;
};

const EMPTY_PLAN: Plan = {
  ...EMPTY_SITE,
  name: "",
  type: "",
  users: "",
  location: "",
  climate: "",
  siteNotes: "",
  drivers: [],
  bigIdea: "",
  statement: "",
};

const STORAGE_KEY = "archhub.concept-planner.v1";
const SKETCH_KEY = "archhub.concept-sketch.v1";
const MAX_DRIVERS = 3;

// "a", "a and b", "a, b and c"
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function endSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function draftStatement(
  plan: Plan,
  climate: Climate | undefined,
  drivers: Driver[],
): string {
  const sentences: string[] = [];

  const name = plan.name.trim() || "This project";
  const type = plan.type ? plan.type.toLowerCase() : "building";
  const article = /^[aeiou]/.test(type) ? "an" : "a";
  let opening = `${name} is ${article} ${type}`;
  if (plan.users.trim()) opening += ` for ${plan.users.trim()}`;
  if (plan.location.trim()) opening += ` in ${plan.location.trim()}`;
  sentences.push(endSentence(opening));

  if (drivers.length > 0) {
    const titles = drivers.map((driver) => driver.title.toLowerCase());
    // Titles already contain "and", so separate them with semicolons.
    sentences.push(`The design is driven by ${titles.join("; ")}.`);
  }

  if (plan.bigIdea.trim()) {
    sentences.push(endSentence(`The big idea: ${plan.bigIdea.trim()}`));
  }

  if (climate) {
    const climateName = climate.label.split(" (")[0].toLowerCase();
    sentences.push(
      `In response to the ${climateName} climate, it uses ${joinList(
        climate.strategies.slice(0, 2),
      )}.`,
    );
  }

  const area = siteArea(plan);
  if (plan.facing || area !== null) {
    let site = "The site";
    if (area !== null) site += ` covers about ${area.toLocaleString()} m²`;
    if (plan.facing) {
      site += `${area !== null ? " and" : ""} faces ${plan.facing.toLowerCase()}`;
    }
    sentences.push(`${site}.`);
  }

  if (plan.siteNotes.trim()) {
    sentences.push(
      endSentence(`On the site, it responds to ${plan.siteNotes.trim()}`),
    );
  }

  return sentences.join(" ");
}

function buildSummary(
  plan: Plan,
  climate: Climate | undefined,
  drivers: Driver[],
): string {
  const area = siteArea(plan);
  const position = sitePosition(plan);
  const lines = [
    `CONCEPT PLAN: ${plan.name || "Untitled project"}`,
    "",
    "1. BRIEF",
    `Project type: ${plan.type || "-"}`,
    `Who it is for: ${plan.users || "-"}`,
    "",
    "2. SITE STUDY",
    `Location: ${plan.location || "-"}`,
    `Map position: ${position ? `${position[0]}, ${position[1]}` : "-"}`,
    `Size: ${plan.siteWidth || "-"} m wide x ${plan.siteDepth || "-"} m deep`,
    `Area: ${area !== null ? `${area} m2` : "-"}`,
    `Road width: ${plan.roadWidth ? `${plan.roadWidth} m` : "-"}`,
    `Site faces: ${plan.facing || "-"}`,
    `Slope: ${plan.slope || "-"}`,
    `Wind mostly from: ${plan.wind || "-"}`,
    `Vegetation: ${plan.vegetation || "-"}`,
    `Vegetation notes: ${plan.vegetationNotes || "-"}`,
    `North side: ${plan.north || "-"}`,
    `East side: ${plan.east || "-"}`,
    `South side: ${plan.south || "-"}`,
    `West side: ${plan.west || "-"}`,
    `Climate: ${climate?.label ?? "-"}`,
    `Site notes: ${plan.siteNotes || "-"}`,
    "Site documentation done:",
    ...(plan.siteChecklist.length > 0
      ? plan.siteChecklist.map((item) => `  [x] ${item}`)
      : ["  -"]),
  ];
  if (climate) {
    lines.push("Climate strategies to consider:");
    climate.strategies.forEach((strategy) => lines.push(`  - ${strategy}`));
  }
  lines.push("", "3. DESIGN DRIVERS");
  if (drivers.length === 0) lines.push("-");
  drivers.forEach((driver) => {
    lines.push(`${driver.title}`);
    lines.push(`  Ask yourself: ${driver.question}`);
    driver.moves.forEach((move) => lines.push(`  - Try: ${move}`));
    driver.diagrams.forEach((diagram) => lines.push(`  - Draw: ${diagram}`));
  });
  lines.push(`Big idea: ${plan.bigIdea || "-"}`);
  lines.push(
    "",
    "4. CONCEPT SKETCH",
    "Download the sketch as an image from the Concept Planner page.",
    "",
    "5. CONCEPT STATEMENT",
    plan.statement || "-",
    "",
  );
  return lines.join("\r\n");
}

const labelClass =
  "block font-mono text-xs uppercase tracking-widest text-muted";
const fieldClass =
  "mt-2 w-full border border-ink bg-paper px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";

const STEP_TITLES = [
  "Brief",
  "Site study",
  "Design drivers",
  "Concept sketch",
  "Concept statement",
];

// Checks a file someone opened, keeping only the parts we understand.
function readProjectFile(
  text: string,
): { plan: Plan; sketch: Sketch } | null {
  try {
    const data = JSON.parse(text);
    if (!data || data.app !== "archhub" || data.kind !== "concept") return null;
    const source = (data.plan ?? {}) as Record<string, unknown>;
    // Copy each known field, but only if it is the right kind of value.
    const fields: Record<string, string | string[]> = { ...EMPTY_PLAN };
    for (const key of Object.keys(EMPTY_PLAN)) {
      const value = source[key];
      if (Array.isArray(fields[key])) {
        if (Array.isArray(value)) {
          fields[key] = value.filter(
            (item): item is string => typeof item === "string",
          );
        }
      } else if (typeof value === "string") {
        fields[key] = value;
      }
    }
    const plan = fields as unknown as Plan;
    const shapes = Array.isArray(data.sketch?.shapes) ? data.sketch.shapes : [];
    return { plan, sketch: { shapes } };
  } catch {
    return null;
  }
}

function Step({
  index,
  hint,
  done,
  children,
}: {
  index: number;
  hint: string;
  done: boolean;
  children: React.ReactNode;
}) {
  const number = String(index + 1).padStart(2, "0");
  const title = STEP_TITLES[index];
  return (
    <section
      id={`step-${index + 1}`}
      className="scroll-mt-4 border border-ink bg-surface"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line p-4 sm:p-6">
        <div>
          <p className="font-mono text-xs text-accent">{number}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted">{hint}</p>
        </div>
        <span
          className={`shrink-0 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            done
              ? "border-accent bg-accent text-accent-ink"
              : "border-line text-muted"
          }`}
        >
          {done ? "Done" : "To do"}
        </span>
      </div>
      <div className="space-y-5 p-4 sm:p-6">{children}</div>
      <div className="flex justify-end border-t border-line p-4 sm:px-6">
        <a
          href={index + 1 < STEP_TITLES.length ? `#step-${index + 2}` : "#save"}
          className="bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          Next:{" "}
          {index + 1 < STEP_TITLES.length
            ? STEP_TITLES[index + 1]
            : "Save and send"}{" "}
          →
        </a>
      </div>
    </section>
  );
}

export default function ConceptPlanner({
  projectTypes,
  climates,
  drivers,
  siteOptions,
}: {
  projectTypes: string[];
  climates: Climate[];
  drivers: Driver[];
  siteOptions: SiteOptions;
}) {
  const [plan, savePlan, resetPlan] = useSavedState(STORAGE_KEY, EMPTY_PLAN);
  const [sketch, saveSketch, resetSketch] = useSavedState(
    SKETCH_KEY,
    EMPTY_SKETCH,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasSketch = Array.isArray(sketch.shapes) && sketch.shapes.length > 0;

  function update(changes: Partial<Plan>) {
    savePlan({ ...plan, ...changes });
  }

  const climate = climates.find((item) => item.id === plan.climate);
  const chosenDrivers = drivers.filter((driver) =>
    plan.drivers.includes(driver.id),
  );

  const stepsDone = [
    plan.name.trim() !== "" && plan.type !== "",
    plan.location.trim() !== "" && plan.climate !== "" && plan.facing !== "",
    chosenDrivers.length > 0,
    hasSketch,
    plan.statement.trim() !== "",
  ];
  const doneCount = stepsDone.filter(Boolean).length;

  function toggleDriver(id: string) {
    if (plan.drivers.includes(id)) {
      update({ drivers: plan.drivers.filter((item) => item !== id) });
    } else if (chosenDrivers.length < MAX_DRIVERS) {
      update({ drivers: [...plan.drivers, id] });
    }
  }

  function writeDraft() {
    if (
      plan.statement.trim() !== "" &&
      !window.confirm("Replace your current statement with a new draft?")
    ) {
      return;
    }
    update({ statement: draftStatement(plan, climate, chosenDrivers) });
  }

  function download() {
    const text = buildSummary(plan, climate, chosenDrivers);
    downloadBlob(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      `concept-${safeFileName(plan.name)}.txt`,
    );
  }

  // A project file holds the answers and the sketch together, so the work can
  // be backed up, moved to another computer, or sent to someone else.
  function projectFile(): File {
    const data = { app: "archhub", kind: "concept", version: 1, plan, sketch };
    return new File(
      [JSON.stringify(data, null, 2)],
      `${safeFileName(plan.name)}.archhub.json`,
      { type: "application/json" },
    );
  }

  function saveProject() {
    const file = projectFile();
    downloadBlob(file, file.name);
  }

  async function shareProject() {
    const file = projectFile();
    const shareData = {
      files: [file],
      title: plan.name || "ArchHub concept",
      text: "My concept plan from ArchHub. Open it with the Concept Planner.",
    };
    if (navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
      } catch {
        // The share window was closed; nothing to do.
      }
      return;
    }
    downloadBlob(file, file.name);
    window.alert(
      "This browser cannot share files directly, so the project file was saved to your Downloads folder instead. Attach that file to an email or message to send it.",
    );
  }

  async function openProject(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow picking the same file again later
    if (!file) return;
    const opened = readProjectFile(await file.text());
    if (!opened) {
      window.alert(
        "That file could not be opened. Please choose a file saved from the Concept Planner (it ends in .archhub.json).",
      );
      return;
    }
    const hasWork = doneCount > 0;
    if (
      hasWork &&
      !window.confirm("Replace your current work with the file you opened?")
    ) {
      return;
    }
    savePlan(opened.plan);
    saveSketch(opened.sketch);
  }

  function startOver() {
    if (
      window.confirm(
        "Clear everything, including the sketch, and start a new concept?",
      )
    ) {
      resetPlan();
      resetSketch();
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Progress */}
      <details className="border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-widest text-accent">
          How this works (guide)
        </summary>
        <ol className="list-decimal space-y-2 border-t border-line px-4 py-4 pl-9 text-sm leading-relaxed">
          <li>
            Work down the page from step 01 to step 05. Each step is marked{" "}
            <strong>Done</strong> when it is filled in. You can jump between
            steps with the buttons below.
          </li>
          <li>
            In <strong>Concept sketch</strong>, choose a tool (Pen, Line,
            Curve, Arrow, Box, Circle, Text), then click and drag on the white
            sheet. Use <strong>Select</strong> to move a shape or make it
            bigger or smaller, and <strong>Eraser</strong> to remove one.
            Prefer paper? Draw by hand, take a photo, and press{" "}
            <strong>Add photo of a paper sketch</strong>.
          </li>
          <li>
            In <strong>Concept statement</strong>, press the blue button for a
            first draft, then rewrite it in your own words.
          </li>
          <li>
            Your work saves by itself in this browser. To keep a backup, move
            to another computer, or send it to a friend or teacher, use{" "}
            <strong>Save project file</strong> or <strong>Share</strong> at the
            bottom. <strong>Open project file</strong> brings it back.
          </li>
        </ol>
      </details>

      {/* Flow: jump to any step */}
      <nav aria-label="Steps" className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {STEP_TITLES.map((title, index) => (
            <a
              key={title}
              href={`#step-${index + 1}`}
              className={`border px-2.5 py-1.5 font-mono text-xs ${
                stepsDone[index]
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-ink hover:border-accent hover:text-accent"
              }`}
            >
              {String(index + 1).padStart(2, "0")} {title}
            </a>
          ))}
        </div>
        <p className="flex flex-wrap justify-between gap-x-4 font-mono text-xs text-muted">
          <span>
            {doneCount} of {stepsDone.length} steps done
          </span>
          <span>Saved automatically in this browser</span>
        </p>
      </nav>

      <Step
        index={0}
        hint="Start with the basics: what are you designing, and for whom?"
        done={stepsDone[0]}
      >
        <div>
          <label htmlFor="cp-name" className={labelClass}>
            Project name
          </label>
          <input
            id="cp-name"
            type="text"
            value={plan.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="e.g. Riverside Library"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="cp-type" className={labelClass}>
            Project type
          </label>
          <select
            id="cp-type"
            value={plan.type}
            onChange={(event) => update({ type: event.target.value })}
            className={fieldClass}
          >
            <option value="">Choose a type…</option>
            {projectTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cp-users" className={labelClass}>
            Who is it for?
          </label>
          <input
            id="cp-users"
            type="text"
            value={plan.users}
            onChange={(event) => update({ users: event.target.value })}
            placeholder="e.g. school children and local families"
            className={fieldClass}
          />
        </div>
      </Step>

      <Step
        index={1}
        hint="A strong concept grows out of its place. Record the site properly: where it is, its size, which way it faces, and what is on and around it."
        done={stepsDone[1]}
      >
        <div>
          <label htmlFor="cp-location" className={labelClass}>
            Location
          </label>
          <input
            id="cp-location"
            type="text"
            value={plan.location}
            onChange={(event) => update({ location: event.target.value })}
            placeholder="e.g. Hyderabad, India"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="cp-climate" className={labelClass}>
            Climate
          </label>
          <select
            id="cp-climate"
            value={plan.climate}
            onChange={(event) => update({ climate: event.target.value })}
            className={fieldClass}
          >
            <option value="">Choose a climate…</option>
            {climates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        {climate && (
          <div className="border border-line bg-paper p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-accent">
              Strategies to consider
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {climate.strategies.map((strategy) => (
                <li key={strategy}>{strategy}</li>
              ))}
            </ul>
          </div>
        )}
        <SiteStudy
          values={plan}
          location={plan.location}
          options={siteOptions}
          onChange={update}
        />
        <div className="border-t border-line pt-5">
          <label htmlFor="cp-site" className={labelClass}>
            What is special about the site?
          </label>
          <textarea
            id="cp-site"
            rows={3}
            value={plan.siteNotes}
            onChange={(event) => update({ siteNotes: event.target.value })}
            placeholder="e.g. a row of old neem trees, a busy road to the south, a view of the lake"
            className={fieldClass}
          />
        </div>
      </Step>

      <Step
        index={2}
        hint={`Pick up to ${MAX_DRIVERS} ideas that should lead the design. Fewer is stronger.`}
        done={stepsDone[2]}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {drivers.map((driver) => {
            const chosen = plan.drivers.includes(driver.id);
            const full = !chosen && chosenDrivers.length >= MAX_DRIVERS;
            return (
              <button
                key={driver.id}
                type="button"
                aria-pressed={chosen}
                disabled={full}
                onClick={() => toggleDriver(driver.id)}
                className={`border px-3 py-2 text-left text-sm ${
                  chosen
                    ? "border-accent bg-accent text-accent-ink"
                    : full
                      ? "cursor-not-allowed border-line text-muted opacity-60"
                      : "border-ink hover:border-accent hover:text-accent"
                }`}
              >
                {driver.title}
              </button>
            );
          })}
        </div>

        {chosenDrivers.map((driver) => (
          <div key={driver.id} className="border border-line bg-paper p-4">
            <h3 className="font-semibold">{driver.title}</h3>
            <p className="mt-1 text-sm italic text-muted">{driver.question}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-accent">
                  Moves to try
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {driver.moves.map((move) => (
                    <li key={move}>{move}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-accent">
                  Diagrams to draw
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {driver.diagrams.map((diagram) => (
                    <li key={diagram}>{diagram}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}

        <div>
          <label htmlFor="cp-idea" className={labelClass}>
            Your big idea, in one sentence
          </label>
          <textarea
            id="cp-idea"
            rows={2}
            value={plan.bigIdea}
            onChange={(event) => update({ bigIdea: event.target.value })}
            placeholder="e.g. a library that feels like reading under a tree"
            className={fieldClass}
          />
        </div>
      </Step>

      <Step
        index={3}
        hint="Draw your idea: a bubble diagram, a parti, a quick section. Rough is fine."
        done={stepsDone[3]}
      >
        <SketchPad
          storageKey={SKETCH_KEY}
          fileName={`concept-sketch-${safeFileName(plan.name)}`}
        />
      </Step>

      <Step
        index={4}
        hint="Get a first draft from your answers, then rewrite it in your own words."
        done={stepsDone[4]}
      >
        <button
          type="button"
          onClick={writeDraft}
          className="bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          Write a draft from my answers
        </button>
        <div>
          <label htmlFor="cp-statement" className={labelClass}>
            Statement
          </label>
          <textarea
            id="cp-statement"
            rows={7}
            value={plan.statement}
            onChange={(event) => update({ statement: event.target.value })}
            placeholder="Your concept statement will appear here. You can also write it yourself."
            className={`${fieldClass} leading-relaxed`}
          />
        </div>
      </Step>

      <section id="save" className="border border-ink bg-surface p-4 sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight">Save and send</h2>
        <p className="mt-1 text-sm text-muted">
          A project file keeps your answers and your sketch together. Save it
          as a backup, or send it to a friend or teacher, who can open it here.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveProject}
            className="bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            Save project file
          </button>
          <button
            type="button"
            onClick={shareProject}
            className="border border-ink px-5 py-2.5 text-sm font-medium hover:border-accent hover:text-accent"
          >
            Share
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border border-ink px-5 py-2.5 text-sm font-medium hover:border-accent hover:text-accent"
          >
            Open project file
          </button>
          <button
            type="button"
            onClick={download}
            className="border border-ink px-5 py-2.5 text-sm font-medium hover:border-accent hover:text-accent"
          >
            Download summary as text
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={openProject}
            aria-label="Open project file"
            className="hidden"
          />
        </div>
      </section>

      <section className="border border-ink bg-surface p-4 sm:p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          Next stage
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          Floor plans
        </h2>
        <p className="mt-1 text-sm text-muted">
          Turn this concept into a floor plan with walls, doors, windows and
          furniture. In the studio, press &ldquo;Use my site study&rdquo; to
          bring in your site size and north direction.
        </p>
        <Link
          href="/studio/plan"
          className="mt-4 inline-block bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          Next: open the Floor Plan Studio →
        </Link>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={startOver}
          className="px-5 py-2.5 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
