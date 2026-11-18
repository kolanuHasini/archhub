"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { loadPhoto } from "@/lib/image";
import { isSavedInBrowser, useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// The drawing is stored as a list of shapes (not pixels), so it stays sharp at
// any size and each shape can be selected, moved, resized or erased.
// ---------------------------------------------------------------------------

type ShapeKind =
  | "pen"
  | "line"
  | "curve"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text"
  | "image";
type Tool = Exclude<ShapeKind, "image"> | "select" | "eraser";

export type Shape = {
  id: string;
  tool: ShapeKind;
  color: string;
  size: number;
  // pen:   x1, y1, x2, y2, x3, y3 ...
  // curve: startX, startY, endX, endY, bendX, bendY
  // text:  x, y
  // other: startX, startY, endX, endY
  points: number[];
  text?: string;
  fontScale?: number; // text only: 1 = normal size
  href?: string; // image only: the picture itself
};

export type Sketch = { shapes: Shape[] };
export const EMPTY_SKETCH: Sketch = { shapes: [] };

// The sheet's own measuring units. The picture scales to fit any screen.
const SHEET_WIDTH = 1200;
const SHEET_HEIGHT = 750;
const HISTORY_LIMIT = 50;
const RESIZE_STEP = 1.2;
const PHOTO_MAX_PIXELS = 1100; // photos are shrunk to keep saving fast

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "pen", label: "Pen" },
  { id: "line", label: "Line" },
  { id: "curve", label: "Curve" },
  { id: "arrow", label: "Arrow" },
  { id: "rect", label: "Box" },
  { id: "ellipse", label: "Circle" },
  { id: "text", label: "Text" },
  { id: "eraser", label: "Eraser" },
];

const HINTS: Record<Tool, string> = {
  select:
    "Click a shape to select it. Drag to move it, or use Bigger, Smaller and Delete.",
  pen: "Click and drag on the sheet to draw freehand.",
  line: "Click and drag to draw a straight line.",
  curve: "Click and drag to draw a curve, then drag its blue dot to bend it.",
  arrow: "Click and drag to draw an arrow.",
  rect: "Click and drag to draw a box.",
  ellipse: "Click and drag to draw a circle or oval.",
  text: "Click on the sheet where the label should go.",
  eraser: "Click or drag over a drawn shape to remove it. (Photos: Select, then Delete.)",
};

const COLORS = [
  { value: "#1b1b1b", label: "Black" },
  { value: "#1f4e9c", label: "Blue" },
  { value: "#c0392b", label: "Red" },
  { value: "#2e7d4f", label: "Green" },
  { value: "#d98a1f", label: "Orange" },
  { value: "#8a8a84", label: "Grey" },
];

const SIZES = [
  { value: 2, label: "Thin" },
  { value: 4, label: "Medium" },
  { value: 8, label: "Thick" },
];

const SELECT_BLUE = "#1f4e9c";
const KINDS: ShapeKind[] = [
  "pen",
  "line",
  "curve",
  "arrow",
  "rect",
  "ellipse",
  "text",
  "image",
];

const round = (value: number) => Math.round(value * 10) / 10;

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isShape(value: unknown): value is Shape {
  if (!value || typeof value !== "object") return false;
  const shape = value as Shape;
  if (typeof shape.id !== "string" || !KINDS.includes(shape.tool)) return false;
  if (!Array.isArray(shape.points)) return false;
  if (!shape.points.every((point) => Number.isFinite(point))) return false;
  const needed = shape.tool === "curve" ? 6 : shape.tool === "text" || shape.tool === "pen" ? 2 : 4;
  if (shape.points.length < needed) return false;
  if (shape.tool === "image") {
    return typeof shape.href === "string" && shape.href.startsWith("data:image/");
  }
  return true;
}

function fontSize(shape: Shape): number {
  return (14 + shape.size * 3) * (shape.fontScale ?? 1);
}

type Box = { x: number; y: number; width: number; height: number };

function bounds(shape: Shape): Box {
  if (shape.tool === "text") {
    const size = fontSize(shape);
    return {
      x: shape.points[0],
      y: shape.points[1] - size,
      width: Math.max(20, (shape.text?.length ?? 1) * size * 0.56),
      height: size * 1.3,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < shape.points.length; i += 2) {
    minX = Math.min(minX, shape.points[i]);
    maxX = Math.max(maxX, shape.points[i]);
    minY = Math.min(minY, shape.points[i + 1]);
    maxY = Math.max(maxY, shape.points[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function moveShape(shape: Shape, dx: number, dy: number): Shape {
  return {
    ...shape,
    points: shape.points.map((point, index) =>
      round(point + (index % 2 === 0 ? dx : dy)),
    ),
  };
}

// Makes a shape bigger (factor above 1) or smaller, around its own centre.
function resizeShape(shape: Shape, factor: number): Shape {
  const box = bounds(shape);
  const largest = Math.max(box.width, box.height) * factor;
  if (largest > SHEET_WIDTH * 3 || largest < 6) return shape; // keep it sensible
  if (shape.tool === "text") {
    return { ...shape, fontScale: (shape.fontScale ?? 1) * factor };
  }
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  return {
    ...shape,
    points: shape.points.map((point, index) => {
      const centre = index % 2 === 0 ? centreX : centreY;
      return round(centre + (point - centre) * factor);
    }),
  };
}

// A new curve starts with a gentle bend to one side.
function defaultBend(x1: number, y1: number, x2: number, y2: number) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return [round(midX + (y2 - y1) * 0.25), round(midY - (x2 - x1) * 0.25)];
}

// The point in the middle of the curve, where the "bend" dot sits.
function curveMiddle(points: number[]): [number, number] {
  const [x1, y1, x2, y2, bx, by] = points;
  return [(x1 + 2 * bx + x2) / 4, (y1 + 2 * by + y2) / 4];
}

function penPath(points: number[]): string {
  if (points.length === 2) {
    // A single tap: draw a dot.
    return `M ${points[0]} ${points[1]} l 0.01 0`;
  }
  let path = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length; i += 2) {
    path += ` L ${points[i]} ${points[i + 1]}`;
  }
  return path;
}

function arrowHead(points: number[], size: number): string {
  const [x1, y1, x2, y2] = points;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = 10 + size * 2.5;
  const spread = Math.PI / 7;
  const ax = x2 - length * Math.cos(angle - spread);
  const ay = y2 - length * Math.sin(angle - spread);
  const bx = x2 - length * Math.cos(angle + spread);
  const by = y2 - length * Math.sin(angle + spread);
  return `M ${round(ax)} ${round(ay)} L ${x2} ${y2} L ${round(bx)} ${round(by)}`;
}

function ShapeView({ shape }: { shape: Shape }) {
  const [x1, y1, x2, y2] = shape.points;

  if (shape.tool === "image") {
    return (
      <g data-id={shape.id} data-kind="image">
        <image
          href={shape.href}
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          preserveAspectRatio="none"
        />
      </g>
    );
  }

  if (shape.tool === "text") {
    return (
      <g data-id={shape.id}>
        <text
          x={x1}
          y={y1}
          fontSize={fontSize(shape)}
          fontFamily="Arial, Helvetica, sans-serif"
          fill={shape.color}
          style={{ userSelect: "none" }}
        >
          {shape.text}
        </text>
      </g>
    );
  }

  // Each drawn shape appears twice: an invisible fat copy that is easy to
  // click or erase, and the visible copy on top.
  const invisible = {
    stroke: "transparent",
    strokeWidth: shape.size + 18,
    pointerEvents: "stroke" as const,
  };
  const visible = { stroke: shape.color, strokeWidth: shape.size };
  let body: React.ReactNode;

  if (shape.tool === "rect") {
    const box = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
    body = (
      <>
        <rect {...box} {...invisible} />
        <rect {...box} {...visible} />
      </>
    );
  } else if (shape.tool === "ellipse") {
    const oval = {
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
      rx: Math.abs(x2 - x1) / 2,
      ry: Math.abs(y2 - y1) / 2,
    };
    body = (
      <>
        <ellipse {...oval} {...invisible} />
        <ellipse {...oval} {...visible} />
      </>
    );
  } else {
    let d: string;
    if (shape.tool === "pen") {
      d = penPath(shape.points);
    } else if (shape.tool === "curve") {
      d = `M ${x1} ${y1} Q ${shape.points[4]} ${shape.points[5]} ${x2} ${y2}`;
    } else {
      d = `M ${x1} ${y1} L ${x2} ${y2}`;
      if (shape.tool === "arrow") d += ` ${arrowHead(shape.points, shape.size)}`;
    }
    body = (
      <>
        <path d={d} {...invisible} />
        <path d={d} {...visible} />
      </>
    );
  }

  return (
    <g data-id={shape.id} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {body}
    </g>
  );
}

type Drag =
  | { kind: "draw" }
  | { kind: "move"; original: Shape; startX: number; startY: number }
  | { kind: "bend"; original: Shape }
  | { kind: "erase" };

const toolButton = (active: boolean) =>
  `rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
    active
      ? "relative border-accent bg-accent text-accent-ink"
      : "border-ink hover:bg-ink hover:text-paper"
  }`;

const actionButton =
  "rounded-md border border-ink px-3 py-1.5 font-mono text-xs transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:opacity-60";

export default function SketchPad({
  storageKey,
  fileName = "concept-sketch",
}: {
  storageKey: string;
  fileName?: string;
}) {
  const [sketch, saveSketch] = useSavedState(storageKey, EMPTY_SKETCH);
  const shapes = Array.isArray(sketch.shapes)
    ? sketch.shapes.filter(isShape)
    : [];

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(SIZES[1].value);
  const [showGrid, setShowGrid] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The shape being drawn, moved or bent right now (not saved until you let go).
  const [draft, setDraft] = useState<Shape | null>(null);
  const [past, setPast] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);

  const svgRef = useRef<SVGSVGElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<Drag | null>(null);

  function commit(next: Shape[]) {
    setPast([...past, shapes].slice(-HISTORY_LIMIT));
    setFuture([]);
    saveSketch({ shapes: next });
  }

  function undo() {
    if (past.length === 0) return;
    setFuture([shapes, ...future]);
    saveSketch({ shapes: past[past.length - 1] });
    setPast(past.slice(0, -1));
  }

  function redo() {
    if (future.length === 0) return;
    setPast([...past, shapes]);
    saveSketch({ shapes: future[0] });
    setFuture(future.slice(1));
  }

  function clearAll() {
    if (shapes.length === 0) return;
    if (window.confirm("Clear the whole sketch? You can still undo this.")) {
      commit([]);
      setSelectedId(null);
    }
  }

  const selected = shapes.find((shape) => shape.id === selectedId) ?? null;

  function resizeSelected(factor: number) {
    if (!selected) return;
    const resized = resizeShape(selected, factor);
    if (resized === selected) return;
    commit(shapes.map((shape) => (shape.id === selected.id ? resized : shape)));
  }

  function deleteSelected() {
    if (!selected) return;
    commit(shapes.filter((shape) => shape.id !== selected.id));
    setSelectedId(null);
  }

  // Keyboard: Ctrl+Z / Ctrl+Y (Cmd on Mac) and Delete, unless you are typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = event.key.toLowerCase();
      if ((key === "delete" || key === "backspace") && selected) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Where on the sheet is the pointer?
  function sheetPoint(event: React.PointerEvent): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SHEET_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * SHEET_HEIGHT;
    return [
      round(Math.min(Math.max(x, 0), SHEET_WIDTH)),
      round(Math.min(Math.max(y, 0), SHEET_HEIGHT)),
    ];
  }

  function elementUnderPointer(event: React.PointerEvent): Element | null {
    return document.elementFromPoint(event.clientX, event.clientY);
  }

  function shapeUnderPointer(event: React.PointerEvent): Shape | undefined {
    const id = elementUnderPointer(event)
      ?.closest("[data-id]")
      ?.getAttribute("data-id");
    return id ? shapes.find((shape) => shape.id === id) : undefined;
  }

  function eraseUnderPointer(event: React.PointerEvent) {
    const hit = shapeUnderPointer(event);
    // Photos are not erased by accident; use Select and Delete for those.
    if (hit && hit.tool !== "image") {
      commit(shapes.filter((shape) => shape.id !== hit.id));
      if (hit.id === selectedId) setSelectedId(null);
    }
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const [x, y] = sheetPoint(event);

    // The blue dot on a selected curve can be dragged with any tool.
    if (selected?.tool === "curve" && elementUnderPointer(event)?.closest("[data-handle]")) {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { kind: "bend", original: selected };
      setDraft(selected);
      return;
    }

    if (tool === "text") {
      const text = window.prompt("Type your label:");
      if (text && text.trim()) {
        const id = newId();
        commit([
          ...shapes,
          {
            id,
            tool: "text",
            color,
            size,
            points: [x, y],
            text: text.trim().slice(0, 200),
          },
        ]);
        setSelectedId(id);
      }
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "eraser") {
      dragRef.current = { kind: "erase" };
      eraseUnderPointer(event);
      return;
    }

    if (tool === "select") {
      const hit = shapeUnderPointer(event);
      setSelectedId(hit ? hit.id : null);
      if (hit) {
        dragRef.current = { kind: "move", original: hit, startX: x, startY: y };
        setDraft(hit);
      }
      return;
    }

    dragRef.current = { kind: "draw" };
    setDraft({
      id: newId(),
      tool,
      color,
      size,
      points:
        tool === "pen"
          ? [x, y]
          : tool === "curve"
            ? [x, y, x, y, x, y]
            : [x, y, x, y],
    });
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const [x, y] = sheetPoint(event);

    if (drag.kind === "erase") {
      eraseUnderPointer(event);
    } else if (drag.kind === "move") {
      setDraft(moveShape(drag.original, x - drag.startX, y - drag.startY));
    } else if (drag.kind === "bend") {
      // Put the middle of the curve exactly under the pointer.
      const [x1, y1, x2, y2] = drag.original.points;
      setDraft({
        ...drag.original,
        points: [
          x1,
          y1,
          x2,
          y2,
          round(2 * x - (x1 + x2) / 2),
          round(2 * y - (y1 + y2) / 2),
        ],
      });
    } else {
      // Always build on the newest draft, even when the pointer moves fast.
      setDraft((current) => {
        if (!current) return current;
        const [startX, startY] = current.points;
        if (current.tool === "curve") {
          return {
            ...current,
            points: [startX, startY, x, y, ...defaultBend(startX, startY, x, y)],
          };
        }
        if (current.tool !== "pen") {
          return { ...current, points: [startX, startY, x, y] };
        }
        const lastX = current.points[current.points.length - 2];
        const lastY = current.points[current.points.length - 1];
        // Skip tiny movements so strokes stay light and smooth.
        if (Math.hypot(x - lastX, y - lastY) < 2) return current;
        return { ...current, points: [...current.points, x, y] };
      });
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !draft) {
      setDraft(null);
      return;
    }

    if (drag.kind === "move" || drag.kind === "bend") {
      const changed = draft.points.some(
        (point, index) => point !== drag.original.points[index],
      );
      if (changed) {
        commit(shapes.map((shape) => (shape.id === draft.id ? draft : shape)));
      }
    } else if (drag.kind === "draw") {
      const [x1, y1, x2, y2] = draft.points;
      const tooSmall =
        draft.tool !== "pen" && Math.hypot(x2 - x1, y2 - y1) < 4;
      if (!tooSmall) {
        commit([...shapes, draft]);
        // Select a new curve straight away so its bend dot shows.
        setSelectedId(draft.tool === "curve" ? draft.id : null);
      }
    }
    setDraft(null);
  }

  async function addPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow picking the same photo again later
    if (!file) return;
    try {
      const photo = await loadPhoto(file, PHOTO_MAX_PIXELS);
      // Fit the photo inside the sheet, with a margin, and centre it.
      const fit = Math.min(
        (SHEET_WIDTH * 0.8) / photo.width,
        (SHEET_HEIGHT * 0.8) / photo.height,
      );
      const width = photo.width * fit;
      const height = photo.height * fit;
      const x = (SHEET_WIDTH - width) / 2;
      const y = (SHEET_HEIGHT - height) / 2;
      const id = newId();
      commit([
        ...shapes,
        {
          id,
          tool: "image",
          color: "",
          size: 0,
          points: [round(x), round(y), round(x + width), round(y + height)],
          href: photo.href,
        },
      ]);
      setSelectedId(id);
      setTool("select");
      if (!isSavedInBrowser(storageKey)) {
        window.alert(
          "The photo was added, but this browser has run out of saving space. Use \"Save project file\" to keep your work, or remove a photo.",
        );
      }
    } catch {
      window.alert(
        "That file could not be opened as a picture. Please choose a JPG or PNG photo.",
      );
    }
  }

  function downloadImage() {
    const svg = svgRef.current;
    if (!svg) return;
    const scale = 2; // sharper picture
    const copy = svg.cloneNode(true) as SVGSVGElement;
    // Leave out the selection outline and handles.
    copy.querySelectorAll("[data-export='skip']").forEach((node) => node.remove());
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(SHEET_WIDTH * scale));
    copy.setAttribute("height", String(SHEET_HEIGHT * scale));
    const source = new XMLSerializer().serializeToString(copy);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SHEET_WIDTH * scale;
      canvas.height = SHEET_HEIGHT * scale;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${fileName}.png`);
      }, "image/png");
    };
    image.onerror = () =>
      window.alert("Sorry, the image could not be created in this browser.");
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  // While moving or bending a shape, show the changed copy, not the saved one.
  const draftIsExisting =
    draft !== null && shapes.some((shape) => shape.id === draft.id);
  const currentShapes = !draft
    ? shapes
    : draftIsExisting
      ? shapes.map((shape) => (shape.id === draft.id ? draft : shape))
      : [...shapes, draft];
  // Photos always sit at the back, so you can trace over them.
  const visibleShapes = [
    ...currentShapes.filter((shape) => shape.tool === "image"),
    ...currentShapes.filter((shape) => shape.tool !== "image"),
  ];
  const shownSelected =
    visibleShapes.find((shape) => shape.id === selectedId) ?? null;
  const selectedBox = shownSelected ? bounds(shownSelected) : null;
  const bendDot =
    shownSelected?.tool === "curve" ? curveMiddle(shownSelected.points) : null;

  const cursor =
    tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";

  return (
    <div className="space-y-3">
      {/* Tools */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Drawing tool" className="flex flex-wrap gap-1">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
              className={toolButton(tool === item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className={actionButton}
        >
          Add photo of a paper sketch
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={addPhoto}
          aria-label="Add photo of a paper sketch"
          className="hidden"
        />
      </div>

      {/* Colour, thickness, actions */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Colour" className="flex gap-1.5">
          {COLORS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-label={item.label}
              title={item.label}
              aria-pressed={color === item.value}
              onClick={() => setColor(item.value)}
              className={`h-7 w-7 rounded-full border ${
                color === item.value
                  ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-surface"
                  : "border-ink"
              }`}
              style={{ backgroundColor: item.value }}
            />
          ))}
        </div>

        <div role="group" aria-label="Line thickness" className="flex gap-1">
          {SIZES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={size === item.value}
              onClick={() => setSize(item.value)}
              className={toolButton(size === item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={past.length === 0}
            className={actionButton}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            className={actionButton}
          >
            Redo
          </button>
          <button
            type="button"
            aria-pressed={showGrid}
            onClick={() => setShowGrid(!showGrid)}
            className={actionButton}
          >
            Grid {showGrid ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={shapes.length === 0}
            className={actionButton}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Actions for the selected shape */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-xs text-muted">
          {selected ? "Selected shape:" : "No shape selected:"}
        </span>
        <button
          type="button"
          onClick={() => resizeSelected(RESIZE_STEP)}
          disabled={!selected}
          className={actionButton}
        >
          Bigger +
        </button>
        <button
          type="button"
          onClick={() => resizeSelected(1 / RESIZE_STEP)}
          disabled={!selected}
          className={actionButton}
        >
          Smaller −
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!selected}
          className={actionButton}
        >
          Delete
        </button>
      </div>

      {/* The sheet. It is always white, like paper, in light and dark mode. */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`}
        role="img"
        aria-label="Concept sketch sheet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="block w-full rounded-xl border border-line"
        style={{ touchAction: "none", cursor, backgroundColor: "#ffffff" }}
      >
        <defs>
          <pattern
            id="sketch-grid"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="#dfe6f2"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width={SHEET_WIDTH} height={SHEET_HEIGHT} fill="#ffffff" />
        {showGrid && (
          <rect
            width={SHEET_WIDTH}
            height={SHEET_HEIGHT}
            fill="url(#sketch-grid)"
          />
        )}
        {visibleShapes.map((shape) => (
          <ShapeView key={shape.id} shape={shape} />
        ))}
        {selectedBox && (
          <rect
            data-export="skip"
            x={selectedBox.x - 8}
            y={selectedBox.y - 8}
            width={selectedBox.width + 16}
            height={selectedBox.height + 16}
            fill="none"
            stroke={SELECT_BLUE}
            strokeWidth="1.5"
            strokeDasharray="6 5"
            pointerEvents="none"
          />
        )}
        {bendDot && (
          <circle
            data-export="skip"
            data-handle="bend"
            cx={bendDot[0]}
            cy={bendDot[1]}
            r="11"
            fill={SELECT_BLUE}
            stroke="#ffffff"
            strokeWidth="3"
            style={{ cursor: "grab" }}
          />
        )}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{HINTS[tool]}</p>
        <button
          type="button"
          onClick={downloadImage}
          disabled={shapes.length === 0}
          className={actionButton}
        >
          Download sketch as image
        </button>
      </div>
    </div>
  );
}
