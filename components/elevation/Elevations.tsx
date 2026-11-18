"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { DimView } from "@/components/plan/PlanDrawing";
import { downloadBlob, safeFileName } from "@/lib/download";
import { VIEWS, buildElevation, type OpeningFace, type ViewId } from "@/lib/plan/elevation";
import { PLAN_STYLES, getStyle, type PlanStyle } from "@/lib/plan/styles";
import {
  DEFAULT_ROOF,
  DEFAULT_SETTINGS,
  FACADE_MATERIALS,
  ROOF_TYPES,
  SCALES,
  type Roof,
  type Settings,
} from "@/lib/plan/types";
import { WORK_KEYS, projectKey, useProjects } from "@/lib/projects";
import { useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// Elevations, drawn automatically from the floor plans of the current project.
// The roof and facade material chosen here are saved with the plan.
// ---------------------------------------------------------------------------

type SavedPlan = { entities?: unknown; floors?: unknown; settings?: Partial<Settings> };
const NOTHING: SavedPlan = {};
const FONT = "Arial, Helvetica, sans-serif";

// Colours used by the coloured (presentation) styles.
const TONES = {
  glass: "#cfe0e6",
  door: "#b98f5c",
  ground: "#d9d2c2",
  roof: "#a9634a",
  roofLine: "#8a4d38",
};

// Facade materials: a fill colour, a line colour and a repeating pattern.
const MATERIALS: Record<
  string,
  { fill: string; line: string; w: number; h: number; d: string }
> = {
  plaster: { fill: "#f1ece2", line: "#d9d2c2", w: 100, h: 100, d: "" },
  brick: { fill: "#c98566", line: "#a5644a", w: 240, h: 150, d: "M0 0H240M0 75H240M0 0V75M120 75V150" },
  concrete: {
    fill: "#d9d7d2",
    line: "#bdbab3",
    w: 1200,
    h: 600,
    d: "M0 0H1200M0 0V600M300 150h1M900 150h1M300 450h1M900 450h1",
  },
  stone: {
    fill: "#d8d2c4",
    line: "#b3ab99",
    w: 900,
    h: 600,
    d: "M0 0H900M0 300H900M0 0V300M380 0V300M620 300V600M200 300V600",
  },
  timber: { fill: "#c9a273", line: "#a27c4d", w: 150, h: 1000, d: "M0 0V1000" },
  whitewash: { fill: "#fbfaf6", line: "#e6e2d8", w: 100, h: 100, d: "" },
  tile: { fill: "#d9c7b0", line: "#b9a487", w: 300, h: 300, d: "M0 0H300M0 0V300" },
  metal: { fill: "#9aa3a8", line: "#788288", w: 400, h: 1000, d: "M0 0V1000M30 0V1000" },
  glass: { fill: "#cfe0e6", line: "#8fa9b3", w: 1200, h: 1500, d: "M0 0H1200M0 0V1500" },
  jali: {
    fill: "#c98566",
    line: "#7a4632",
    w: 200,
    h: 200,
    d: "M40 40h40v40h-40ZM120 120h40v40h-40Z",
  },
};

function OpeningView({ opening, style }: { opening: OpeningFace; style: PlanStyle }) {
  const w = opening.u2 - opening.u1;
  const h = opening.z2 - opening.z1;
  const x = opening.u1;
  const y = -opening.z2;
  const line = { stroke: style.ink, strokeWidth: 1 };

  if (opening.kind === "door") {
    if (opening.style === "opening") {
      return <rect x={x} y={y} width={w} height={h} fill={style.ink} fillOpacity="0.18" {...line} />;
    }
    const leaves = ["single", "pocket", "pivot", "double-acting"].includes(opening.style) ? 1 : 2;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={style.colour ? TONES.door : style.paper} {...line} strokeWidth="1.3" />
        {opening.style === "garage"
          ? [0.2, 0.4, 0.6, 0.8].map((k) => (
              <line key={k} x1={x} y1={y + h * k} x2={x + w} y2={y + h * k} {...line} />
            ))
          : Array.from({ length: leaves - 1 }, (_, i) => (
              <line key={i} x1={x + (w * (i + 1)) / leaves} y1={y} x2={x + (w * (i + 1)) / leaves} y2={y + h} {...line} />
            ))}
        {opening.style === "sliding" && (
          <rect x={x + w * 0.06} y={y + h * 0.05} width={w * 0.88} height={h * 0.9} fill={style.colour ? TONES.glass : "none"} {...line} />
        )}
      </g>
    );
  }

  // Windows: a frame, glass, and mullions spaced to suit the width.
  const panes = opening.style === "louvre" ? 1 : Math.max(1, Math.round(w / 750));
  const blades = Math.max(2, Math.round(h / 150));
  if (opening.style === "arched" && h > w / 2) {
    // A window with a half-round head.
    const spring = y + w / 2; // where the arch starts
    return (
      <g>
        <path
          d={`M ${x} ${y + h} V ${spring} A ${w / 2} ${w / 2} 0 0 1 ${x + w} ${spring} V ${y + h} Z`}
          fill={style.colour ? TONES.glass : style.paper}
          {...line}
          strokeWidth="1.3"
        />
        <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} {...line} />
        <line x1={x} y1={spring} x2={x + w} y2={spring} {...line} />
        <line x1={x - 40} y1={y + h} x2={x + w + 40} y2={y + h} {...line} strokeWidth="1.6" />
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={style.colour ? TONES.glass : style.paper} {...line} strokeWidth="1.3" />
      {Array.from({ length: panes - 1 }, (_, i) => (
        <line key={i} x1={x + (w * (i + 1)) / panes} y1={y} x2={x + (w * (i + 1)) / panes} y2={y + h} {...line} />
      ))}
      {opening.style === "louvre" &&
        Array.from({ length: blades - 1 }, (_, i) => (
          <line key={i} x1={x} y1={y + (h * (i + 1)) / blades} x2={x + w} y2={y + (h * (i + 1)) / blades} {...line} />
        ))}
      {/* A sill line under the window. */}
      <line x1={x - 40} y1={y + h} x2={x + w + 40} y2={y + h} {...line} strokeWidth="1.6" />
    </g>
  );
}

/** A simple standing figure, 1.7 m tall, to give the building a sense of scale. */
function Person({ u, flip, colour }: { u: number; flip?: boolean; colour: string }) {
  return (
    <g transform={`translate(${u} 0) scale(${flip ? -1 : 1} 1)`} fill={colour} stroke="none">
      <circle cx="0" cy="-1590" r="110" />
      <path d="M -210 -1440 Q 0 -1500 210 -1440 L 170 -820 L 120 -820 L 110 0 L 20 0 L 0 -760 L -20 0 L -110 0 L -120 -820 L -170 -820 Z" />
    </g>
  );
}

export default function Elevations() {
  const { active } = useProjects();
  const [saved, savePlan] = useSavedState<SavedPlan>(
    projectKey(WORK_KEYS.plan, active.id),
    NOTHING,
  );
  const settings = { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) };
  const roof: Roof = { ...DEFAULT_ROOF, ...(settings.roof ?? {}) };
  const facade = MATERIALS[settings.facade] ? settings.facade : "plaster";

  const [view, setView] = useState<ViewId>("front");
  const [styleId, setStyleId] = useState<string | null>(null); // null = same as the plan
  const [scale, setScale] = useState<number | null>(null);
  const [showLevels, setShowLevels] = useState(true);
  const [showDims, setShowDims] = useState(true);
  const [showTrees, setShowTrees] = useState(true);
  const [showPeople, setShowPeople] = useState(true);
  const [showTexture, setShowTexture] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  function saveSettings(changes: Partial<Settings>) {
    savePlan({ ...saved, settings: { ...(saved.settings ?? {}), ...changes } });
  }

  const style = getStyle(styleId ?? settings.style);
  const drawingScale = scale ?? settings.scale;
  const letter = 2.5 * drawingScale;
  const elevation = useMemo(() => buildElevation(saved, view), [saved, view]);
  const { faces, trees, floors, minU, maxU, top, bottom, depthSpan } = elevation;
  const empty = faces.length === 0;

  // --- Roof ---------------------------------------------------------------------
  // The ridge normally runs along the building's longer side.
  const ridgeAcross = elevation.ridgeAlongView !== roof.turned; // ridge runs left-right here
  const over = roof.type === "flat" || roof.type === "none" ? 0 : roof.overhang;
  const left = minU - over;
  const right = maxU + over;
  const slope = Math.tan((Math.min(Math.max(roof.pitch, 1), 70) * Math.PI) / 180);
  const span = (ridgeAcross ? depthSpan : maxU - minU) + over * 2;
  let rise = 0;
  let roofShape = "";
  if (!empty) {
    if (roof.type === "flat") {
      rise = roof.parapet;
    } else if (roof.type === "gable" || roof.type === "hip") {
      rise = (span / 2) * slope;
      if (ridgeAcross) {
        // Looking at a sloping side: a rectangle (gable) or a trapezium (hip).
        const inset = roof.type === "hip" ? Math.min(span / 2, (right - left) / 2) : 0;
        roofShape = `M ${left} ${-top} L ${right} ${-top} L ${right - inset} ${-top - rise} L ${left + inset} ${-top - rise} Z`;
      } else {
        // Looking at the end: a triangle.
        roofShape = `M ${left} ${-top} L ${right} ${-top} L ${(left + right) / 2} ${-top - rise} Z`;
      }
    } else if (roof.type === "shed") {
      rise = span * slope;
      roofShape = ridgeAcross
        ? `M ${left} ${-top} L ${right} ${-top} L ${right} ${-top - rise} L ${left} ${-top - rise} Z`
        : `M ${left} ${-top} L ${right} ${-top} L ${right} ${-top - rise} Z`;
    }
  }
  const peak = top + rise;
  const roofFill = style.colour ? TONES.roof : style.paper;
  const roofLine = style.colour ? TONES.roofLine : style.ink;
  // Tile courses are drawn as horizontal lines on a sloping roof.
  const courses =
    roofShape && rise > 0 ? Array.from({ length: Math.floor(rise / 300) }, (_, i) => (i + 1) * 300) : [];

  // --- Sizes ----------------------------------------------------------------------
  const margin = letter * 14;
  const x = left - margin - (showPeople ? 1200 : 0);
  const y = -peak - margin;
  const width = right - x + margin * 1.8;
  const height = peak - bottom + margin * 2;
  const material = MATERIALS[facade];
  const wallFill = !style.colour
    ? showTexture && material.d
      ? "url(#facade)"
      : style.paper
    : showTexture && material.d
      ? "url(#facade)"
      : material.fill;
  const viewName = VIEWS.find((item) => item.id === view)?.name ?? "";

  function exportImage(kind: "png" | "svg") {
    const svg = svgRef.current;
    if (!svg) return;
    const pixels = 2600 / Math.max(width, height);
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(Math.round(width * pixels)));
    copy.setAttribute("height", String(Math.round(height * pixels)));
    const source = new XMLSerializer().serializeToString(copy);
    const name = `elevation-${view}-${safeFileName(active.name)}`;
    if (kind === "svg") {
      downloadBlob(new Blob([source], { type: "image/svg+xml" }), `${name}.svg`);
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * pixels);
      canvas.height = Math.round(height * pixels);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${name}.png`);
      }, "image/png");
    };
    image.onerror = () => window.alert("Sorry, the image could not be created in this browser.");
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  const tab = (on: boolean) =>
    `rounded-md border px-3.5 py-2 text-[15px] transition-colors ${
      on ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
    }`;
  const select =
    "h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[15px] outline-none focus:border-ink";
  const numberBox =
    "h-9 w-24 rounded-md border border-line bg-surface px-2.5 text-right text-[15px] outline-none focus:border-ink";
  const sloped = roof.type === "gable" || roof.type === "hip" || roof.type === "shed";

  const levelMarks = [
    ...floors.map((floor) => ({ z: floor.level, name: floor.name })),
    { z: top, name: sloped ? "Eaves" : "Top of wall" },
    ...(rise > 0 ? [{ z: peak, name: sloped ? "Ridge" : "Parapet" }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="annotation text-accent">{active.name}</p>
      <h1 className="display mt-2 text-4xl sm:text-6xl">Elevations</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Drawn automatically from your floor plans: every wall at its height, every door and
        window at its sill and head height, on every floor. Change the plan and the elevation
        follows.
      </p>

      {/* Which side */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => setView(item.id)}
            className={tab(view === item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        {/* The drawing */}
        <div className="self-start overflow-hidden rounded-md border border-ink lg:col-span-9">
          {empty ? (
            <div className="drafting-grid flex min-h-80 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <p className="display text-3xl">Nothing to show yet</p>
              <p className="max-w-md text-muted">
                Elevations are made from walls. Draw a plan in the Floor Plan Studio and come
                back here.
              </p>
              <Link
                href="/studio/plan"
                className="rounded-md bg-ink px-4 py-2.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
              >
                Open the Floor Plan Studio
              </Link>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`${x} ${y} ${width} ${height}`}
              role="img"
              aria-label={`${viewName} elevation`}
              className="elevation-svg block max-h-[72vh] w-full"
              style={{ background: style.paper }}
            >
              <style>
                {".elevation-svg *{vector-effect:non-scaling-stroke}.elevation-svg pattern *{vector-effect:none}"}
              </style>
              <defs>
                <pattern id="facade" width={material.w} height={material.h} patternUnits="userSpaceOnUse">
                  <rect
                    width={material.w}
                    height={material.h}
                    fill={style.colour ? material.fill : style.paper}
                  />
                  <path
                    d={material.d}
                    fill="none"
                    stroke={style.colour ? material.line : style.ink}
                    strokeOpacity={style.colour ? 1 : 0.35}
                    strokeWidth={facade === "concrete" ? 10 : 6}
                    strokeLinecap="round"
                  />
                </pattern>
              </defs>
              <rect x={x} y={y} width={width} height={height} fill={style.paper} />

              {/* Trees behind and beside the building */}
              {showTrees &&
                trees.map((tree) => {
                  const trunk = tree.r * 1.6;
                  return (
                    <g key={tree.id} stroke={style.treeLine} strokeWidth="1" fill="none">
                      <line x1={tree.u} y1={0} x2={tree.u} y2={-trunk} />
                      <circle
                        cx={tree.u}
                        cy={-trunk - tree.r * 0.8}
                        r={tree.r}
                        fill={style.treeFills[0] ?? "none"}
                        fillOpacity="0.6"
                      />
                    </g>
                  );
                })}

              {/* Walls, furthest first, so nearer walls cover the ones behind */}
              {faces.map((face) => {
                const w = face.u2 - face.u1;
                const h = face.z2 - face.z1;
                return (
                  <g key={face.id}>
                    {face.elem === "railing" ? (
                      // A railing: a glass panel under a handrail.
                      <>
                        <rect x={face.u1} y={-face.z2} width={w} height={h} fill={style.colour ? TONES.glass : "none"} fillOpacity="0.45" stroke={style.ink} strokeWidth="0.8" />
                        <line x1={face.u1} y1={-face.z2} x2={face.u2} y2={-face.z2} stroke={style.ink} strokeWidth="2.2" />
                      </>
                    ) : (
                      <rect
                        x={face.u1}
                        y={-face.z2}
                        width={w}
                        height={h}
                        fill={face.elem ? (style.colour ? "#cfcdc8" : style.paper) : wallFill}
                        stroke={face.curved ? "none" : style.ink}
                        strokeWidth="1.3"
                      />
                    )}
                    {face.curved && (
                      <path
                        d={
                          `M ${face.u1} ${-face.z2} H ${face.u2} M ${face.u1} ${-face.z1} H ${face.u2}` +
                          (face.edgeLeft ? ` M ${face.u1} ${-face.z2} V ${-face.z1}` : "") +
                          (face.edgeRight ? ` M ${face.u2} ${-face.z2} V ${-face.z1}` : "")
                        }
                        fill="none"
                        stroke={style.ink}
                        strokeWidth="1.3"
                      />
                    )}
                    {face.openings.map((opening) => (
                      <OpeningView key={opening.id} opening={opening} style={style} />
                    ))}
                  </g>
                );
              })}

              {/* Roof */}
              {roof.type === "flat" && rise > 0 && (
                <g>
                  <rect x={minU} y={-top - rise} width={maxU - minU} height={rise} fill={wallFill} stroke={style.ink} strokeWidth="1.3" />
                  <rect x={minU - 60} y={-top - rise - 80} width={maxU - minU + 120} height={80} fill={style.paper} stroke={style.ink} strokeWidth="1.3" />
                </g>
              )}
              {roofShape && (
                <g>
                  <path d={roofShape} fill={roofFill} stroke={style.ink} strokeWidth="1.6" strokeLinejoin="round" />
                  {ridgeAcross &&
                    courses.map((z) => {
                      const inset = roof.type === "hip" ? Math.min(span / 2, (right - left) / 2) * (z / rise) : 0;
                      return (
                        <line
                          key={z}
                          x1={left + inset}
                          y1={-top - z}
                          x2={right - inset}
                          y2={-top - z}
                          stroke={roofLine}
                          strokeOpacity={style.colour ? 0.8 : 0.35}
                          strokeWidth="1"
                        />
                      );
                    })}
                </g>
              )}

              {/* People, for scale */}
              {showPeople && (
                <g opacity="0.85">
                  <Person u={left - 900} colour={style.ink} />
                  <Person u={right + letter * 1.2} colour={style.ink} flip />
                </g>
              )}

              {/* Ground: anything below it is under the earth */}
              {bottom < 0 && (
                <rect
                  x={x}
                  y={0}
                  width={width}
                  height={-bottom + margin}
                  fill={style.colour ? TONES.ground : style.paper}
                  fillOpacity="0.72"
                />
              )}
              <line x1={x} y1={0} x2={x + width} y2={0} stroke={style.ink} strokeWidth="3" />

              {/* Levels */}
              {showLevels &&
                levelMarks.map((mark) => (
                  <g key={`${mark.name}-${mark.z}`} fontFamily={FONT} fill={style.text}>
                    <line
                      x1={right + letter * 3.5}
                      y1={-mark.z}
                      x2={right + letter * 7}
                      y2={-mark.z}
                      stroke={style.dimLine}
                      strokeWidth="1"
                      strokeDasharray="6 4"
                    />
                    <path
                      d={`M ${right + letter * 7} ${-mark.z} l ${letter * 0.6} ${-letter * 0.9} l ${letter * 0.6} ${letter * 0.9} Z`}
                      fill={style.ink}
                    />
                    <text x={right + letter * 8.8} y={-mark.z - letter * 0.25} fontSize={letter}>
                      {mark.z >= 0 ? "+" : ""}
                      {(mark.z / 1000).toFixed(2)}
                    </text>
                    <text x={right + letter * 8.8} y={-mark.z + letter * 1.05} fontSize={letter * 0.8} fillOpacity="0.7">
                      {mark.name}
                    </text>
                  </g>
                ))}

              {/* Overall size */}
              {showDims && (
                <>
                  <DimView
                    a={[minU, -bottom]}
                    b={[maxU, -bottom]}
                    offset={letter * 5}
                    style={style}
                    letter={letter}
                    unitName={settings.unit}
                  />
                  <DimView
                    a={[left, 0]}
                    b={[left, -peak]}
                    offset={letter * 5 + (showPeople ? 1100 : 0)}
                    style={style}
                    letter={letter}
                    unitName={settings.unit}
                  />
                </>
              )}

              {/* Title */}
              <text
                x={left}
                y={-peak - letter * 5}
                fontSize={letter * 1.4}
                fontFamily={FONT}
                fontWeight="bold"
                fill={style.text}
              >
                {viewName.toUpperCase()} ELEVATION
              </text>
              <text x={left} y={-peak - letter * 3.4} fontSize={letter} fontFamily={FONT} fill={style.text}>
                Scale 1:{drawingScale}
              </text>
            </svg>
          )}
        </div>

        {/* Options */}
        <div className="space-y-5 lg:col-span-3">
          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Roof</h2>
            <div className="space-y-3 p-5">
              <select
                value={roof.type}
                onChange={(event) => saveSettings({ roof: { ...roof, type: event.target.value } })}
                aria-label="Roof type"
                className={select}
              >
                {ROOF_TYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {sloped && (
                <>
                  <label className="flex items-center justify-between gap-2 text-[15px]">
                    <span className="text-muted">Pitch (degrees)</span>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={roof.pitch}
                      onChange={(event) =>
                        saveSettings({ roof: { ...roof, pitch: Number(event.target.value) || 25 } })
                      }
                      className={numberBox}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-[15px]">
                    <span className="text-muted">Overhang (mm)</span>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={roof.overhang}
                      onChange={(event) =>
                        saveSettings({ roof: { ...roof, overhang: Math.max(0, Number(event.target.value) || 0) } })
                      }
                      className={numberBox}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                    <input
                      type="checkbox"
                      checked={roof.turned}
                      onChange={(event) => saveSettings({ roof: { ...roof, turned: event.target.checked } })}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    Turn the ridge the other way
                  </label>
                </>
              )}
              {roof.type === "flat" && (
                <label className="flex items-center justify-between gap-2 text-[15px]">
                  <span className="text-muted">Parapet height (mm)</span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={roof.parapet}
                    onChange={(event) =>
                      saveSettings({ roof: { ...roof, parapet: Math.max(0, Number(event.target.value) || 0) } })
                    }
                    className={numberBox}
                  />
                </label>
              )}
            </div>
          </section>

          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Facade material</h2>
            <div className="space-y-3 p-5">
              <div className="grid grid-cols-5 gap-1.5">
                {FACADE_MATERIALS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.name}
                    aria-label={item.name}
                    aria-pressed={facade === item.id}
                    onClick={() => saveSettings({ facade: item.id })}
                    className={`h-10 rounded-md border-2 transition-transform hover:-translate-y-0.5 ${
                      facade === item.id ? "border-ink" : "border-line"
                    }`}
                    style={{ backgroundColor: MATERIALS[item.id].fill }}
                  />
                ))}
              </div>
              <p className="text-[15px]">
                {FACADE_MATERIALS.find((item) => item.id === facade)?.name}
              </p>
              <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                <input
                  type="checkbox"
                  checked={showTexture}
                  onChange={(event) => setShowTexture(event.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Show the material&apos;s texture
              </label>
            </div>
          </section>

          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Drawing</h2>
            <div className="space-y-3 p-5">
              <label className="block text-[15px]">
                <span className="mb-1 block text-muted">Render style</span>
                <select
                  value={styleId ?? settings.style}
                  onChange={(event) => setStyleId(event.target.value)}
                  className={select}
                >
                  {PLAN_STYLES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[15px]">
                <span className="mb-1 block text-muted">Scale (lettering size)</span>
                <select
                  value={drawingScale}
                  onChange={(event) => setScale(Number(event.target.value))}
                  className={select}
                >
                  {SCALES.map((item) => (
                    <option key={item} value={item}>
                      1:{item}
                    </option>
                  ))}
                </select>
              </label>
              {[
                { label: "Floor levels", on: showLevels, set: setShowLevels },
                { label: "Overall dimensions", on: showDims, set: setShowDims },
                { label: "Trees", on: showTrees, set: setShowTrees },
                { label: "People, for scale", on: showPeople, set: setShowPeople },
              ].map((option) => (
                <label key={option.label} className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                  <input
                    type="checkbox"
                    checked={option.on}
                    onChange={(event) => option.set(event.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Export</h2>
            <div className="flex gap-2 p-5">
              <button
                type="button"
                onClick={() => exportImage("png")}
                disabled={empty}
                className="flex-1 rounded-md bg-ink px-3 py-2 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-40"
              >
                PNG
              </button>
              <button
                type="button"
                onClick={() => exportImage("svg")}
                disabled={empty}
                className="flex-1 rounded-md border border-ink px-3 py-2 text-[15px] font-medium transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
              >
                SVG
              </button>
            </div>
          </section>

          <Link href="/studio/plan" className="inline-block text-[15px] text-accent hover:underline">
            Edit the plans →
          </Link>
        </div>
      </div>
    </div>
  );
}
