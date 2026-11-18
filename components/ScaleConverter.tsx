"use client";

import { useState } from "react";

// How many millimetres are in one of each unit.
const MM_PER_UNIT = { mm: 1, m: 1000, ft: 304.8 } as const;
type Unit = keyof typeof MM_PER_UNIT;
const UNITS = Object.keys(MM_PER_UNIT) as Unit[];

type Side = "real" | "drawing";

function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Show a tidy number: up to 4 decimals, or 4 significant digits when tiny.
function formatNumber(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) < 0.001) return String(Number(value.toPrecision(4)));
  return String(Number(value.toFixed(4)));
}

function convert(
  value: number,
  from: Side,
  scale: number,
  realUnit: Unit,
  drawingUnit: Unit,
): number {
  if (from === "real") {
    const realMm = value * MM_PER_UNIT[realUnit];
    return realMm / scale / MM_PER_UNIT[drawingUnit];
  }
  const drawingMm = value * MM_PER_UNIT[drawingUnit];
  return (drawingMm * scale) / MM_PER_UNIT[realUnit];
}

function UnitPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Unit;
  onChange: (unit: Unit) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {UNITS.map((unit) => (
        <button
          key={unit}
          type="button"
          aria-pressed={value === unit}
          onClick={() => onChange(unit)}
          className={`rounded-md border px-3 py-1 font-mono text-xs transition-colors ${
            value === unit
              ? "relative border-accent bg-accent text-accent-ink"
              : "border-line text-muted hover:text-ink"
          }`}
        >
          {unit}
        </button>
      ))}
    </div>
  );
}

export default function ScaleConverter({ presets }: { presets: number[] }) {
  const [preset, setPreset] = useState<number | "custom">(presets[1] ?? 100);
  const [customText, setCustomText] = useState("75");
  const [realUnit, setRealUnit] = useState<Unit>("m");
  const [drawingUnit, setDrawingUnit] = useState<Unit>("mm");
  // We remember which box was typed in last; the other box is calculated.
  const [source, setSource] = useState<Side>("real");
  const [text, setText] = useState("5");

  const customValue = parseNumber(customText);
  const scale = preset === "custom" ? customValue : preset;
  const scaleIsValid = scale !== null && scale > 0;

  const typed = parseNumber(text);
  const calculated =
    typed !== null && scaleIsValid
      ? formatNumber(convert(typed, source, scale, realUnit, drawingUnit))
      : "";

  const realText = source === "real" ? text : calculated;
  const drawingText = source === "drawing" ? text : calculated;

  function handleType(side: Side, value: string) {
    setSource(side);
    setText(value);
  }

  const inputClass =
    "w-full min-w-0 rounded-xl border border-line bg-paper px-3 py-3 font-mono text-2xl outline-none focus:border-accent focus:ring-1 focus:ring-accent";

  return (
    <div className="max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
      {/* Scale */}
      <div className="border-b border-line p-4 sm:p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Scale
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {presets.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={preset === value}
              onClick={() => setPreset(value)}
              className={`rounded-md border px-4 py-2 font-mono text-sm transition-colors ${
                preset === value
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-ink hover:bg-ink hover:text-paper"
              }`}
            >
              1:{value}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={preset === "custom"}
            onClick={() => setPreset("custom")}
            className={`rounded-md border px-4 py-2 font-mono text-sm transition-colors ${
              preset === "custom"
                ? "border-accent bg-accent text-accent-ink"
                : "border-ink hover:bg-ink hover:text-paper"
            }`}
          >
            Custom
          </button>
          {preset === "custom" && (
            <label className="flex items-center gap-1 font-mono text-sm">
              1:
              <input
                type="text"
                inputMode="decimal"
                value={customText}
                onChange={(event) => setCustomText(event.target.value)}
                aria-label="Custom scale"
                className="w-24 rounded-xl border border-line bg-paper px-2 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>
          )}
        </div>
        {!scaleIsValid && (
          <p className="mt-2 text-sm text-accent">
            Enter a scale number greater than 0, for example 75 for 1:75.
          </p>
        )}
      </div>

      {/* Real size */}
      <div className="border-b border-line p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="real-size"
            className="font-mono text-xs uppercase tracking-widest text-muted"
          >
            Real size
          </label>
          <UnitPicker
            label="Real size unit"
            value={realUnit}
            onChange={setRealUnit}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            id="real-size"
            type="text"
            inputMode="decimal"
            value={realText}
            onChange={(event) => handleType("real", event.target.value)}
            className={inputClass}
          />
          <span className="w-8 font-mono text-muted">{realUnit}</span>
        </div>
      </div>

      {/* Drawing size */}
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="drawing-size"
            className="font-mono text-xs uppercase tracking-widest text-muted"
          >
            Drawing size
          </label>
          <UnitPicker
            label="Drawing size unit"
            value={drawingUnit}
            onChange={setDrawingUnit}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            id="drawing-size"
            type="text"
            inputMode="decimal"
            value={drawingText}
            onChange={(event) => handleType("drawing", event.target.value)}
            className={inputClass}
          />
          <span className="w-8 font-mono text-muted">{drawingUnit}</span>
        </div>
        {typed === null && text.trim() !== "" && (
          <p className="mt-2 text-sm text-accent">
            Please type a number, for example 5 or 2.4.
          </p>
        )}
      </div>

      {/* Rule of thumb */}
      {scaleIsValid && (
        <div className="border-t border-line bg-paper px-4 py-3 font-mono text-xs text-muted sm:px-6">
          At 1:{formatNumber(scale)}, 1 m in real life ={" "}
          {formatNumber(1000 / scale)} mm on paper.
        </div>
      )}
    </div>
  );
}
