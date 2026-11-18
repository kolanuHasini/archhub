"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// The drawing is stored as a list of shapes (not pixels), so it stays sharp at
// any size and each shape can be moved or erased on its own.
// ---------------------------------------------------------------------------

type DrawTool = "pen" | "line" | "arrow" | "rect" | "ellipse" | "text";
type Tool = DrawTool | "move" | "eraser";

export type Shape = {
  id: string;
  tool: DrawTool;
  color: string;
  size: number;
  // pen: x1, y1, x2, y2, x3, y3 ...   others: startX, startY, endX, endY
  points: number[];
  text?: string;
};

export type Sketch = { shapes: Shape[] };
export const EMPTY_SKETCH: Sketch = { shapes: [] };

// The sheet's own measuring units. The picture scales to fit any screen.
const SHEET_WIDTH = 1200;
const SHEET_HEIGHT = 750;
const HISTORY_LIMIT = 50;

const TOOLS: { id: Tool; label: string }[] = [
  { id: "pen", label: "Pen" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "rect", label: "Box" },
  { id: "ellipse", label: "Circle" },
  { id: "text", label: "Text" },
  { id: "move", label: "Move" },
  { id: "eraser", label: "Eraser" },
];

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

const round = (value: number) => Math.round(value * 10) / 10;

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isShape(value: unknown): value is Shape {
  if (!value || typeof value !== "object") return false;
  const shape = value as Shape;
  return (
    typeof shape.id === "string" &&
    typeof shape.tool === "string" &&
    Array.isArray(shape.points) &&
    shape.points.length >= 2 &&
    shape.points.every((point) => Number.isFinite(point))
  );
}

function moveShape(shape: Shape, dx: number, dy: number): Shape {
  return {
    ...shape,
    points: shape.points.map((point, index) =>
      round(point + (index % 2 === 0 ? dx : dy)),
    ),
  };
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

// One shape, drawn twice: an invisible fat copy that is easy to click or
// erase, and the visible copy on top.
function ShapeView({ shape }: { shape: Shape }) {
  const [x1, y1, x2, y2] = shape.points;

  if (shape.tool === "text") {
    return (
      <g data-id={shape.id}>
        <text
          x={x1}
          y={y1}
          fontSize={14 + shape.size * 3}
          fontFamily="Arial, Helvetica, sans-serif"
          fill={shape.color}
          style={{ userSelect: "none" }}
        >
          {shape.text}
        </text>
      </g>
    );
  }

  let geometry: (props: React.SVGProps<SVGElement>) => React.ReactNode;

  if (shape.tool === "pen") {
    const d = penPath(shape.points);
    geometry = (props) => (
      <path d={d} {...(props as React.SVGProps<SVGPathElement>)} />
    );
  } else if (shape.tool === "line" || shape.tool === "arrow") {
    const d =
      `M ${x1} ${y1} L ${x2} ${y2}` +
      (shape.tool === "arrow" ? ` ${arrowHead(shape.points, shape.size)}` : "");
    geometry = (props) => (
      <path d={d} {...(props as React.SVGProps<SVGPathElement>)} />
    );
  } else if (shape.tool === "rect") {
    geometry = (props) => (
      <rect
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)}
        height={Math.abs(y2 - y1)}
        {...(props as React.SVGProps<SVGRectElement>)}
      />
    );
  } else {
    geometry = (props) => (
      <ellipse
        cx={(x1 + x2) / 2}
        cy={(y1 + y2) / 2}
        rx={Math.abs(x2 - x1) / 2}
        ry={Math.abs(y2 - y1) / 2}
        {...(props as React.SVGProps<SVGEllipseElement>)}
      />
    );
  }

  return (
    <g data-id={shape.id} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {geometry({
        stroke: "transparent",
        strokeWidth: shape.size + 18,
        pointerEvents: "stroke",
      })}
      {geometry({ stroke: shape.color, strokeWidth: shape.size })}
    </g>
  );
}

type Drag =
  | { kind: "draw" }
  | { kind: "move"; original: Shape; startX: number; startY: number }
  | { kind: "erase" };

const toolButton = (active: boolean) =>
  `-ml-px border px-3 py-1.5 font-mono text-xs first:ml-0 ${
    active
      ? "relative border-accent bg-accent text-accent-ink"
      : "border-ink hover:border-accent hover:text-accent"
  }`;

const actionButton =
  "border border-ink px-3 py-1.5 font-mono text-xs hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:opacity-60";

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
  // The shape being drawn or moved right now (not saved until you let go).
  const [draft, setDraft] = useState<Shape | null>(null);
  const [past, setPast] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);

  const svgRef = useRef<SVGSVGElement>(null);
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
    }
  }

  // Ctrl+Z / Ctrl+Y (Cmd on Mac), unless you are typing in a text box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
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

  function shapeUnderPointer(event: React.PointerEvent): Shape | undefined {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const id = element?.closest("[data-id]")?.getAttribute("data-id");
    return id ? shapes.find((shape) => shape.id === id) : undefined;
  }

  function eraseUnderPointer(event: React.PointerEvent) {
    const hit = shapeUnderPointer(event);
    if (hit) commit(shapes.filter((shape) => shape.id !== hit.id));
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const [x, y] = sheetPoint(event);

    if (tool === "text") {
      const text = window.prompt("Type your label:");
      if (text && text.trim()) {
        commit([
          ...shapes,
          {
            id: newId(),
            tool: "text",
            color,
            size,
            points: [x, y],
            text: text.trim().slice(0, 200),
          },
        ]);
      }
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "eraser") {
      dragRef.current = { kind: "erase" };
      eraseUnderPointer(event);
      return;
    }

    if (tool === "move") {
      const hit = shapeUnderPointer(event);
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
      points: tool === "pen" ? [x, y] : [x, y, x, y],
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
    } else {
      // Always build on the newest draft, even when the pointer moves fast.
      setDraft((current) => {
        if (!current) return current;
        if (current.tool !== "pen") {
          return {
            ...current,
            points: [current.points[0], current.points[1], x, y],
          };
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

    if (drag.kind === "move") {
      const moved =
        draft.points[0] !== drag.original.points[0] ||
        draft.points[1] !== drag.original.points[1];
      if (moved) {
        commit(shapes.map((shape) => (shape.id === draft.id ? draft : shape)));
      }
    } else if (drag.kind === "draw") {
      const [x1, y1, x2, y2] = draft.points;
      const tooSmall =
        draft.tool !== "pen" && Math.hypot(x2 - x1, y2 - y1) < 4;
      if (!tooSmall) commit([...shapes, draft]);
    }
    setDraft(null);
  }

  function downloadImage() {
    const svg = svgRef.current;
    if (!svg) return;
    const scale = 2; // sharper picture
    const copy = svg.cloneNode(true) as SVGSVGElement;
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

  // While moving a shape, show the moved copy instead of the saved one.
  const draftIsExisting =
    draft !== null && shapes.some((shape) => shape.id === draft.id);
  const visibleShapes = !draft
    ? shapes
    : draftIsExisting
      ? shapes.map((shape) => (shape.id === draft.id ? draft : shape))
      : [...shapes, draft];

  const cursor =
    tool === "move" ? "grab" : tool === "text" ? "text" : "crosshair";

  return (
    <div className="space-y-3">
      {/* Tools */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Drawing tool" className="flex flex-wrap">
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
              className={`h-7 w-7 border ${
                color === item.value
                  ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-surface"
                  : "border-ink"
              }`}
              style={{ backgroundColor: item.value }}
            />
          ))}
        </div>

        <div role="group" aria-label="Line thickness" className="flex">
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
        className="block w-full border border-ink"
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
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {tool === "text"
            ? "Click on the sheet where the label should go."
            : tool === "move"
              ? "Drag any shape to move it."
              : tool === "eraser"
                ? "Click or drag over a shape to remove it."
                : "Click and drag on the sheet to draw."}
        </p>
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
