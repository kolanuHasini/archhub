"use client";

import { useRef } from "react";
import { loadPhoto } from "@/lib/image";

// ---------------------------------------------------------------------------
// "From inspiration to form": start from an object, animal or idea, break it
// down step by step, and turn it into a building form.
// ---------------------------------------------------------------------------

export type InspirationValues = {
  inspSource: string;
  inspName: string;
  inspImage: string; // the reference picture
  inspAspect: string; // its width divided by its height
  inspObserve: string;
  inspSimplify: string;
  inspTranslate: string;
  inspRefine: string;
  inspMoves: string[];
};

export const EMPTY_INSPIRATION: InspirationValues = {
  inspSource: "",
  inspName: "",
  inspImage: "",
  inspAspect: "",
  inspObserve: "",
  inspSimplify: "",
  inspTranslate: "",
  inspRefine: "",
  inspMoves: [],
};

type StepId = "inspObserve" | "inspSimplify" | "inspTranslate" | "inspRefine";

export type InspirationOptions = {
  sources: string[];
  steps: { id: string; title: string; question: string; example: string }[];
  moves: { id: string; title: string; tip: string }[];
};

const labelClass =
  "block font-mono text-xs uppercase tracking-widest text-muted";
const fieldClass =
  "mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const smallButton =
  "border border-ink rounded-md px-3.5 py-2 font-mono text-xs transition-colors hover:bg-ink hover:text-paper";

export default function Inspiration({
  values,
  options,
  onChange,
  onPlaceOnSketch,
}: {
  values: InspirationValues;
  options: InspirationOptions;
  onChange: (changes: Partial<InspirationValues>) => void;
  onPlaceOnSketch: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function choosePicture(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const photo = await loadPhoto(file, 900);
      onChange({
        inspImage: photo.href,
        inspAspect: String(photo.width / photo.height),
      });
    } catch {
      window.alert(
        "That file could not be opened as a picture. Please choose a JPG or PNG.",
      );
    }
  }

  function toggleMove(id: string) {
    onChange({
      inspMoves: values.inspMoves.includes(id)
        ? values.inspMoves.filter((item) => item !== id)
        : [...values.inspMoves, id],
    });
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cp-insp-source" className={labelClass}>
            Kind of inspiration
          </label>
          <select
            id="cp-insp-source"
            value={values.inspSource}
            onChange={(event) => onChange({ inspSource: event.target.value })}
            className={fieldClass}
          >
            <option value="">Choose…</option>
            {options.sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cp-insp-name" className={labelClass}>
            What exactly?
          </label>
          <input
            id="cp-insp-name"
            type="text"
            value={values.inspName}
            onChange={(event) => onChange({ inspName: event.target.value })}
            placeholder="e.g. a violin, a whale's tail, a shuttlecock"
            className={fieldClass}
          />
        </div>
      </div>

      {/* Reference picture */}
      <div>
        <p className={labelClass}>Reference picture</p>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          {values.inspImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- a picture the visitor chose, kept in their browser
            <img
              src={values.inspImage}
              alt={values.inspName || "Inspiration reference"}
              className="max-h-56 max-w-full rounded-xl border border-line bg-white object-contain sm:max-w-xs"
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-line px-4 text-center text-sm text-muted sm:w-64">
              Add a photo or drawing of your inspiration
            </div>
          )}
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={smallButton}
            >
              {values.inspImage ? "Change picture" : "Add picture"}
            </button>
            {values.inspImage && (
              <>
                <button
                  type="button"
                  onClick={onPlaceOnSketch}
                  className="bg-accent rounded-md px-3.5 py-2 font-mono text-xs transition-colors text-accent-ink hover:opacity-90"
                >
                  Put it on the sketch sheet to trace
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ inspImage: "", inspAspect: "" })}
                  className="font-mono text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  Remove picture
                </button>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={choosePicture}
              aria-label="Add inspiration picture"
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* The four thinking steps */}
      <div className="space-y-4 border-t border-line pt-5">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          From object to building, in four moves
        </p>
        {options.steps.map((step) => {
          const id = step.id as StepId;
          return (
            <div key={step.id}>
              <label htmlFor={`cp-${step.id}`} className="block font-semibold">
                {step.title}
              </label>
              <p className="mt-0.5 text-sm text-muted">{step.question}</p>
              <textarea
                id={`cp-${step.id}`}
                rows={2}
                value={values[id] ?? ""}
                onChange={(event) => onChange({ [id]: event.target.value })}
                placeholder={step.example}
                className={fieldClass}
              />
            </div>
          );
        })}
      </div>

      {/* Ways to transform */}
      <div className="border-t border-line pt-5">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          Ways to transform it (pick any)
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {options.moves.map((move) => {
            const chosen = values.inspMoves.includes(move.id);
            return (
              <button
                key={move.id}
                type="button"
                aria-pressed={chosen}
                onClick={() => toggleMove(move.id)}
                className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                  chosen
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-ink hover:border-accent"
                }`}
              >
                <span className="block text-sm font-semibold">{move.title}</span>
                <span
                  className={`mt-0.5 block text-xs ${chosen ? "opacity-90" : "text-muted"}`}
                >
                  {move.tip}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
