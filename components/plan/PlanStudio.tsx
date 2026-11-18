"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import PlanDrawing from "@/components/plan/PlanDrawing";
import {
  Btn,
  NumInput,
  Row,
  Section,
  Select,
  TextInput,
  Toggle,
} from "@/components/plan/ui";
import { downloadBlob } from "@/lib/download";
import { dropOrphanOpenings, exportDxf, importDxf } from "@/lib/plan/dxf";
import { FURNITURE, getFurniture } from "@/lib/plan/furniture";
import {
  add,
  angleDeg,
  dist,
  extents,
  formatArea,
  formatAreaFeet,
  formatLength,
  mid,
  moveEntity,
  mul,
  parseLength,
  polygonArea,
  project,
  roundPt,
  unit,
  wallCorners,
  wallJunctionCorners,
  type Box,
} from "@/lib/plan/geometry";
import { PLAN_STYLES, getStyle } from "@/lib/plan/styles";
import {
  DEFAULT_SETTINGS,
  DOOR_STYLES,
  EMPTY_PLAN,
  FLOOR_FINISHES,
  LAYERS,
  SCALES,
  TREE_STYLES,
  WALL_THICKNESSES,
  WINDOW_STYLES,
  newId,
  type Entity,
  type Opening,
  type PlanDoc,
  type Pt,
  type Room,
  type Settings,
  type Site,
  type Wall,
} from "@/lib/plan/types";
import { useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// The Floor Plan Studio workspace: tools on the left, the drawing in the
// middle, properties on the right, and a command line along the bottom.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "archhub.plan.v1";
const PLANNER_KEY = "archhub.concept-planner.v1";
const ACCENT = "#4c8dff";
const HISTORY_LIMIT = 60;

type ToolId =
  | "select"
  | "pan"
  | "wall"
  | "door"
  | "window"
  | "room"
  | "dim"
  | "line"
  | "furn"
  | "tree"
  | "text";

const TOOLS: { id: ToolId; label: string; key: string; group: string }[] = [
  { id: "select", label: "Select", key: "V", group: "Edit" },
  { id: "pan", label: "Pan", key: "H", group: "Edit" },
  { id: "wall", label: "Wall", key: "W", group: "Build" },
  { id: "door", label: "Door", key: "D", group: "Build" },
  { id: "window", label: "Window", key: "N", group: "Build" },
  { id: "room", label: "Room", key: "R", group: "Build" },
  { id: "furn", label: "Furniture", key: "F", group: "Place" },
  { id: "tree", label: "Tree", key: "T", group: "Place" },
  { id: "dim", label: "Dimension", key: "M", group: "Annotate" },
  { id: "line", label: "Line", key: "L", group: "Annotate" },
  { id: "text", label: "Text", key: "X", group: "Annotate" },
];

const FACING_BEARING: Record<string, number> = {
  North: 0,
  "North-east": 45,
  East: 90,
  "South-east": 135,
  South: 180,
  "South-west": 225,
  West: 270,
  "North-west": 315,
};

type View = { cx: number; cy: number; zoom: number }; // zoom = pixels per mm
type Snap = { p: Pt; kind: string | null };
type Drag =
  | { kind: "pan"; x: number; y: number; cx: number; cy: number }
  | { kind: "move"; original: Entity; start: Pt; x: number; y: number; moved: boolean }
  | { kind: "grip"; original: Entity; grip: string };

function isEntity(value: unknown): value is Entity {
  if (!value || typeof value !== "object") return false;
  const entity = value as { id?: unknown; kind?: unknown };
  return typeof entity.id === "string" && typeof entity.kind === "string";
}

function fitView(box: Box, size: { w: number; h: number }): View {
  const zoom = Math.min(size.w / (box.w * 1.35), size.h / (box.h * 1.35));
  return {
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    zoom: Math.min(Math.max(zoom, 0.004), 2),
  };
}

function readPlanFile(text: string): PlanDoc | null {
  try {
    const data = JSON.parse(text);
    if (!data || data.app !== "archhub" || data.kind !== "plan") return null;
    const plan = data.plan ?? {};
    return {
      entities: Array.isArray(plan.entities) ? plan.entities.filter(isEntity) : [],
      site: plan.site && Number.isFinite(plan.site.w) ? plan.site : null,
      settings: { ...DEFAULT_SETTINGS, ...(plan.settings ?? {}) },
    };
  } catch {
    return null;
  }
}

/** A clean copy of the drawing (no grid or tool marks), fitted to its extents. */
function buildExportSvg(svg: SVGSVGElement, doc: PlanDoc) {
  const box = extents(doc);
  const margin = 2.5 * doc.settings.scale * 9;
  const x = box.x - margin;
  const y = box.y - margin;
  const w = box.w + margin * 2;
  const h = box.h + margin * 2;
  const longSide = 2600;
  const pixels = longSide / Math.max(w, h);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll("[data-export='skip']").forEach((node) => node.remove());
  const paper = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  paper.setAttribute("x", String(x));
  paper.setAttribute("y", String(y));
  paper.setAttribute("width", String(w));
  paper.setAttribute("height", String(h));
  paper.setAttribute("fill", getStyle(doc.settings.style).paper);
  copy.insertBefore(paper, copy.firstChild);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  copy.setAttribute("width", String(Math.round(w * pixels)));
  copy.setAttribute("height", String(Math.round(h * pixels)));
  copy.removeAttribute("class");
  copy.removeAttribute("style");
  return {
    source: new XMLSerializer().serializeToString(copy),
    width: Math.round(w * pixels),
    height: Math.round(h * pixels),
  };
}

export default function PlanStudio() {
  const [saved, saveDoc] = useSavedState(STORAGE_KEY, EMPTY_PLAN);
  const doc: PlanDoc = useMemo(
    () => ({
      entities: Array.isArray(saved.entities) ? saved.entities.filter(isEntity) : [],
      site: saved.site && Number.isFinite(saved.site.w) ? saved.site : null,
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
    }),
    [saved],
  );
  const { settings } = doc;

  const [tool, setToolState] = useState<ToolId>("wall");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [points, setPoints] = useState<Pt[]>([]); // clicks so far with this tool
  const [cursor, setCursor] = useState<Snap | null>(null);
  const [buffer, setBuffer] = useState(""); // a length being typed
  const [override, setOverride] = useState<Entity | null>(null); // being dragged
  const [hoverOpening, setHoverOpening] = useState<{ wallId: string; pos: number } | null>(null);
  const [view, setView] = useState<View | null>(null); // null = fit to drawing
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [past, setPast] = useState<PlanDoc[]>([]);
  const [future, setFuture] = useState<PlanDoc[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const [options, setOptions] = useState({
    doorStyle: "single",
    doorWidth: 900,
    windowStyle: "casement",
    windowWidth: 1200,
    treeStyle: "canopy",
    treeRadius: 1500,
    furnItem: FURNITURE[0].id,
    furnRot: 0,
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const dxfRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const viewRef = useRef<View>({ cx: 0, cy: 0, zoom: 0.05 });

  const v = view ?? fitView(extents(doc), size);
  const px = 1 / v.zoom; // one screen pixel, in millimetres
  const letter = 2.5 * settings.scale;
  const style = getStyle(settings.style);

  const walls = useMemo(
    () => doc.entities.filter((e): e is Wall => e.kind === "wall"),
    [doc.entities],
  );
  const rooms = doc.entities.filter((e): e is Room => e.kind === "room");
  const shown: PlanDoc = override
    ? { ...doc, entities: doc.entities.map((e) => (e.id === override.id ? override : e)) }
    : doc;
  const selected = shown.entities.find((e) => e.id === selectedId) ?? null;

  // --- Saving, undo, redo ------------------------------------------------------

  function commit(entities: Entity[], extra?: Partial<PlanDoc>) {
    setPast([...past, doc].slice(-HISTORY_LIMIT));
    setFuture([]);
    saveDoc({ ...doc, entities, ...extra });
  }

  function undo() {
    if (past.length === 0) return;
    setFuture([doc, ...future]);
    saveDoc(past[past.length - 1]);
    setPast(past.slice(0, -1));
  }

  function redo() {
    if (future.length === 0) return;
    setPast([...past, doc]);
    saveDoc(future[0]);
    setFuture(future.slice(1));
  }

  function setSettings(changes: Partial<Settings>) {
    saveDoc({ ...doc, settings: { ...settings, ...changes } });
  }

  function updateEntity(next: Entity) {
    commit(doc.entities.map((e) => (e.id === next.id ? next : e)));
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit(dropOrphanOpenings(doc.entities.filter((e) => e.id !== selectedId)));
    setSelectedId(null);
  }

  function setTool(next: ToolId) {
    setToolState(next);
    setPoints([]);
    setBuffer("");
    setHoverOpening(null);
    if (next !== "select") setSelectedId(null);
  }

  // --- Snapping ------------------------------------------------------------------

  const snapTargets = useMemo(() => {
    const targets: { p: Pt; kind: string; owner?: string }[] = [];
    for (const entity of doc.entities) {
      if (entity.kind === "wall" || entity.kind === "line") {
        targets.push({ p: entity.a, kind: "Endpoint", owner: entity.id });
        targets.push({ p: entity.b, kind: "Endpoint", owner: entity.id });
        targets.push({ p: mid(entity.a, entity.b), kind: "Midpoint", owner: entity.id });
      }
    }
    for (const corner of wallJunctionCorners(walls)) {
      targets.push({ p: corner, kind: "Corner" });
    }
    if (doc.site) {
      const { w, d } = doc.site;
      for (const p of [[0, 0], [w, 0], [w, d], [0, d]] as Pt[]) {
        targets.push({ p, kind: "Site corner" });
      }
    }
    return targets;
  }, [doc.entities, doc.site, walls]);

  function snapPoint(raw: Pt, from: Pt | null, shift: boolean, exclude?: string): Snap {
    const reach = 11 * px;
    if (settings.snap) {
      let best: Snap | null = null;
      let bestDistance = reach;
      for (const target of snapTargets) {
        if (exclude && target.owner === exclude) continue;
        const distance = dist(raw, target.p);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { p: target.p, kind: target.kind };
        }
      }
      if (best) return best;
    }
    const ortho = settings.ortho !== shift; // holding Shift flips the setting
    if (from && ortho) {
      const angle = Math.atan2(raw[1] - from[1], raw[0] - from[0]);
      const step = Math.PI / 4;
      const locked = Math.round(angle / step) * step;
      let length = dist(raw, from);
      if (settings.snap) length = Math.round(length / 10) * 10;
      return {
        p: roundPt([from[0] + Math.cos(locked) * length, from[1] + Math.sin(locked) * length]),
        kind: null,
      };
    }
    if (settings.snap) {
      for (const wall of walls) {
        if (exclude === wall.id) continue;
        const hit = project(raw, wall.a, wall.b);
        if (hit.distance < reach * 0.8) return { p: roundPt(hit.point), kind: "On wall" };
      }
      return { p: [Math.round(raw[0] / 50) * 50, Math.round(raw[1] / 50) * 50], kind: null };
    }
    return { p: roundPt(raw), kind: null };
  }

  // --- Screen and model positions ---------------------------------------------------

  function toModel(event: { clientX: number; clientY: number }): Pt {
    // Ask the browser for the exact mapping, so the position is right even
    // while the window is being resized.
    const svg = svgRef.current!;
    const matrix = svg.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse(),
      );
      return [point.x, point.y];
    }
    const rect = svg.getBoundingClientRect();
    return [
      v.cx + (event.clientX - rect.left - rect.width / 2) / v.zoom,
      v.cy + (event.clientY - rect.top - rect.height / 2) / v.zoom,
    ];
  }

  useEffect(() => {
    viewRef.current = v;
  });

  // Keep track of the canvas size.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const observer = new ResizeObserver(() => {
      setSize({ w: holder.clientWidth || 900, h: holder.clientHeight || 600 });
    });
    observer.observe(holder);
    return () => observer.disconnect();
  }, []);

  // Mouse wheel zooms towards the pointer.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const current = viewRef.current;
      const rect = svg!.getBoundingClientRect();
      const offsetX = event.clientX - rect.left - rect.width / 2;
      const offsetY = event.clientY - rect.top - rect.height / 2;
      const zoom = Math.min(
        Math.max(current.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), 0.003),
        4,
      );
      const modelX = current.cx + offsetX / current.zoom;
      const modelY = current.cy + offsetY / current.zoom;
      setView({ cx: modelX - offsetX / zoom, cy: modelY - offsetY / zoom, zoom });
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  function zoomBy(factor: number) {
    setView({ ...v, zoom: Math.min(Math.max(v.zoom * factor, 0.003), 4) });
  }

  // --- Making things -------------------------------------------------------------------

  function addSegment(a: Pt, b: Pt) {
    if (dist(a, b) < 10) return;
    const entity: Entity =
      tool === "wall"
        ? { id: newId(), kind: "wall", a, b, t: settings.wallT, h: settings.wallH }
        : { id: newId(), kind: "line", a, b };
    commit([...doc.entities, entity]);
    setPoints([b]);
    setBuffer("");
  }

  function finishRoom() {
    if (points.length < 3) return;
    const room: Room = {
      id: newId(),
      kind: "room",
      pts: points,
      name: `Room ${rooms.length + 1}`,
      finish: "none",
    };
    commit([...doc.entities, room]);
    setPoints([]);
    setToolState("select");
    setSelectedId(room.id);
  }

  function findOpeningSpot(raw: Pt, width: number) {
    let best: { wallId: string; pos: number } | null = null;
    let bestDistance = Infinity;
    for (const wall of walls) {
      const length = dist(wall.a, wall.b);
      if (length < width) continue;
      const hit = project(raw, wall.a, wall.b);
      if (hit.distance < wall.t / 2 + 16 * px && hit.distance < bestDistance) {
        bestDistance = hit.distance;
        const pos = Math.min(
          Math.max(Math.round(hit.along / 10) * 10, width / 2),
          length - width / 2,
        );
        best = { wallId: wall.id, pos };
      }
    }
    return best;
  }

  // --- Pointer ------------------------------------------------------------------------

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button === 2) return;
    // Once you start working, the view stays put instead of re-fitting itself.
    if (!view) setView(v);
    const raw = toModel(event);
    const startPan = () => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { kind: "pan", x: event.clientX, y: event.clientY, cx: v.cx, cy: v.cy };
    };
    if (event.button === 1 || tool === "pan") {
      event.preventDefault();
      startPan();
      return;
    }

    if (tool === "select") {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const grip = element?.closest("[data-grip]")?.getAttribute("data-grip");
      if (grip && selected) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { kind: "grip", original: selected, grip };
        return;
      }
      const id = element?.closest("[data-id]")?.getAttribute("data-id");
      const hit = id ? doc.entities.find((e) => e.id === id) : undefined;
      setSelectedId(hit ? hit.id : null);
      if (hit) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          kind: "move",
          original: hit,
          start: raw,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
      } else {
        startPan();
      }
      return;
    }

    const from = points.length > 0 ? points[points.length - 1] : null;
    const snapped = snapPoint(raw, tool === "dim" && points.length === 2 ? null : from, event.shiftKey);
    const p = snapped.p;

    if (tool === "wall" || tool === "line") {
      if (points.length === 0) setPoints([p]);
      else addSegment(points[0], p);
    } else if (tool === "room") {
      if (points.length >= 3 && dist(p, points[0]) < 12 * px) finishRoom();
      else setPoints([...points, p]);
    } else if (tool === "dim") {
      if (points.length < 2) {
        setPoints([...points, p]);
      } else {
        const [a, b] = points;
        const d = unit(a, b);
        let offset = (raw[0] - a[0]) * -d[1] + (raw[1] - a[1]) * d[0];
        if (Math.abs(offset) < 1) offset = letter * 3;
        commit([...doc.entities, { id: newId(), kind: "dim", a, b, offset: Math.round(offset) }]);
        setPoints([]);
      }
    } else if (tool === "door" || tool === "window") {
      const isDoor = tool === "door";
      const width = isDoor ? options.doorWidth : options.windowWidth;
      const spot = findOpeningSpot(raw, width);
      if (!spot) {
        setNotice("Click on a wall that is long enough for this opening.");
        return;
      }
      const opening: Opening = {
        id: newId(),
        kind: tool,
        wallId: spot.wallId,
        pos: spot.pos,
        width,
        style: isDoor ? options.doorStyle : options.windowStyle,
        flipSide: false,
        flipHinge: false,
        sill: isDoor ? 0 : options.windowStyle === "ventilator" ? 2100 : 900,
        height: isDoor ? 2100 : options.windowStyle === "ventilator" ? 450 : 1200,
      };
      commit([...doc.entities, opening]);
      setNotice("");
    } else if (tool === "tree") {
      commit([
        ...doc.entities,
        { id: newId(), kind: "tree", p, r: options.treeRadius, style: options.treeStyle },
      ]);
    } else if (tool === "furn") {
      commit([
        ...doc.entities,
        { id: newId(), kind: "furn", p, rot: options.furnRot, item: options.furnItem },
      ]);
    } else if (tool === "text") {
      const text = window.prompt("Text to place on the drawing:");
      if (text && text.trim()) {
        commit([
          ...doc.entities,
          { id: newId(), kind: "text", p, text: text.trim().slice(0, 200), size: 1 },
        ]);
      }
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const raw = toModel(event);
    const drag = dragRef.current;

    if (drag?.kind === "pan") {
      setView({
        zoom: v.zoom,
        cx: drag.cx - (event.clientX - drag.x) / v.zoom,
        cy: drag.cy - (event.clientY - drag.y) / v.zoom,
      });
      return;
    }

    if (drag?.kind === "move") {
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      drag.moved = true;
      const original = drag.original;
      if (original.kind === "door" || original.kind === "window") {
        const wall = walls.find((w) => w.id === original.wallId);
        if (!wall) return;
        const length = dist(wall.a, wall.b);
        const along = project(raw, wall.a, wall.b).along;
        const pos = Math.min(
          Math.max(Math.round(along / 10) * 10, original.width / 2),
          length - original.width / 2,
        );
        setOverride({ ...original, pos });
      } else {
        let dx = raw[0] - drag.start[0];
        let dy = raw[1] - drag.start[1];
        if (settings.snap) {
          dx = Math.round(dx / 50) * 50;
          dy = Math.round(dy / 50) * 50;
        }
        setOverride(moveEntity(original, dx, dy));
      }
      return;
    }

    if (drag?.kind === "grip") {
      const original = drag.original;
      const snapped = snapPoint(raw, null, event.shiftKey, original.id);
      setCursor(snapped);
      if (original.kind === "wall" || original.kind === "line" || original.kind === "dim") {
        setOverride(
          drag.grip === "a" ? { ...original, a: snapped.p } : { ...original, b: snapped.p },
        );
      } else if (original.kind === "room") {
        const index = Number(drag.grip);
        setOverride({
          ...original,
          pts: original.pts.map((point, i) => (i === index ? snapped.p : point)),
        });
      }
      return;
    }

    const chained = tool === "wall" || tool === "line" || tool === "room" || (tool === "dim" && points.length === 1);
    const from = chained && points.length > 0 ? points[points.length - 1] : null;
    setCursor(snapPoint(raw, from, event.shiftKey));
    if (tool === "door" || tool === "window") {
      setHoverOpening(
        findOpeningSpot(raw, tool === "door" ? options.doorWidth : options.windowWidth),
      );
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && drag.kind !== "pan" && override) {
      commit(doc.entities.map((e) => (e.id === override.id ? override : e)));
    }
    setOverride(null);
  }

  function endCommand() {
    if (tool === "room" && points.length >= 3) finishRoom();
    else setPoints([]);
    setBuffer("");
  }

  // --- Keyboard ---------------------------------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = event.key;

      if (event.ctrlKey || event.metaKey) {
        const lower = key.toLowerCase();
        if (lower === "z" && !event.shiftKey) {
          event.preventDefault();
          undo();
        } else if (lower === "y" || (lower === "z" && event.shiftKey)) {
          event.preventDefault();
          redo();
        }
        return;
      }

      const drawingLength = (tool === "wall" || tool === "line") && points.length > 0;
      if (drawingLength && /^[0-9.]$/.test(key)) {
        setBuffer(buffer + key);
        return;
      }
      if (key === "Backspace" && buffer) {
        event.preventDefault();
        setBuffer(buffer.slice(0, -1));
        return;
      }
      if (key === "Enter") {
        if (drawingLength && buffer && cursor) {
          const length = parseLength(buffer, settings.unit);
          if (length) {
            const d = unit(points[0], cursor.p);
            addSegment(points[0], roundPt(add(points[0], mul(d, length))));
          }
          setBuffer("");
        } else {
          endCommand();
        }
        return;
      }
      if (key === "Escape") {
        if (points.length > 0 || buffer) {
          setPoints([]);
          setBuffer("");
        } else {
          setTool("select");
        }
        return;
      }
      if (key === "Delete" && selectedId) {
        deleteSelected();
        return;
      }
      const shortcut = TOOLS.find((item) => item.key.toLowerCase() === key.toLowerCase());
      if (shortcut && !buffer) setTool(shortcut.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // --- Files --------------------------------------------------------------------------------

  function newDrawing() {
    if (doc.entities.length > 0 && !window.confirm("Start a new, empty drawing? You can undo this.")) return;
    commit([], { site: null });
    setSelectedId(null);
    setView(null);
  }

  function saveProject() {
    const data = { app: "archhub", kind: "plan", version: 1, plan: doc };
    downloadBlob(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
      "floor-plan.archhub.json",
    );
  }

  async function openProject(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const opened = readPlanFile(await file.text());
    if (!opened) {
      window.alert("That file could not be opened. Choose a plan saved from this studio (it ends in .archhub.json).");
      return;
    }
    setPast([...past, doc].slice(-HISTORY_LIMIT));
    setFuture([]);
    saveDoc(opened);
    setSelectedId(null);
    setView(null);
  }

  async function importDxfFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importDxf(await file.text());
    if (!result) {
      window.alert("That file is not a readable DXF. In AutoCAD, use Save As and choose a DXF format, then try again. (DWG files cannot be opened directly.)");
      return;
    }
    if (result.lines.length === 0) {
      window.alert("No lines were found in that DXF file.");
      return;
    }
    commit([...doc.entities, ...result.lines]);
    setView(null);
    setNotice(
      `Imported ${result.lines.length} lines` +
        (result.skipped > 0 ? `; ${result.skipped} other items (arcs, text, blocks) were skipped.` : "."),
    );
  }

  function exportImage(kind: "png" | "svg") {
    const svg = svgRef.current;
    if (!svg) return;
    const { source, width, height } = buildExportSvg(svg, doc);
    if (kind === "svg") {
      downloadBlob(new Blob([source], { type: "image/svg+xml" }), "floor-plan.svg");
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, "floor-plan.png");
      }, "image/png");
    };
    image.onerror = () => window.alert("Sorry, the image could not be created in this browser.");
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  function exportDxfFile() {
    downloadBlob(new Blob([exportDxf(doc)], { type: "application/dxf" }), "floor-plan.dxf");
  }

  function useSiteStudy() {
    let width = 0;
    let depth = 0;
    let facing = "";
    try {
      const stored = JSON.parse(window.localStorage.getItem(PLANNER_KEY) ?? "{}");
      width = Number(String(stored.siteWidth ?? "").replace(",", ".")) * 1000;
      depth = Number(String(stored.siteDepth ?? "").replace(",", ".")) * 1000;
      facing = String(stored.facing ?? "");
    } catch {
      // Nothing saved yet.
    }
    if (!(width > 0) || !(depth > 0)) {
      window.alert("No site size found. Fill in the site width and depth in the Concept Planner's site study first, or type the size here.");
      return;
    }
    const bearing = FACING_BEARING[facing];
    const site: Site = {
      w: Math.round(width),
      d: Math.round(depth),
      north: bearing === undefined ? 0 : (540 - bearing) % 360,
    };
    commit(doc.entities, { site });
    setView(null);
  }

  // --- What the command line says -----------------------------------------------------------------

  let prompt = "";
  if (tool === "select") prompt = "Click an object to select it. Drag to move it. Drag empty space to pan.";
  else if (tool === "pan") prompt = "Drag to move around the drawing. Scroll to zoom.";
  else if (tool === "wall" || tool === "line") {
    prompt =
      points.length === 0
        ? `${tool === "wall" ? "WALL" : "LINE"}: click the start point.`
        : "Click the next point, or type a length and press Enter. Esc to finish.";
  } else if (tool === "room") {
    prompt =
      points.length < 3
        ? "ROOM: click each inside corner of the room in turn."
        : "Click the first corner again, or press Enter, to close the room.";
  } else if (tool === "dim") {
    prompt = ["DIMENSION: click the first point.", "Click the second point.", "Click where the dimension line should sit."][points.length];
  } else if (tool === "door" || tool === "window") prompt = `${tool.toUpperCase()}: move over a wall and click to place.`;
  else if (tool === "tree") prompt = "TREE: click to plant.";
  else if (tool === "furn") prompt = "FURNITURE: choose an item on the right, then click to place.";
  else if (tool === "text") prompt = "TEXT: click where the text should start.";

  // --- Drawing aids -------------------------------------------------------------------------------

  const left = v.cx - size.w / 2 / v.zoom;
  const top = v.cy - size.h / 2 / v.zoom;
  const viewWidth = size.w / v.zoom;
  const viewHeight = size.h / v.zoom;

  const gridStep = [50, 100, 500, 1000, 5000, 10000, 50000, 100000].find((s) => s * v.zoom >= 14) ?? 100000;
  const gridLines: React.ReactNode[] = [];
  if (settings.grid) {
    for (let x = Math.ceil(left / gridStep) * gridStep; x < left + viewWidth; x += gridStep) {
      const major = Math.round(x / gridStep) % 5 === 0;
      gridLines.push(
        <line key={`x${x}`} x1={x} y1={top} x2={x} y2={top + viewHeight} strokeOpacity={major ? 0.9 : 0.4} />,
      );
    }
    for (let y = Math.ceil(top / gridStep) * gridStep; y < top + viewHeight; y += gridStep) {
      const major = Math.round(y / gridStep) % 5 === 0;
      gridLines.push(
        <line key={`y${y}`} x1={left} y1={y} x2={left + viewWidth} y2={y} strokeOpacity={major ? 0.9 : 0.4} />,
      );
    }
  }

  const last = points.length > 0 ? points[points.length - 1] : null;
  const typedLength = buffer ? parseLength(buffer, settings.unit) : null;
  const previewEnd: Pt | null =
    cursor && last
      ? typedLength && (tool === "wall" || tool === "line")
        ? roundPt(add(last, mul(unit(last, cursor.p), typedLength)))
        : cursor.p
      : null;

  const hoverWall = hoverOpening ? walls.find((w) => w.id === hoverOpening.wallId) : undefined;
  const gripSize = 9 * px;
  const grip = (p: Pt, name: string) => (
    <rect
      key={name}
      data-grip={name}
      x={p[0] - gripSize / 2}
      y={p[1] - gripSize / 2}
      width={gripSize}
      height={gripSize}
      fill={ACCENT}
      stroke="#ffffff"
      strokeWidth="1"
      style={{ cursor: "move" }}
    />
  );

  let selectionMark: React.ReactNode = null;
  if (selected) {
    const mark = { fill: "none", stroke: ACCENT, strokeWidth: 1.5, strokeDasharray: "5 4", pointerEvents: "none" as const };
    if (selected.kind === "wall") {
      selectionMark = (
        <>
          <polygon points={wallCorners(selected, []).map((p) => p.join(",")).join(" ")} {...mark} />
          {grip(selected.a, "a")}
          {grip(selected.b, "b")}
        </>
      );
    } else if (selected.kind === "line" || selected.kind === "dim") {
      selectionMark = (
        <>
          <line x1={selected.a[0]} y1={selected.a[1]} x2={selected.b[0]} y2={selected.b[1]} {...mark} />
          {grip(selected.a, "a")}
          {grip(selected.b, "b")}
        </>
      );
    } else if (selected.kind === "room") {
      selectionMark = (
        <>
          <polygon points={selected.pts.map((p) => p.join(",")).join(" ")} {...mark} />
          {selected.pts.map((p, i) => grip(p, String(i)))}
        </>
      );
    } else if (selected.kind === "tree") {
      selectionMark = <circle cx={selected.p[0]} cy={selected.p[1]} r={selected.r + 4 * px} {...mark} />;
    } else if (selected.kind === "furn") {
      const item = getFurniture(selected.item);
      selectionMark = (
        <rect
          x={-item.w / 2 - 4 * px}
          y={-item.d / 2 - 4 * px}
          width={item.w + 8 * px}
          height={item.d + 8 * px}
          transform={`translate(${selected.p[0]} ${selected.p[1]}) rotate(${selected.rot})`}
          {...mark}
        />
      );
    } else if (selected.kind === "text") {
      selectionMark = (
        <rect
          x={selected.p[0] - 4 * px}
          y={selected.p[1] - letter * selected.size - 2 * px}
          width={Math.max(selected.text.length * letter * selected.size * 0.56, 20 * px) + 8 * px}
          height={letter * selected.size * 1.3 + 4 * px}
          {...mark}
        />
      );
    } else {
      const wall = walls.find((w) => w.id === selected.wallId);
      if (wall) {
        const centre = add(wall.a, mul(unit(wall.a, wall.b), selected.pos));
        selectionMark = (
          <rect
            x={-selected.width / 2 - 4 * px}
            y={-wall.t / 2 - 4 * px}
            width={selected.width + 8 * px}
            height={wall.t + 8 * px}
            transform={`translate(${centre[0]} ${centre[1]}) rotate(${angleDeg(wall.a, wall.b)})`}
            {...mark}
          />
        );
      }
    }
  }

  const totalArea = rooms.reduce((sum, room) => sum + polygonArea(room.pts), 0);
  const canvasCursor = tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
  const groups = [...new Set(TOOLS.map((item) => item.group))];
  const furnitureGroups = [...new Set(FURNITURE.map((item) => item.group))];

  // --- The right-hand panel for the selected object -------------------------------------------------

  function selectionPanel(entity: Entity) {
    const actions = (
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Btn onClick={deleteSelected} danger>
          Delete
        </Btn>
      </div>
    );
    if (entity.kind === "wall") {
      const length = dist(entity.a, entity.b);
      return (
        <Section title="Wall">
          <Row label="Length">
            <NumInput
              value={Math.round(length)}
              min={10}
              suffix="mm"
              onCommit={(value) =>
                updateEntity({ ...entity, b: roundPt(add(entity.a, mul(unit(entity.a, entity.b), value))) })
              }
            />
          </Row>
          <Row label="Thickness">
            <NumInput value={entity.t} min={20} suffix="mm" onCommit={(t) => updateEntity({ ...entity, t })} />
          </Row>
          <Row label="Height">
            <NumInput value={entity.h} min={100} suffix="mm" onCommit={(h) => updateEntity({ ...entity, h })} />
          </Row>
          <p className="text-[#8b9099]">Drag the blue squares to move either end.</p>
          {actions}
        </Section>
      );
    }
    if (entity.kind === "door" || entity.kind === "window") {
      const styles = entity.kind === "door" ? DOOR_STYLES : WINDOW_STYLES;
      return (
        <Section title={entity.kind === "door" ? "Door" : "Window"}>
          <Row label="Type">
            <Select value={entity.style} options={styles} onChange={(next) => updateEntity({ ...entity, style: next })} />
          </Row>
          <Row label="Width">
            <NumInput value={entity.width} min={200} suffix="mm" onCommit={(width) => updateEntity({ ...entity, width })} />
          </Row>
          <Row label="Height">
            <NumInput value={entity.height} min={200} suffix="mm" onCommit={(height) => updateEntity({ ...entity, height })} />
          </Row>
          <Row label="Sill height">
            <NumInput value={entity.sill} min={0} suffix="mm" onCommit={(sill) => updateEntity({ ...entity, sill })} />
          </Row>
          <div className="flex flex-wrap gap-1.5">
            <Btn onClick={() => updateEntity({ ...entity, flipSide: !entity.flipSide })}>Flip side</Btn>
            <Btn onClick={() => updateEntity({ ...entity, flipHinge: !entity.flipHinge })}>Flip hinge</Btn>
          </div>
          <p className="text-[#8b9099]">Drag it to slide along the wall.</p>
          {actions}
        </Section>
      );
    }
    if (entity.kind === "room") {
      const area = polygonArea(entity.pts);
      return (
        <Section title="Room">
          <Row label="Name">
            <TextInput value={entity.name} onCommit={(name) => updateEntity({ ...entity, name })} />
          </Row>
          <Row label="Floor finish">
            <Select value={entity.finish} options={FLOOR_FINISHES} onChange={(finish) => updateEntity({ ...entity, finish })} />
          </Row>
          <Row label="Area">
            <span className="text-[#e6e8ec]">
              {formatArea(area)} · {formatAreaFeet(area)}
            </span>
          </Row>
          <p className="text-[#8b9099]">Drag the blue squares to reshape the room.</p>
          {actions}
        </Section>
      );
    }
    if (entity.kind === "tree") {
      return (
        <Section title="Tree">
          <Row label="Type">
            <Select value={entity.style} options={TREE_STYLES} onChange={(next) => updateEntity({ ...entity, style: next })} />
          </Row>
          <Row label="Canopy radius">
            <NumInput value={entity.r} min={100} suffix="mm" onCommit={(r) => updateEntity({ ...entity, r })} />
          </Row>
          {actions}
        </Section>
      );
    }
    if (entity.kind === "furn") {
      const item = getFurniture(entity.item);
      return (
        <Section title={item.name}>
          <Row label="Size">
            <span className="text-[#e6e8ec]">
              {item.w} x {item.d} mm
            </span>
          </Row>
          <Row label="Rotation">
            <NumInput value={entity.rot} suffix="°" onCommit={(rot) => updateEntity({ ...entity, rot })} />
          </Row>
          <div className="flex flex-wrap gap-1.5">
            <Btn onClick={() => updateEntity({ ...entity, rot: (entity.rot + 270) % 360 })}>Turn left</Btn>
            <Btn onClick={() => updateEntity({ ...entity, rot: (entity.rot + 90) % 360 })}>Turn right</Btn>
          </div>
          {actions}
        </Section>
      );
    }
    if (entity.kind === "text") {
      return (
        <Section title="Text">
          <Row label="Text">
            <TextInput value={entity.text} onCommit={(text) => updateEntity({ ...entity, text })} />
          </Row>
          <Row label="Size">
            <NumInput value={entity.size} min={0.2} suffix="x" onCommit={(next) => updateEntity({ ...entity, size: next })} />
          </Row>
          {actions}
        </Section>
      );
    }
    if (entity.kind === "dim") {
      return (
        <Section title="Dimension">
          <Row label="Measures">
            <span className="text-[#e6e8ec]">{formatLength(dist(entity.a, entity.b), settings.unit)}</span>
          </Row>
          <Row label="Offset">
            <NumInput value={entity.offset} suffix="mm" onCommit={(offset) => updateEntity({ ...entity, offset })} />
          </Row>
          <Btn onClick={() => updateEntity({ ...entity, offset: -entity.offset })}>Flip side</Btn>
          {actions}
        </Section>
      );
    }
    if (entity.kind !== "line") return null;
    return (
      <Section title="Line">
        <Row label="Length">
          <span className="text-[#e6e8ec]">{formatLength(dist(entity.a, entity.b), settings.unit)}</span>
        </Row>
        {actions}
      </Section>
    );
  }

  // --- Layout -----------------------------------------------------------------------------------------

  const bar =
    "flex items-center gap-1.5 border-[#2f3237] bg-[#202226] [scrollbar-width:none]";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#17181b] font-sans text-[12px] text-[#d7d9de]">
      {/* Top bar */}
      <header className={`${bar} h-11 shrink-0 overflow-x-auto border-b px-2`}>
        <Link href="/" className="mr-1 shrink-0 font-mono text-[13px] font-semibold text-white">
          ← Arch<span className="text-[#4c8dff]">Hub</span>
        </Link>
        <span className="mr-2 shrink-0 border-l border-[#3a3e45] pl-3 text-[13px] text-[#b4b8c0]">
          Floor Plan Studio
        </span>
        <Btn onClick={newDrawing}>New</Btn>
        <Btn onClick={() => openRef.current?.click()}>Open</Btn>
        <Btn onClick={saveProject}>Save</Btn>
        <span className="mx-1 h-5 w-px shrink-0 bg-[#3a3e45]" />
        <Btn onClick={() => dxfRef.current?.click()} title="Bring in lines from a DXF file (AutoCAD: Save As DXF)">
          Import DXF
        </Btn>
        <span className="shrink-0 pl-1 text-[#8b9099]">Export:</span>
        <Btn onClick={() => exportImage("png")}>PNG</Btn>
        <Btn onClick={() => exportImage("svg")}>SVG</Btn>
        <Btn onClick={exportDxfFile} title="Opens in AutoCAD, Revit and SketchUp">
          DXF
        </Btn>
        <span className="mx-1 h-5 w-px shrink-0 bg-[#3a3e45]" />
        <Btn onClick={undo} disabled={past.length === 0}>
          Undo
        </Btn>
        <Btn onClick={redo} disabled={future.length === 0}>
          Redo
        </Btn>
        <span className="mx-1 h-5 w-px shrink-0 bg-[#3a3e45]" />
        <Btn onClick={() => zoomBy(1 / 1.3)} title="Zoom out">
          −
        </Btn>
        <Btn onClick={() => zoomBy(1.3)} title="Zoom in">
          +
        </Btn>
        <Btn onClick={() => setView(null)} title="Show the whole drawing">
          Fit
        </Btn>
        <span className="flex-1" />
        <Btn onClick={() => setPanelOpen(!panelOpen)} active={panelOpen}>
          Panel
        </Btn>
        <input ref={openRef} type="file" accept=".json,application/json" onChange={openProject} className="hidden" aria-label="Open plan file" />
        <input ref={dxfRef} type="file" accept=".dxf" onChange={importDxfFile} className="hidden" aria-label="Import DXF file" />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tools */}
        <nav aria-label="Tools" className="w-[104px] shrink-0 overflow-y-auto border-r border-[#2f3237] bg-[#202226] p-1.5">
          {groups.map((group) => (
            <div key={group} className="mb-2">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#6f747d]">{group}</p>
              {TOOLS.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={tool === item.id}
                  onClick={() => setTool(item.id)}
                  className={`mb-0.5 flex h-7 w-full items-center justify-between rounded px-2 text-left ${
                    tool === item.id ? "bg-[#4c8dff] text-white" : "text-[#d7d9de] hover:bg-[#2c2f35]"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className={`font-mono text-[10px] ${tool === item.id ? "text-white/80" : "text-[#6f747d]"}`}>
                    {item.key}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Drawing */}
        <div ref={holderRef} className="relative min-w-0 flex-1 overflow-hidden">
          <svg
            ref={svgRef}
            className="plan-svg absolute inset-0 h-full w-full"
            viewBox={`${left} ${top} ${viewWidth} ${viewHeight}`}
            role="img"
            aria-label="Floor plan drawing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setCursor(null)}
            onDoubleClick={() => tool === "room" && finishRoom()}
            onContextMenu={(event) => {
              event.preventDefault();
              endCommand();
            }}
            style={{ touchAction: "none", cursor: canvasCursor, background: style.paper }}
          >
            <style>{".plan-svg *{vector-effect:non-scaling-stroke}.plan-svg pattern *{vector-effect:none}"}</style>
            <g data-export="skip" stroke={style.grid} strokeWidth="1" pointerEvents="none">
              {gridLines}
            </g>

            <PlanDrawing doc={shown} />

            {/* Tool marks: never part of an exported drawing. */}
            <g data-export="skip" fontFamily="Arial, Helvetica, sans-serif">
              {selectionMark}

              {(tool === "wall" || tool === "line") && last && previewEnd && (
                <g pointerEvents="none">
                  {tool === "wall" ? (
                    <polygon
                      points={wallCorners(
                        { id: "preview", kind: "wall", a: last, b: previewEnd, t: settings.wallT, h: 0 },
                        [],
                      )
                        .map((p) => p.join(","))
                        .join(" ")}
                      fill={ACCENT}
                      fillOpacity="0.18"
                      stroke={ACCENT}
                      strokeWidth="1.2"
                    />
                  ) : (
                    <line x1={last[0]} y1={last[1]} x2={previewEnd[0]} y2={previewEnd[1]} stroke={ACCENT} strokeWidth="1.2" />
                  )}
                  <text
                    x={previewEnd[0] + 14 * px}
                    y={previewEnd[1] - 12 * px}
                    fontSize={12 * px}
                    fill={ACCENT}
                    stroke={style.paper}
                    strokeWidth="3"
                    paintOrder="stroke"
                  >
                    {formatLength(dist(last, previewEnd), settings.unit)}
                    {"  "}
                    {Math.round((((-angleDeg(last, previewEnd) % 360) + 360) % 360) * 10) / 10}°
                  </text>
                </g>
              )}

              {tool === "room" && points.length > 0 && (
                <g pointerEvents="none">
                  <polyline
                    points={[...points, ...(cursor ? [cursor.p] : [])].map((p) => p.join(",")).join(" ")}
                    fill={ACCENT}
                    fillOpacity="0.12"
                    stroke={ACCENT}
                    strokeWidth="1.2"
                  />
                  <circle cx={points[0][0]} cy={points[0][1]} r={6 * px} fill="none" stroke={ACCENT} strokeWidth="1.5" />
                </g>
              )}

              {tool === "dim" && points.length > 0 && cursor && (
                <line
                  x1={points[0][0]}
                  y1={points[0][1]}
                  x2={(points[1] ?? cursor.p)[0]}
                  y2={(points[1] ?? cursor.p)[1]}
                  stroke={ACCENT}
                  strokeWidth="1.2"
                  strokeDasharray="4 3"
                  pointerEvents="none"
                />
              )}

              {hoverOpening && hoverWall && (tool === "door" || tool === "window") && (
                <rect
                  x={-(tool === "door" ? options.doorWidth : options.windowWidth) / 2}
                  y={-hoverWall.t / 2}
                  width={tool === "door" ? options.doorWidth : options.windowWidth}
                  height={hoverWall.t}
                  transform={`translate(${add(hoverWall.a, mul(unit(hoverWall.a, hoverWall.b), hoverOpening.pos)).join(" ")}) rotate(${angleDeg(hoverWall.a, hoverWall.b)})`}
                  fill={ACCENT}
                  fillOpacity="0.5"
                  stroke={ACCENT}
                  pointerEvents="none"
                />
              )}

              {cursor && tool !== "select" && tool !== "pan" && (
                <g pointerEvents="none" stroke={ACCENT} strokeWidth="1">
                  <line x1={cursor.p[0] - 18 * px} y1={cursor.p[1]} x2={cursor.p[0] + 18 * px} y2={cursor.p[1]} strokeOpacity="0.7" />
                  <line x1={cursor.p[0]} y1={cursor.p[1] - 18 * px} x2={cursor.p[0]} y2={cursor.p[1] + 18 * px} strokeOpacity="0.7" />
                  {cursor.kind && (
                    <>
                      <rect
                        x={cursor.p[0] - 6 * px}
                        y={cursor.p[1] - 6 * px}
                        width={12 * px}
                        height={12 * px}
                        fill="none"
                        stroke="#ffb020"
                        strokeWidth="1.8"
                      />
                      <text
                        x={cursor.p[0] + 12 * px}
                        y={cursor.p[1] + 22 * px}
                        fontSize={11 * px}
                        fill="#ffb020"
                        stroke={style.paper}
                        strokeWidth="3"
                        paintOrder="stroke"
                      >
                        {cursor.kind}
                      </text>
                    </>
                  )}
                </g>
              )}
            </g>
          </svg>

          {doc.entities.length === 0 && !doc.site && points.length === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-6 w-[min(92%,460px)] -translate-x-1/2 rounded border border-[#3a3e45] bg-[#202226]/95 p-4 text-[13px] leading-relaxed text-[#d7d9de] shadow-lg">
              <p className="font-semibold text-white">Start your plan</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#b4b8c0]">
                <li>The <strong className="text-white">Wall</strong> tool is ready. Click once to start a wall.</li>
                <li>Move the mouse, type a length (for example 4000) and press Enter.</li>
                <li>Keep going around the room. Press Esc to finish.</li>
                <li>Then add doors, windows, a Room (for its area) and furniture.</li>
              </ol>
              <p className="mt-2 text-[#8b9099]">Scroll to zoom. Drag with the middle mouse button to pan.</p>
            </div>
          )}
        </div>

        {/* Properties */}
        {panelOpen && (
          <aside className="absolute bottom-8 right-0 top-11 z-10 w-[280px] overflow-y-auto border-l border-[#2f3237] bg-[#202226] md:static md:shrink-0">
            {selected && selectionPanel(selected)}

            {tool === "wall" && (
              <Section title="Wall tool">
                <div className="flex flex-wrap gap-1.5">
                  {WALL_THICKNESSES.map((t) => (
                    <Btn key={t} active={settings.wallT === t} onClick={() => setSettings({ wallT: t })}>
                      {t}
                    </Btn>
                  ))}
                </div>
                <Row label="Thickness">
                  <NumInput value={settings.wallT} min={20} suffix="mm" onCommit={(wallT) => setSettings({ wallT })} />
                </Row>
                <Row label="Height">
                  <NumInput value={settings.wallH} min={100} suffix="mm" onCommit={(wallH) => setSettings({ wallH })} />
                </Row>
              </Section>
            )}

            {tool === "door" && (
              <Section title="Door tool">
                <Row label="Type">
                  <Select
                    value={options.doorStyle}
                    options={DOOR_STYLES}
                    onChange={(id) =>
                      setOptions({
                        ...options,
                        doorStyle: id,
                        doorWidth: DOOR_STYLES.find((s) => s.id === id)?.width ?? 900,
                      })
                    }
                  />
                </Row>
                <Row label="Width">
                  <NumInput value={options.doorWidth} min={300} suffix="mm" onCommit={(doorWidth) => setOptions({ ...options, doorWidth })} />
                </Row>
              </Section>
            )}

            {tool === "window" && (
              <Section title="Window tool">
                <Row label="Type">
                  <Select
                    value={options.windowStyle}
                    options={WINDOW_STYLES}
                    onChange={(id) =>
                      setOptions({
                        ...options,
                        windowStyle: id,
                        windowWidth: WINDOW_STYLES.find((s) => s.id === id)?.width ?? 1200,
                      })
                    }
                  />
                </Row>
                <Row label="Width">
                  <NumInput value={options.windowWidth} min={200} suffix="mm" onCommit={(windowWidth) => setOptions({ ...options, windowWidth })} />
                </Row>
              </Section>
            )}

            {tool === "tree" && (
              <Section title="Tree tool">
                <Row label="Type">
                  <Select value={options.treeStyle} options={TREE_STYLES} onChange={(treeStyle) => setOptions({ ...options, treeStyle })} />
                </Row>
                <Row label="Canopy radius">
                  <NumInput value={options.treeRadius} min={100} suffix="mm" onCommit={(treeRadius) => setOptions({ ...options, treeRadius })} />
                </Row>
              </Section>
            )}

            {tool === "furn" && (
              <Section title="Furniture library">
                {furnitureGroups.map((group) => (
                  <div key={group}>
                    <p className="pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[#6f747d]">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FURNITURE.filter((item) => item.group === group).map((item) => (
                        <Btn
                          key={item.id}
                          active={options.furnItem === item.id}
                          onClick={() => setOptions({ ...options, furnItem: item.id })}
                          title={`${item.w} x ${item.d} mm`}
                        >
                          {item.name}
                        </Btn>
                      ))}
                    </div>
                  </div>
                ))}
                <Row label="Rotation">
                  <NumInput value={options.furnRot} suffix="°" onCommit={(furnRot) => setOptions({ ...options, furnRot })} />
                  <Btn onClick={() => setOptions({ ...options, furnRot: (options.furnRot + 90) % 360 })}>+90°</Btn>
                </Row>
              </Section>
            )}

            <Section title="Render style">
              <Select value={settings.style} options={PLAN_STYLES} onChange={(next) => setSettings({ style: next })} />
              <p className="text-[#8b9099]">{style.note}</p>
              <Toggle label="Shadows" checked={settings.shadows} onChange={(shadows) => setSettings({ shadows })} />
              <Toggle label="Floor textures" checked={settings.textures} onChange={(textures) => setSettings({ textures })} />
              <Row label="Wall colour">
                <input
                  type="color"
                  value={settings.wallColor || style.wallFill}
                  onChange={(event) => setSettings({ wallColor: event.target.value })}
                  aria-label="Wall colour"
                  className="h-7 w-10 cursor-pointer rounded border border-[#3a3e45] bg-transparent"
                />
                <Btn onClick={() => setSettings({ wallColor: "" })} disabled={!settings.wallColor}>
                  Reset
                </Btn>
              </Row>
            </Section>

            <Section title="Areas">
              {rooms.length === 0 ? (
                <p className="text-[#8b9099]">Use the Room tool to trace a room; its area is worked out for you.</p>
              ) : (
                <>
                  {rooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        setToolState("select");
                        setSelectedId(room.id);
                      }}
                      className="flex w-full justify-between rounded px-1 py-0.5 text-left hover:bg-[#2c2f35]"
                    >
                      <span>{room.name}</span>
                      <span className="text-[#e6e8ec]">{formatArea(polygonArea(room.pts))}</span>
                    </button>
                  ))}
                  <div className="flex justify-between border-t border-[#3a3e45] px-1 pt-1.5 font-semibold text-white">
                    <span>Total</span>
                    <span>
                      {formatArea(totalArea)} · {formatAreaFeet(totalArea)}
                    </span>
                  </div>
                </>
              )}
            </Section>

            <Section title="Site">
              {doc.site ? (
                <>
                  <Row label="Width (road side)">
                    <NumInput value={doc.site.w} min={1000} suffix="mm" onCommit={(w) => commit(doc.entities, { site: { ...doc.site!, w } })} />
                  </Row>
                  <Row label="Depth">
                    <NumInput value={doc.site.d} min={1000} suffix="mm" onCommit={(d) => commit(doc.entities, { site: { ...doc.site!, d } })} />
                  </Row>
                  <Row label="North angle">
                    <NumInput value={doc.site.north} suffix="°" onCommit={(north) => commit(doc.entities, { site: { ...doc.site!, north } })} />
                  </Row>
                  <p className="text-[#8b9099]">
                    Area {formatArea(doc.site.w * doc.site.d)}. The road runs along the bottom edge. North angle is
                    measured clockwise from straight up.
                  </p>
                  <Btn onClick={() => commit(doc.entities, { site: null })}>Remove site</Btn>
                </>
              ) : (
                <>
                  <p className="text-[#8b9099]">Show the plot boundary and north arrow.</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Btn onClick={useSiteStudy}>Use my site study</Btn>
                    <Btn
                      onClick={() => {
                        commit(doc.entities, { site: { w: 18000, d: 30000, north: 0 } });
                        setView(null);
                      }}
                    >
                      Add 18 x 30 m site
                    </Btn>
                  </div>
                </>
              )}
            </Section>

            <Section title="Drawing">
              <Row label="Scale (lettering size)">
                <Select
                  value={String(settings.scale)}
                  options={SCALES.map((s) => ({ id: String(s), name: `1:${s}` }))}
                  onChange={(next) => setSettings({ scale: Number(next) })}
                />
              </Row>
              <Row label="Units shown">
                <Select
                  value={settings.unit}
                  options={[
                    { id: "mm", name: "Millimetres" },
                    { id: "m", name: "Metres" },
                    { id: "ft", name: "Feet and inches" },
                  ]}
                  onChange={(next) => setSettings({ unit: next as Settings["unit"] })}
                />
              </Row>
              <Toggle label="Show every wall's length" checked={settings.autoDims} onChange={(autoDims) => setSettings({ autoDims })} />
            </Section>

            <Section title="Layers">
              {LAYERS.map((layer) => (
                <Toggle
                  key={layer.id}
                  label={layer.name}
                  checked={!settings.hidden.includes(layer.id)}
                  onChange={(on) =>
                    setSettings({
                      hidden: on
                        ? settings.hidden.filter((id) => id !== layer.id)
                        : [...settings.hidden, layer.id],
                    })
                  }
                />
              ))}
            </Section>
          </aside>
        )}
      </div>

      {/* Command line and status */}
      <footer className={`${bar} h-8 shrink-0 overflow-x-auto border-t px-2`}>
        <span className="shrink-0 font-mono text-[#4c8dff]">&gt;</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[#d7d9de]">
          {notice || prompt}
          {buffer && <span className="ml-2 rounded bg-[#4c8dff] px-1.5 text-white">{buffer}</span>}
        </span>
        <span className="shrink-0 font-mono text-[#8b9099]">
          {cursor ? `${formatLength(cursor.p[0], settings.unit)}, ${formatLength(-cursor.p[1], settings.unit)}` : ""}
        </span>
        <Btn active={settings.snap} onClick={() => setSettings({ snap: !settings.snap })} title="Snap to points and to a 50 mm grid">
          SNAP
        </Btn>
        <Btn active={settings.ortho} onClick={() => setSettings({ ortho: !settings.ortho })} title="Lock to 45° steps (hold Shift to flip)">
          ORTHO
        </Btn>
        <Btn active={settings.grid} onClick={() => setSettings({ grid: !settings.grid })}>
          GRID
        </Btn>
        <span className="shrink-0 font-mono text-[#8b9099]">
          1:{settings.scale} · {settings.unit}
        </span>
      </footer>
    </div>
  );
}
