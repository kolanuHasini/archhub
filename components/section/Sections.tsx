"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { DimView } from "@/components/plan/PlanDrawing";
import { safeFileName } from "@/lib/download";
import { exportSvgElement } from "@/lib/exportSvg";
import type { ViewId } from "@/lib/plan/elevation";
import { wallOutline } from "@/lib/plan/geometry";
import { buildSection } from "@/lib/plan/section";
import { PLAN_STYLES, getStyle } from "@/lib/plan/styles";
import {
  DEFAULT_ROOF,
  DEFAULT_SETTINGS,
  DEFAULT_STRUCTURE,
  GROUND_FLOOR,
  SCALES,
  type Entity,
  type Roof,
  type Settings,
  type Structure,
  type Wall,
} from "@/lib/plan/types";
import { WORK_KEYS, projectKey, useProjects } from "@/lib/projects";
import { useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// Sections, cut automatically through the floor plans of the current project.
// ---------------------------------------------------------------------------

type SavedPlan = { entities?: unknown; floors?: unknown; settings?: Partial<Settings> };
const NOTHING: SavedPlan = {};
const FONT = "Arial, Helvetica, sans-serif";

const LOOKS: { id: ViewId; name: string; across: boolean }[] = [
  { id: "front", name: "Cut side to side, looking to the back", across: true },
  { id: "back", name: "Cut side to side, looking to the road", across: true },
  { id: "left", name: "Cut front to back, looking right", across: false },
  { id: "right", name: "Cut front to back, looking left", across: false },
];

// Colours for cut materials in the coloured styles.
const TONES = { wall: "#4a4a4c", concrete: "#9b9b97", earth: "#d9cdb4", fill: "#e9e0cc", lean: "#c9c7c1" };

export default function Sections() {
  const { active } = useProjects();
  const [saved, savePlan] = useSavedState<SavedPlan>(
    projectKey(WORK_KEYS.plan, active.id),
    NOTHING,
  );
  const settings = { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) };
  const structure: Structure = { ...DEFAULT_STRUCTURE, ...(settings.structure ?? {}) };
  const roof: Roof = { ...DEFAULT_ROOF, ...(settings.roof ?? {}) };

  const [view, setView] = useState<ViewId>("front");
  const [chosen, setChosen] = useState<number | null>(null); // null = through the middle
  const [styleId, setStyleId] = useState<string | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [showLevels, setShowLevels] = useState(true);
  const [showDims, setShowDims] = useState(true);
  const [showBeyond, setShowBeyond] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const keyRef = useRef<SVGSVGElement>(null);

  function saveStructure(changes: Partial<Structure>) {
    savePlan({
      ...saved,
      settings: { ...(saved.settings ?? {}), structure: { ...structure, ...changes } },
    });
  }

  // The plan's outline, for the little key plan and the cut slider.
  const walls = useMemo(
    () =>
      ((Array.isArray(saved.entities) ? saved.entities : []) as Entity[]).filter(
        (e): e is Wall => e.kind === "wall",
      ),
    [saved.entities],
  );
  const groundWalls = walls.filter((w) => ((w as Wall & { floor?: string }).floor ?? "g") === GROUND_FLOOR.id);
  const keyWalls = groundWalls.length > 0 ? groundWalls : walls;
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]);
  const ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const box =
    walls.length > 0
      ? { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) }
      : { x1: 0, x2: 1000, y1: 0, y2: 1000 };
  const across = LOOKS.find((item) => item.id === view)!.across;
  const low = across ? box.y1 : box.x1;
  const high = across ? box.y2 : box.x2;
  // A good first cut crosses walls rather than running along the length of one.
  const suggested = useMemo(() => {
    for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75, 0.15, 0.85]) {
      const candidate = Math.round((low + (high - low) * fraction) / 50) * 50;
      const trial = buildSection(saved, view, candidate);
      if (trial.cuts.length >= 2 && trial.cuts.every((cut) => cut.u2 - cut.u1 < 1200)) {
        return candidate;
      }
    }
    return Math.round((low + high) / 2);
  }, [saved, view, low, high]);
  const position = Math.min(Math.max(chosen ?? suggested, low), high);

  const style = getStyle(styleId ?? settings.style);
  const drawingScale = scale ?? settings.scale;
  const letter = 2.5 * drawingScale;
  const section = useMemo(() => buildSection(saved, view, position), [saved, view, position]);
  const { cuts, voids, slabs, beyond, floors, lowestLevel, minU, maxU, roofLevel, roofSpan } = section;
  const empty = walls.length === 0;

  // --- Levels below the floor -----------------------------------------------------
  const ground = -structure.plinth; // natural ground, below the ground floor
  const underSlab = lowestLevel - structure.slab;
  const footingTop = Math.min(ground, underSlab) - structure.footingDepth + 300;
  const footingBottom = footingTop - 300;

  // --- Roof (same rules as the elevations) -------------------------------------------
  const sloped = roof.type === "gable" || roof.type === "hip" || roof.type === "shed";
  const over = sloped ? roof.overhang : 0;
  const roofLeft = (roofSpan?.u1 ?? minU) - over;
  const roofRight = (roofSpan?.u2 ?? maxU) + over;
  const ridgeAcross = beyond.ridgeAlongView !== roof.turned;
  const slope = Math.tan((Math.min(Math.max(roof.pitch, 1), 70) * Math.PI) / 180);
  const span = (ridgeAcross ? beyond.depthSpan : roofRight - roofLeft - over * 2) + over * 2;
  let rise = 0;
  let roofShape = "";
  if (!empty && sloped) {
    const top = roofLevel + structure.slab;
    if (roof.type === "shed") {
      rise = span * slope;
      roofShape = ridgeAcross
        ? `M ${roofLeft} ${-top} H ${roofRight} V ${-top - rise} H ${roofLeft} Z`
        : `M ${roofLeft} ${-top} H ${roofRight} L ${roofRight} ${-top - rise} Z`;
    } else {
      rise = (span / 2) * slope;
      const inset = roof.type === "hip" ? Math.min(span / 2, (roofRight - roofLeft) / 2) : 0;
      roofShape = ridgeAcross
        ? `M ${roofLeft} ${-top} H ${roofRight} L ${roofRight - inset} ${-top - rise} H ${roofLeft + inset} Z`
        : `M ${roofLeft} ${-top} H ${roofRight} L ${(roofLeft + roofRight) / 2} ${-top - rise} Z`;
    }
  } else if (!empty && roof.type === "flat") {
    rise = roof.parapet;
  }
  const peak = roofLevel + structure.slab + rise;

  // --- Sizes -----------------------------------------------------------------------
  const margin = letter * 14;
  const x = Math.min(minU, roofLeft) - margin * 1.5;
  const y = -peak - margin;
  const width = Math.max(maxU, roofRight) - x + margin * 1.9;
  const height = peak - footingBottom + margin * 1.6;
  const solid = style.colour ? TONES.wall : style.ink;
  const concrete = style.colour ? TONES.concrete : style.ink;
  const heavy = { stroke: style.ink, strokeWidth: 2 };
  const letterName = across ? "A-A" : "B-B";

  const levelMarks = [
    { z: ground, name: "Ground level" },
    ...floors.map((floor) => ({ z: floor.level, name: floor.name })),
    { z: roofLevel, name: "Top of wall" },
    ...(rise > 0 ? [{ z: peak, name: sloped ? "Ridge" : "Parapet" }] : []),
  ];
  const heights = [...new Set([...floors.map((f) => f.level), roofLevel])].sort((a, b) => a - b);

  function pickOnKey(event: React.PointerEvent<SVGSVGElement>) {
    const matrix = keyRef.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    setChosen(Math.round((across ? point.y : point.x) / 50) * 50);
  }

  const select =
    "h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[15px] outline-none focus:border-ink";
  const numberBox =
    "h-9 w-24 rounded-md border border-line bg-surface px-2.5 text-right text-[15px] outline-none focus:border-ink";
  const keyPad = Math.max(box.x2 - box.x1, box.y2 - box.y1) * 0.12;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="annotation text-accent">{active.name}</p>
      <h1 className="display mt-2 text-4xl sm:text-6xl">Sections</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Choose where to slice the building. Walls and slabs the cut passes through are drawn
        solid; what lies behind is drawn lightly. The plinth, foundation walls and footings are
        added below, to the sizes you set.
      </p>

      {empty ? (
        <div className="drafting-grid mt-8 flex min-h-80 flex-col items-center justify-center gap-4 rounded-md border border-ink px-6 py-16 text-center">
          <p className="display text-3xl">Nothing to cut yet</p>
          <p className="max-w-md text-muted">
            Sections are made from walls. Draw a plan in the Floor Plan Studio and come back.
          </p>
          <Link
            href="/studio/plan"
            className="rounded-md bg-ink px-4 py-2.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink"
          >
            Open the Floor Plan Studio
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-12">
          {/* The drawing */}
          <div className="self-start overflow-hidden rounded-md border border-ink lg:col-span-9">
            <svg
              ref={svgRef}
              viewBox={`${x} ${y} ${width} ${height}`}
              role="img"
              aria-label={`Section ${letterName}`}
              className="section-svg block max-h-[76vh] w-full"
              style={{ background: style.paper }}
            >
              <style>
                {".section-svg *{vector-effect:non-scaling-stroke}.section-svg pattern *{vector-effect:none}"}
              </style>
              <defs>
                <pattern id="earth" width="400" height="400" patternUnits="userSpaceOnUse">
                  <path
                    d="M40 60l60 0M220 40l50 30M120 200l60 -20M300 240l50 20M60 330l50 -20M250 340l60 0"
                    fill="none"
                    stroke={style.ink}
                    strokeOpacity="0.35"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                </pattern>
              </defs>
              <rect x={x} y={y} width={width} height={height} fill={style.paper} />

              {/* The earth */}
              <rect
                x={x}
                y={-ground}
                width={width}
                height={ground - footingBottom + margin}
                fill={style.colour ? TONES.earth : style.paper}
              />
              <rect
                x={x}
                y={-ground}
                width={width}
                height={ground - footingBottom + margin}
                fill="url(#earth)"
              />

              {/* What is seen beyond the cut */}
              {showBeyond &&
                beyond.faces.map((face) => (
                  <g key={face.id} opacity="0.55">
                    <rect
                      x={face.u1}
                      y={-face.z2}
                      width={face.u2 - face.u1}
                      height={face.z2 - face.z1}
                      fill={style.paper}
                      stroke={face.curved ? "none" : style.ink}
                      strokeWidth="1"
                    />
                    {face.openings.map((opening) => (
                      <rect
                        key={opening.id}
                        x={opening.u1}
                        y={-opening.z2}
                        width={opening.u2 - opening.u1}
                        height={opening.z2 - opening.z1}
                        fill="none"
                        stroke={style.ink}
                        strokeWidth="1"
                      />
                    ))}
                  </g>
                ))}

              {/* Filling under the lowest floor, up to the slab */}
              {slabs.length > 0 && underSlab > Math.min(ground, underSlab) - 1 && ground < underSlab && (
                <rect
                  x={slabs[0].u1}
                  y={-underSlab}
                  width={slabs[0].u2 - slabs[0].u1}
                  height={underSlab - ground}
                  fill={style.colour ? TONES.fill : style.paper}
                  stroke={style.ink}
                  strokeWidth="1"
                  strokeDasharray="6 5"
                />
              )}

              {/* Foundations under the walls that stand on the lowest floor */}
              {cuts
                .filter((cut) => cut.lowest && cut.z1 <= lowestLevel)
                .map((cut) => {
                  const centre = (cut.u1 + cut.u2) / 2;
                  const half = structure.footingWidth / 2;
                  return (
                    <g key={`footing-${cut.id}`}>
                      {/* lean concrete bed */}
                      <rect
                        x={centre - half - 150}
                        y={-footingBottom}
                        width={structure.footingWidth + 300}
                        height={100}
                        fill={style.colour ? TONES.lean : style.paper}
                        stroke={style.ink}
                        strokeWidth="1"
                      />
                      {/* footing */}
                      <rect
                        x={centre - half}
                        y={-footingTop}
                        width={structure.footingWidth}
                        height={300}
                        fill={concrete}
                        {...heavy}
                      />
                      {/* foundation wall up to the floor */}
                      <rect
                        x={cut.u1}
                        y={-lowestLevel}
                        width={cut.u2 - cut.u1}
                        height={lowestLevel - footingTop}
                        fill={solid}
                        {...heavy}
                      />
                    </g>
                  );
                })}

              {/* Floor slabs */}
              {slabs.map((slab) => (
                <rect
                  key={slab.level}
                  x={slab.u1 - 115}
                  y={-slab.level}
                  width={slab.u2 - slab.u1 + 230}
                  height={structure.slab}
                  fill={concrete}
                  {...heavy}
                />
              ))}

              {/* Roof slab, and the roof above it */}
              {roofSpan && (
                <rect
                  x={roofSpan.u1 - 115}
                  y={-roofLevel - structure.slab}
                  width={roofSpan.u2 - roofSpan.u1 + 230}
                  height={structure.slab}
                  fill={concrete}
                  {...heavy}
                />
              )}
              {roofSpan && roof.type === "flat" && rise > 0 && (
                <>
                  <rect x={roofSpan.u1 - 115} y={-peak} width={230} height={rise} fill={solid} {...heavy} />
                  <rect x={roofSpan.u2 - 115} y={-peak} width={230} height={rise} fill={solid} {...heavy} />
                </>
              )}
              {roofShape && (
                <path d={roofShape} fill="none" stroke={style.ink} strokeWidth="2.4" strokeLinejoin="round" />
              )}

              {/* Cut walls */}
              {cuts.map((cut) => (
                <rect
                  key={cut.id}
                  x={cut.u1}
                  y={-cut.z2}
                  width={cut.u2 - cut.u1}
                  height={cut.z2 - cut.z1}
                  fill={cut.concrete ? concrete : solid}
                  {...heavy}
                />
              ))}

              {/* Doors and windows the cut passes through */}
              {voids.map((gap) => (
                <g key={gap.id} stroke={style.ink} strokeWidth="1.2" fill="none">
                  <rect x={gap.u1} y={-gap.z2} width={gap.u2 - gap.u1} height={gap.z2 - gap.z1} fill={style.paper} />
                  <line x1={(gap.u1 + gap.u2) / 2} y1={-gap.z2} x2={(gap.u1 + gap.u2) / 2} y2={-gap.z1} />
                </g>
              ))}

              {/* Ground line, either side of the building */}
              <path
                d={`M ${x} ${-ground} H ${minU - 115} M ${maxU + 115} ${-ground} H ${x + width}`}
                stroke={style.ink}
                strokeWidth="3"
                fill="none"
              />

              {/* Levels */}
              {showLevels &&
                levelMarks.map((mark) => (
                  <g key={`${mark.name}-${mark.z}`} fontFamily={FONT} fill={style.text}>
                    <line
                      x1={Math.max(maxU, roofRight) + letter * 2}
                      y1={-mark.z}
                      x2={Math.max(maxU, roofRight) + letter * 6}
                      y2={-mark.z}
                      stroke={style.dimLine}
                      strokeWidth="1"
                      strokeDasharray="6 4"
                    />
                    <path
                      d={`M ${Math.max(maxU, roofRight) + letter * 6} ${-mark.z} l ${letter * 0.6} ${-letter * 0.9} l ${letter * 0.6} ${letter * 0.9} Z`}
                      fill={style.ink}
                    />
                    <text x={Math.max(maxU, roofRight) + letter * 7.8} y={-mark.z - letter * 0.25} fontSize={letter}>
                      {mark.z >= 0 ? "+" : ""}
                      {(mark.z / 1000).toFixed(2)}
                    </text>
                    <text
                      x={Math.max(maxU, roofRight) + letter * 7.8}
                      y={-mark.z + letter * 1.05}
                      fontSize={letter * 0.8}
                      fillOpacity="0.7"
                    >
                      {mark.name}
                    </text>
                  </g>
                ))}

              {/* Heights, floor by floor, and the depth of the footing */}
              {showDims && (
                <>
                  {heights.slice(0, -1).map((level, index) => (
                    <DimView
                      key={level}
                      a={[Math.min(minU, roofLeft), -level]}
                      b={[Math.min(minU, roofLeft), -heights[index + 1]]}
                      offset={letter * 4}
                      style={style}
                      letter={letter}
                      unitName={settings.unit}
                    />
                  ))}
                  <DimView
                    a={[Math.min(minU, roofLeft), -footingBottom]}
                    b={[Math.min(minU, roofLeft), -ground]}
                    offset={letter * 4}
                    style={style}
                    letter={letter}
                    unitName={settings.unit}
                  />
                  <DimView
                    a={[minU, -footingBottom]}
                    b={[maxU, -footingBottom]}
                    offset={letter * 5}
                    style={style}
                    letter={letter}
                    unitName={settings.unit}
                  />
                </>
              )}

              {/* Title */}
              <text
                x={Math.min(minU, roofLeft)}
                y={-peak - letter * 5}
                fontSize={letter * 1.4}
                fontFamily={FONT}
                fontWeight="bold"
                fill={style.text}
              >
                SECTION {letterName}
              </text>
              <text
                x={Math.min(minU, roofLeft)}
                y={-peak - letter * 3.4}
                fontSize={letter}
                fontFamily={FONT}
                fill={style.text}
              >
                Scale 1:{drawingScale}
              </text>
            </svg>
          </div>

          {/* Options */}
          <div className="space-y-5 lg:col-span-3">
            <section className="rounded-md border border-line bg-paper">
              <h2 className="annotation border-b border-line px-5 py-3 text-muted">Where to cut</h2>
              <div className="space-y-3 p-5">
                <svg
                  ref={keyRef}
                  viewBox={`${box.x1 - keyPad} ${box.y1 - keyPad} ${box.x2 - box.x1 + keyPad * 2} ${box.y2 - box.y1 + keyPad * 2}`}
                  role="img"
                  aria-label="Plan showing the cut line. Click to move the cut."
                  onPointerDown={pickOnKey}
                  className="section-svg drafting-grid block max-h-56 w-full cursor-crosshair rounded-md border border-line"
                >
                  <style>{".section-svg *{vector-effect:non-scaling-stroke}"}</style>
                  {keyWalls.map((wall) => (
                    <path key={wall.id} d={wallOutline(wall, keyWalls)} fill="var(--ink)" />
                  ))}
                  <line
                    x1={across ? box.x1 - keyPad : position}
                    y1={across ? position : box.y1 - keyPad}
                    x2={across ? box.x2 + keyPad : position}
                    y2={across ? position : box.y2 + keyPad}
                    stroke="var(--accent)"
                    strokeWidth="2.5"
                    strokeDasharray="10 4 2 4"
                  />
                </svg>
                <input
                  type="range"
                  min={low}
                  max={high}
                  step={50}
                  value={position}
                  onChange={(event) => setChosen(Number(event.target.value))}
                  aria-label="Position of the cut"
                  className="w-full accent-[var(--accent)]"
                />
                <p className="text-[13px] text-muted">
                  Click the plan or drag the slider to move the cut.
                </p>
                <select
                  value={view}
                  onChange={(event) => {
                    setView(event.target.value as ViewId);
                    setChosen(null);
                  }}
                  aria-label="Direction of the cut"
                  className={select}
                >
                  {LOOKS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="rounded-md border border-line bg-paper">
              <h2 className="annotation border-b border-line px-5 py-3 text-muted">Structure (mm)</h2>
              <div className="space-y-3 p-5">
                {(
                  [
                    ["plinth", "Plinth height"],
                    ["slab", "Slab thickness"],
                    ["footingDepth", "Footing depth below ground"],
                    ["footingWidth", "Footing width"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center justify-between gap-2 text-[15px]">
                    <span className="text-muted">{label}</span>
                    <input
                      type="number"
                      min={field === "plinth" ? 0 : 50}
                      step={50}
                      value={structure[field]}
                      onChange={(event) =>
                        saveStructure({ [field]: Math.max(0, Number(event.target.value) || 0) })
                      }
                      className={numberBox}
                    />
                  </label>
                ))}
                <p className="text-[13px] leading-relaxed text-muted">
                  These sizes are drawn exactly as you enter them. They are not a structural
                  design: footing sizes must come from an engineer.
                </p>
              </div>
            </section>

            <section className="rounded-md border border-line bg-paper">
              <h2 className="annotation border-b border-line px-5 py-3 text-muted">Drawing</h2>
              <div className="space-y-3 p-5">
                <select
                  value={styleId ?? settings.style}
                  onChange={(event) => setStyleId(event.target.value)}
                  aria-label="Render style"
                  className={select}
                >
                  {PLAN_STYLES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  value={drawingScale}
                  onChange={(event) => setScale(Number(event.target.value))}
                  aria-label="Scale"
                  className={select}
                >
                  {SCALES.map((item) => (
                    <option key={item} value={item}>
                      1:{item}
                    </option>
                  ))}
                </select>
                {[
                  { label: "Levels", on: showLevels, set: setShowLevels },
                  { label: "Dimensions", on: showDims, set: setShowDims },
                  { label: "Show what is beyond the cut", on: showBeyond, set: setShowBeyond },
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
                <p className="text-[13px] text-muted">
                  The roof follows the choice made on the{" "}
                  <Link href="/elevations" className="text-accent hover:underline">
                    Elevations
                  </Link>{" "}
                  page.
                </p>
              </div>
            </section>

            <div className="flex gap-2">
              {(["png", "svg"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() =>
                    svgRef.current &&
                    exportSvgElement(
                      svgRef.current,
                      width,
                      height,
                      `section-${letterName.toLowerCase()}-${safeFileName(active.name)}`,
                      kind,
                    )
                  }
                  className={`flex-1 rounded-md px-3 py-2 text-[15px] font-medium uppercase transition-colors ${
                    kind === "png"
                      ? "bg-ink text-paper hover:bg-accent hover:text-accent-ink"
                      : "border border-ink hover:bg-ink hover:text-paper"
                  }`}
                >
                  {kind}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
