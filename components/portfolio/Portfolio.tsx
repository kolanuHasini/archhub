"use client";

import Link from "next/link";
import { useRef } from "react";
import PlanDrawing from "@/components/plan/PlanDrawing";
import { safeFileName } from "@/lib/download";
import { exportSvgElement } from "@/lib/exportSvg";
import { loadPhoto } from "@/lib/image";
import { VIEWS, buildElevation, roofOutline, type ViewId } from "@/lib/plan/elevation";
import { extents } from "@/lib/plan/geometry";
import { buildSection } from "@/lib/plan/section";
import { getStyle } from "@/lib/plan/styles";
import {
  DEFAULT_ROOF,
  DEFAULT_SETTINGS,
  DEFAULT_STRUCTURE,
  GROUND_FLOOR,
  type Entity,
  type Floor,
  type PlanDoc,
  type Settings,
} from "@/lib/plan/types";
import { WORK_KEYS, projectKey, useProjects } from "@/lib/projects";
import { isSavedInBrowser, useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// The portfolio sheet: a page laid out like a presentation board. Each panel
// shows a drawing from the project, one of your own pictures, or text.
// The whole sheet is one drawing, so it exports cleanly as PDF, PNG or SVG.
// ---------------------------------------------------------------------------

type Panel = { kind: string; caption: string; image: string; text: string };
type Sheet = {
  size: string;
  portrait: boolean;
  layout: string;
  paper: string;
  title: string;
  subtitle: string;
  author: string;
  date: string;
  number: string;
  panels: Panel[];
};

const blank = (kind: string): Panel => ({ kind, caption: "", image: "", text: "" });
const EMPTY: Sheet = {
  size: "A3",
  portrait: false,
  layout: "hero-right",
  paper: "#ffffff",
  title: "",
  subtitle: "",
  author: "",
  date: "",
  number: "01",
  panels: [blank("plan:g"), blank("elevation:front"), blank("section"), blank("text")],
};

type Book = { sheets: Sheet[]; current: number };
const EMPTY_BOOK: Book = { sheets: [EMPTY], current: 0 };

const SIZES: Record<string, [number, number]> = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };
const PAPERS = [
  { id: "#ffffff", name: "White" },
  { id: "#f6f3ec", name: "Warm paper" },
  { id: "#1f1f1f", name: "Charcoal" },
];

type Box = { x: number; y: number; w: number; h: number };

// Layouts split the drawing area (a box) into panels. `gap` is the space between.
const LAYOUTS: { id: string; name: string; split: (area: Box, gap: number) => Box[] }[] = [
  {
    id: "hero-right",
    name: "One large, three beside",
    split: (a, g) => {
      const big = (a.w - g) * 0.62;
      const side = a.w - g - big;
      const each = (a.h - g * 2) / 3;
      return [
        { x: a.x, y: a.y, w: big, h: a.h },
        ...[0, 1, 2].map((i) => ({ x: a.x + big + g, y: a.y + i * (each + g), w: side, h: each })),
      ];
    },
  },
  {
    id: "hero-below",
    name: "One large, three below",
    split: (a, g) => {
      const big = (a.h - g) * 0.62;
      const each = (a.w - g * 2) / 3;
      return [
        { x: a.x, y: a.y, w: a.w, h: big },
        ...[0, 1, 2].map((i) => ({ x: a.x + i * (each + g), y: a.y + big + g, w: each, h: a.h - g - big })),
      ];
    },
  },
  {
    id: "grid",
    name: "Four equal panels",
    split: (a, g) => {
      const w = (a.w - g) / 2;
      const h = (a.h - g) / 2;
      return [0, 1, 2, 3].map((i) => ({ x: a.x + (i % 2) * (w + g), y: a.y + Math.floor(i / 2) * (h + g), w, h }));
    },
  },
  {
    id: "columns",
    name: "Three columns",
    split: (a, g) => {
      const w = (a.w - g * 2) / 3;
      return [0, 1, 2].map((i) => ({ x: a.x + i * (w + g), y: a.y, w, h: a.h }));
    },
  },
];

const FONT = "Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Breaks text into lines that fit a width, a word at a time. */
function wrap(text: string, perLine: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if ((line + " " + word).trim().length > perLine && line) {
        lines.push(line);
        line = word;
      } else {
        line = (line + " " + word).trim();
      }
    }
    lines.push(line);
  }
  return lines;
}

export default function Portfolio() {
  const { active } = useProjects();
  // A project can have several sheets; one is shown at a time.
  const [saved, saveBook] = useSavedState<Partial<Book> & Partial<Sheet>>(
    projectKey(WORK_KEYS.portfolio, active.id),
    EMPTY_BOOK,
  );
  const sheets: Sheet[] =
    Array.isArray(saved.sheets) && saved.sheets.length > 0
      ? saved.sheets
      : [{ ...EMPTY, ...(Array.isArray(saved.panels) ? (saved as Sheet) : {}) }]; // a sheet saved before there were several
  const current = Math.min(Math.max(saved.current ?? 0, 0), sheets.length - 1);
  const sheet: Sheet = { ...EMPTY, ...sheets[current] };
  const update = (changes: Partial<Sheet>) =>
    saveBook({ sheets: sheets.map((item, i) => (i === current ? { ...sheet, ...changes } : item)), current });
  const number = (index: number) => String(index + 1).padStart(2, "0");
  const [savedPlan] = useSavedState<Partial<PlanDoc>>(projectKey(WORK_KEYS.plan, active.id), {});
  const [concept] = useSavedState<Record<string, unknown>>(projectKey(WORK_KEYS.concept, active.id), {});
  const svgRef = useRef<SVGSVGElement>(null);

  const plan: PlanDoc = {
    entities: (Array.isArray(savedPlan.entities) ? savedPlan.entities : []) as Entity[],
    floors: Array.isArray(savedPlan.floors) && savedPlan.floors.length > 0 ? savedPlan.floors : [GROUND_FLOOR],
    site: savedPlan.site ?? null,
    settings: { ...DEFAULT_SETTINGS, ...(savedPlan.settings ?? {}) } as Settings,
  };
  const floors = [...(plan.floors as Floor[])].sort((a, b) => a.level - b.level);
  const style = getStyle(plan.settings.style);
  const structure = { ...DEFAULT_STRUCTURE, ...(plan.settings.structure ?? {}) };

  const layout = LAYOUTS.find((item) => item.id === sheet.layout) ?? LAYOUTS[0];
  const [long, short] = SIZES[sheet.size] ?? SIZES.A3;
  const W = sheet.portrait ? short : long;
  const H = sheet.portrait ? long : short;
  const unit = W / 420; // everything scales with the sheet, measured against A3
  const margin = 12 * unit;
  const titleHeight = 30 * unit;
  const area: Box = { x: margin, y: margin, w: W - margin * 2, h: H - margin * 2 - titleHeight - 4 * unit };
  const boxes = layout.split(area, 5 * unit);
  const panels = boxes.map((_, index) => (Array.isArray(sheet.panels) ? sheet.panels[index] : undefined) ?? blank("none"));
  const dark = sheet.paper === "#1f1f1f";
  const ink = dark ? "#f2f2ef" : "#1f1f1f";
  const soft = dark ? "#a3a39e" : "#666663";

  function setPanel(index: number, changes: Partial<Panel>) {
    const next = boxes.map((_, i) => panels[i]);
    next[index] = { ...next[index], ...changes };
    update({ panels: next });
  }

  async function addImage(index: number, file: File | undefined) {
    if (!file) return;
    try {
      const photo = await loadPhoto(file, 1500);
      setPanel(index, { image: photo.href });
      if (!isSavedInBrowser(projectKey(WORK_KEYS.portfolio, active.id))) {
        window.alert("The picture was added, but this browser's saving space is full. Export the sheet now to keep it.");
      }
    } catch {
      window.alert("That file could not be opened as a picture. Please choose a JPG or PNG.");
    }
  }

  const options = [
    { id: "none", name: "Empty" },
    ...floors.map((floor) => ({ id: `plan:${floor.id}`, name: `Plan: ${floor.name}` })),
    ...VIEWS.map((view) => ({ id: `elevation:${view.id}`, name: `Elevation: ${view.name}` })),
    { id: "section", name: "Section" },
    { id: "image", name: "My own picture" },
    { id: "text", name: "Text" },
  ];

  function defaultCaption(kind: string): string {
    if (kind.startsWith("plan:")) {
      return `${floors.find((floor) => floor.id === kind.slice(5))?.name ?? "Floor"} plan`;
    }
    if (kind.startsWith("elevation:")) {
      return `${VIEWS.find((view) => view.id === kind.slice(10))?.name ?? ""} elevation`;
    }
    return { section: "Section A-A", text: "Concept", image: "", none: "" }[kind] ?? "";
  }

  // --- What goes inside one panel -----------------------------------------------
  function content(panel: Panel, box: Box) {
    const pad = 3 * unit;
    const inner = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 - 6 * unit };
    const frame = { x: inner.x, y: inner.y, width: inner.w, height: inner.h };

    if (panel.kind.startsWith("plan:")) {
      const floorId = panel.kind.slice(5);
      const doc: PlanDoc = {
        ...plan,
        entities: plan.entities.filter((e) => ((e as { floor?: string }).floor ?? GROUND_FLOOR.id) === floorId),
        settings: { ...plan.settings, grid: false },
      };
      const e = extents(doc);
      const m = 2.5 * doc.settings.scale * 8;
      return (
        <svg {...frame} viewBox={`${e.x - m} ${e.y - m} ${e.w + m * 2} ${e.h + m * 2}`} preserveAspectRatio="xMidYMid meet">
          <rect x={e.x - m} y={e.y - m} width={e.w + m * 2} height={e.h + m * 2} fill={style.paper} />
          <PlanDrawing doc={doc} />
        </svg>
      );
    }

    if (panel.kind.startsWith("elevation:")) {
      const e = buildElevation(plan, panel.kind.slice(10) as ViewId);
      if (e.faces.length === 0) return null;
      const m = 1500;
      const roof = roofOutline({ ...DEFAULT_ROOF, ...(plan.settings.roof ?? {}) }, e);
      return (
        <svg {...frame} viewBox={`${e.minU - m} ${-e.top - roof.rise - m} ${e.maxU - e.minU + m * 2} ${e.top + roof.rise + m * 1.6}`} preserveAspectRatio="xMidYMid meet">
          {e.faces.map((face) => (
            <g key={face.id}>
              <rect x={face.u1} y={-face.z2} width={face.u2 - face.u1} height={face.z2 - face.z1} fill={sheet.paper} stroke={face.curved ? "none" : ink} strokeWidth="1.2" />
              {face.openings.map((o) => (
                <rect key={o.id} x={o.u1} y={-o.z2} width={o.u2 - o.u1} height={o.z2 - o.z1} fill={dark ? "#3a4a50" : "#dbe7ea"} stroke={ink} strokeWidth="1" />
              ))}
            </g>
          ))}
          {roof.d && <path d={roof.d} fill={sheet.paper} stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />}
          <line x1={e.minU - m} y1={0} x2={e.maxU + m} y2={0} stroke={ink} strokeWidth="2.5" />
        </svg>
      );
    }

    if (panel.kind === "section") {
      const walls = plan.entities.filter((e) => e.kind === "wall");
      if (walls.length === 0) return null;
      const ys = walls.flatMap((w) => (w.kind === "wall" ? [w.a[1], w.b[1]] : []));
      const low = Math.min(...ys);
      const high = Math.max(...ys);
      // Choose a cut that crosses walls instead of running along one.
      let s = buildSection(plan, "front", (low + high) / 2);
      for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75]) {
        const trial = buildSection(plan, "front", low + (high - low) * fraction);
        if (trial.cuts.length >= 2 && trial.cuts.every((cut) => cut.u2 - cut.u1 < 1200)) {
          s = trial;
          break;
        }
      }
      const top = s.roofLevel + structure.slab;
      const ground = -structure.plinth;
      const m = 1500;
      return (
        <svg {...frame} viewBox={`${s.minU - m} ${-top - m} ${s.maxU - s.minU + m * 2} ${top - ground + m * 2}`} preserveAspectRatio="xMidYMid meet">
          {s.beyond.faces.map((face) => (
            <rect key={face.id} x={face.u1} y={-face.z2} width={face.u2 - face.u1} height={face.z2 - face.z1} fill={sheet.paper} stroke={ink} strokeOpacity="0.4" strokeWidth="0.8" />
          ))}
          {s.slabs.map((slab) => (
            <rect key={slab.level} x={slab.u1 - 115} y={-slab.level} width={slab.u2 - slab.u1 + 230} height={structure.slab} fill={ink} />
          ))}
          {s.roofSpan && (
            <rect x={s.roofSpan.u1 - 115} y={-top} width={s.roofSpan.u2 - s.roofSpan.u1 + 230} height={structure.slab} fill={ink} />
          )}
          {s.cuts.map((cut) => (
            <rect key={cut.id} x={cut.u1} y={-cut.z2} width={cut.u2 - cut.u1} height={cut.z2 - cut.z1} fill={ink} />
          ))}
          <path d={`M ${s.minU - m} ${-ground} H ${s.minU - 115} M ${s.maxU + 115} ${-ground} H ${s.maxU + m}`} stroke={ink} strokeWidth="2.5" />
        </svg>
      );
    }

    if (panel.kind === "image" && panel.image) {
      return (
        <svg {...frame} preserveAspectRatio="none">
          <image href={panel.image} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
        </svg>
      );
    }

    if (panel.kind === "text") {
      const size = 3.4 * unit;
      const lines = wrap(panel.text, Math.max(12, Math.floor(inner.w / (size * 0.5))));
      const room = Math.floor(inner.h / (size * 1.5));
      return (
        <text x={inner.x} y={inner.y + size} fontSize={size} fontFamily={SERIF} fill={ink}>
          {lines.slice(0, room).map((line, i) => (
            <tspan key={i} x={inner.x} dy={i === 0 ? 0 : size * 1.5}>
              {line || " "}
            </tspan>
          ))}
        </text>
      );
    }
    return null;
  }

  const conceptStatement = typeof concept.statement === "string" ? concept.statement : "";
  const field = "h-9 w-full rounded-md border border-line bg-surface px-2.5 text-[15px] outline-none focus:border-ink";
  const fileName = `sheet-${sheet.number}-${safeFileName(sheet.title || active.name)}`;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      {/* When printing, only the sheet is shown, at the chosen paper size. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .print-sheet, .print-sheet * { visibility: visible !important; }
        .print-sheet { position: fixed !important; left: 0; top: 0; width: 100vw !important; height: 100vh !important; max-height: none !important; }
        @page { size: ${sheet.size} ${sheet.portrait ? "portrait" : "landscape"}; margin: 0; }
      }`}</style>

      <p className="annotation text-accent">{active.name}</p>
      <h1 className="display mt-2 text-4xl sm:text-6xl">Portfolio sheet</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Lay out a presentation sheet from your project. Each panel can show a plan, an elevation,
        a section, a picture of your own, or text. Export it as a PDF or an image.
      </p>

      {/* The sheets of this project */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {sheets.map((item, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={index === current}
            onClick={() => saveBook({ sheets, current: index })}
            className={`rounded-md border px-3.5 py-2 text-[15px] transition-colors ${
              index === current ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
            }`}
          >
            Sheet {item.number || number(index)}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            saveBook({
              sheets: [...sheets, { ...EMPTY, size: sheet.size, portrait: sheet.portrait, paper: sheet.paper, title: sheet.title, author: sheet.author, date: sheet.date, number: number(sheets.length) }],
              current: sheets.length,
            })
          }
          className="rounded-md border border-line px-3.5 py-2 text-[15px] transition-colors hover:border-ink"
        >
          + New sheet
        </button>
        <button
          type="button"
          onClick={() =>
            saveBook({ sheets: [...sheets, { ...sheet, number: number(sheets.length) }], current: sheets.length })
          }
          className="rounded-md border border-line px-3.5 py-2 text-[15px] transition-colors hover:border-ink"
        >
          Duplicate
        </button>
        <button
          type="button"
          disabled={sheets.length < 2}
          onClick={() => {
            if (window.confirm("Delete this sheet? This cannot be undone.")) {
              saveBook({ sheets: sheets.filter((_, i) => i !== current), current: Math.max(0, current - 1) });
            }
          }}
          className="rounded-md border border-line px-3.5 py-2 text-[15px] text-muted transition-colors hover:border-ink hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete sheet
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        {/* The sheet */}
        <div className="self-start lg:col-span-8">
          <div className="overflow-hidden rounded-md border border-ink shadow-[8px_8px_0_0_var(--line)]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label="Portfolio sheet"
              className="sheet-svg print-sheet block max-h-[78vh] w-full"
              style={{ background: sheet.paper }}
            >
              <style>{".sheet-svg *{vector-effect:non-scaling-stroke}.sheet-svg pattern *{vector-effect:none}"}</style>
              <rect width={W} height={H} fill={sheet.paper} />

              {boxes.map((box, index) => {
                const panel = panels[index];
                const caption = panel.caption || defaultCaption(panel.kind);
                const inside = content(panel, box);
                return (
                  <g key={index}>
                    <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke={ink} strokeOpacity="0.25" strokeWidth="0.8" />
                    {inside ?? (
                      <text x={box.x + box.w / 2} y={box.y + box.h / 2} fontSize={3 * unit} fontFamily={FONT} fill={soft} textAnchor="middle">
                        {panel.kind === "none" ? `Panel ${index + 1}` : panel.kind === "image" ? "Add a picture" : "Nothing drawn yet"}
                      </text>
                    )}
                    {caption && (
                      <text x={box.x + 3 * unit} y={box.y + box.h - 2.6 * unit} fontSize={2.5 * unit} fontFamily={FONT} fill={soft} letterSpacing={0.3 * unit}>
                        {caption.toUpperCase()}
                        {panel.kind.startsWith("plan:") ? `  ·  1:${plan.settings.scale}` : ""}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Title block */}
              <g fontFamily={FONT} fill={ink}>
                <line x1={margin} y1={H - margin - titleHeight} x2={W - margin} y2={H - margin - titleHeight} stroke={ink} strokeWidth="1.5" />
                <text x={margin} y={H - margin - titleHeight + 13 * unit} fontSize={11 * unit} fontFamily={SERIF}>
                  {sheet.title || active.name}
                </text>
                <text x={margin} y={H - margin - titleHeight + 21 * unit} fontSize={3.6 * unit} fill={soft}>
                  {sheet.subtitle || [concept.type, concept.location].filter((v) => typeof v === "string" && v).join(" · ")}
                </text>
                {[
                  ["Drawn by", sheet.author || "—"],
                  ["Date", sheet.date || "—"],
                  ["Sheet", sheet.number || "01"],
                ].map(([label, value], i) => (
                  <g key={label} transform={`translate(${W - margin - (3 - i) * 46 * unit} ${H - margin - titleHeight})`}>
                    <line x1={0} y1={0} x2={0} y2={titleHeight} stroke={ink} strokeOpacity="0.3" strokeWidth="0.8" />
                    <text x={4 * unit} y={9 * unit} fontSize={2.4 * unit} fill={soft} letterSpacing={0.3 * unit}>
                      {label.toUpperCase()}
                    </text>
                    <text x={4 * unit} y={18 * unit} fontSize={4.6 * unit}>
                      {value}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="rounded-md bg-ink px-4 py-2.5 text-[15px] font-medium text-paper transition-colors hover:bg-accent hover:text-accent-ink">
              Print or save as PDF
            </button>
            {(["png", "svg"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => svgRef.current && exportSvgElement(svgRef.current, W, H, fileName, kind)}
                className="rounded-md border border-ink px-4 py-2.5 text-[15px] font-medium uppercase transition-colors hover:bg-ink hover:text-paper"
              >
                {kind}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-muted">
            For a PDF, choose &ldquo;Save as PDF&rdquo; as the printer and set margins to None.
          </p>
        </div>

        {/* Settings */}
        <div className="space-y-5 lg:col-span-4">
          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Sheet</h2>
            <div className="grid grid-cols-2 gap-3 p-5 text-[15px]">
              <label>
                <span className="mb-1 block text-muted">Size</span>
                <select value={sheet.size} onChange={(e) => update({ size: e.target.value })} className={field}>
                  {Object.keys(SIZES).map((size) => (
                    <option key={size}>{size}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-muted">Direction</span>
                <select value={sheet.portrait ? "p" : "l"} onChange={(e) => update({ portrait: e.target.value === "p" })} className={field}>
                  <option value="l">Landscape</option>
                  <option value="p">Portrait</option>
                </select>
              </label>
              <label className="col-span-2">
                <span className="mb-1 block text-muted">Layout</span>
                <select value={layout.id} onChange={(e) => update({ layout: e.target.value })} className={field}>
                  {LAYOUTS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2">
                <span className="mb-1 block text-muted">Paper</span>
                <select value={sheet.paper} onChange={(e) => update({ paper: e.target.value })} className={field}>
                  {PAPERS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Title block</h2>
            <div className="space-y-3 p-5 text-[15px]">
              {(
                [
                  ["title", "Project title", active.name],
                  ["subtitle", "Subtitle", "e.g. Primary school, Manipal"],
                  ["author", "Drawn by", "Your name"],
                  ["date", "Date", "e.g. November 2026"],
                  ["number", "Sheet number", "01"],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-muted">{label}</span>
                  <input type="text" value={sheet[key]} placeholder={hint} onChange={(e) => update({ [key]: e.target.value })} className={field} />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-line bg-paper">
            <h2 className="annotation border-b border-line px-5 py-3 text-muted">Panels</h2>
            <div className="divide-y divide-line">
              {boxes.map((_, index) => {
                const panel = panels[index];
                return (
                  <div key={index} className="space-y-2 p-5 text-[15px]">
                    <p className="font-mono text-[11px] text-muted">PANEL {index + 1}</p>
                    <select value={panel.kind} onChange={(e) => setPanel(index, { kind: e.target.value })} aria-label={`Panel ${index + 1} content`} className={field}>
                      {options.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {panel.kind !== "none" && (
                      <input type="text" value={panel.caption} placeholder={defaultCaption(panel.kind) || "Caption"} onChange={(e) => setPanel(index, { caption: e.target.value })} aria-label={`Panel ${index + 1} caption`} className={field} />
                    )}
                    {panel.kind === "image" && (
                      <label className="block cursor-pointer rounded-md border border-dashed border-line px-3 py-2.5 text-center text-[14px] text-muted hover:border-ink hover:text-ink">
                        {panel.image ? "Change picture" : "Choose a picture (a render, photo or sketch)"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => addImage(index, e.target.files?.[0])} />
                      </label>
                    )}
                    {panel.kind === "text" && (
                      <>
                        <textarea rows={5} value={panel.text} onChange={(e) => setPanel(index, { text: e.target.value })} placeholder="Write here, or use your concept statement." className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[15px] outline-none focus:border-ink" />
                        {conceptStatement && (
                          <button type="button" onClick={() => setPanel(index, { text: conceptStatement })} className="text-[14px] text-accent hover:underline">
                            Use my concept statement
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <p className="text-[13px] leading-relaxed text-muted">
            Drawings come from your{" "}
            <Link href="/studio/plan" className="text-accent hover:underline">
              floor plans
            </Link>
            . Elevations and sections appear here as clean line drawings; for their full versions
            with roof and materials, export an image from their pages and add it as a picture.
          </p>
        </div>
      </div>
    </div>
  );
}
