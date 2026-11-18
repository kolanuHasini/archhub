"use client";

import { useState } from "react";
import prompts from "@/content/prompts.json";
import { WORK_KEYS, projectKey, useProjects } from "@/lib/projects";
import { useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// Builds a well-structured prompt for AI image tools from simple choices.
// Nothing here calls an AI service: it writes the words, and you paste them
// into Midjourney, Stable Diffusion or another tool.
// ---------------------------------------------------------------------------

const NOTHING: Record<string, unknown> = {};
const PROPORTIONS = ["16:9", "3:2", "1:1", "4:5", "9:16"];

type Picks = Record<string, string[]>;

export default function PromptBuilder() {
  const { active } = useProjects();
  const [concept] = useSavedState(projectKey(WORK_KEYS.concept, active.id), NOTHING);
  const [subject, setSubject] = useState("");
  const [picks, setPicks] = useState<Picks>({});
  const [proportion, setProportion] = useState("16:9");
  const [copied, setCopied] = useState("");

  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const conceptSubject = [
    text(concept.type) ? `a ${text(concept.type).toLowerCase()}` : "",
    text(concept.users) ? `for ${text(concept.users)}` : "",
    text(concept.location) ? `in ${text(concept.location)}` : "",
    text(concept.inspName) ? `with a form inspired by ${text(concept.inspName)}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  function toggle(groupId: string, option: string, many: boolean) {
    const current = picks[groupId] ?? [];
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : many
        ? [...current, option]
        : [option];
    setPicks({ ...picks, [groupId]: next });
  }

  const pick = (id: string) => picks[id] ?? [];
  const parts = [
    subject.trim() || "a building",
    ...pick("style"),
    pick("materials").length > 0 ? `built with ${pick("materials").join(", ")}` : "",
    ...pick("setting"),
    ...pick("light"),
    ...pick("view"),
    ...pick("life").filter((item) => item !== "no cars"),
    ...pick("look"),
  ].filter(Boolean);

  const sentence = parts.join(", ");
  const noCars = pick("life").includes("no cars");
  const outputs = [
    {
      id: "midjourney",
      title: "Midjourney",
      value: `${sentence} --ar ${proportion} --style raw${noCars ? " --no cars" : ""}`,
    },
    {
      id: "sd",
      title: "Stable Diffusion",
      value: `${sentence}, highly detailed, sharp focus`,
      extra: `${prompts.negative}${noCars ? ", cars" : ""}`,
    },
    {
      id: "plain",
      title: "Plain description (ChatGPT and others)",
      value: `Create an image of ${sentence}. Proportions ${proportion}.${
        noCars ? " Do not include cars." : ""
      } Keep the architecture believable and the lines straight.`,
    },
  ];

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      window.prompt("Copy the prompt:", value);
    }
  }

  const chip = (on: boolean) =>
    `rounded-md border px-3 py-1.5 text-left text-[15px] transition-colors ${
      on ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
    }`;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Choices */}
      <div className="space-y-6 lg:col-span-7">
        <section className="rounded-md border border-line bg-paper p-5">
          <label htmlFor="pb-subject" className="annotation block text-muted">
            What is the building?
          </label>
          <textarea
            id="pb-subject"
            rows={2}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="e.g. a two-storey library for children in Hyderabad, with a courtyard"
            className="mt-2 w-full rounded-md border border-line bg-surface px-3.5 py-2.5 outline-none focus:border-ink"
          />
          {conceptSubject && (
            <button
              type="button"
              onClick={() => setSubject(conceptSubject)}
              className="mt-2 text-[14px] text-accent underline-offset-4 hover:underline"
            >
              Use my concept: “{conceptSubject}”
            </button>
          )}
        </section>

        {prompts.groups.map((group) => (
          <section key={group.id} className="rounded-md border border-line bg-paper p-5">
            <h2 className="annotation flex items-baseline justify-between text-muted">
              {group.title}
              <span className="normal-case tracking-normal">
                {group.pick === "many" ? "pick any" : "pick one"}
              </span>
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {group.options.map((option) => {
                const on = pick(group.id).includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(group.id, option, group.pick === "many")}
                    className={chip(on)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section className="rounded-md border border-line bg-paper p-5">
          <h2 className="annotation text-muted">Proportions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROPORTIONS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={proportion === value}
                onClick={() => setProportion(value)}
                className={`${chip(proportion === value)} font-mono`}
              >
                {value}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Results */}
      <div className="lg:col-span-5">
        <div className="space-y-4 lg:sticky lg:top-20">
          {outputs.map((output) => (
            <section key={output.id} className="rounded-md border border-ink bg-paper">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h2 className="annotation text-muted">{output.title}</h2>
                <button
                  type="button"
                  onClick={() => copy(output.id, output.value)}
                  className="rounded-md bg-ink px-3 py-1 text-[13px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
                >
                  {copied === output.id ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="px-4 py-3 font-mono text-[13px] leading-relaxed">{output.value}</p>
              {output.extra && (
                <div className="border-t border-line px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="annotation text-[10px] text-muted">Negative prompt</span>
                    <button
                      type="button"
                      onClick={() => copy(`${output.id}-neg`, output.extra)}
                      className="text-[13px] text-accent hover:underline"
                    >
                      {copied === `${output.id}-neg` ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-1.5 font-mono text-[13px] leading-relaxed text-muted">
                    {output.extra}
                  </p>
                </div>
              )}
            </section>
          ))}
          <p className="text-[13px] leading-relaxed text-muted">
            AI images invent architecture. Use them for mood and ideas, and keep your own
            drawings as the record of the design.
          </p>
        </div>
      </div>
    </div>
  );
}
