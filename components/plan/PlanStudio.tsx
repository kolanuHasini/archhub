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
import { downloadBlob, safeFileName } from "@/lib/download";
import { dropOrphanOpenings, exportDxf, importDxf } from "@/lib/plan/dxf";
import { FURNITURE, getFurniture } from "@/lib/plan/furniture";
import {
  add,
  angleDeg,
  arcPath,
  boxContains,
  boxTouches,
  curvedWallCorners,
  dist,
  elemRect,
  entityBox,
  extents,
  followCurves,
  mirrorEntity,
  offsetPoints,
  rotateEntity,
  formatArea,
  formatAreaFeet,
  formatLength,
  mid,
  moveEntity,
  mul,
  parseLength,
  polygonArea,
  projectOnWall,
  roundPt,
  unit,
  wallCorners,
  wallJunctionCorners,
  wallLength,
  wallOutline,
  wallPointAt,
  wallShape,
  type Box,
} from "@/lib/plan/geometry";
import { PLAN_STYLES, getStyle } from "@/lib/plan/styles";
import {
  DEFAULT_SETTINGS,
  DOOR_STYLES,
  ELEM_TYPES,
  EMPTY_PLAN,
  FLOOR_FINISHES,
  GROUND_FLOOR,
  LAYERS,
  LINE_WEIGHTS,
  SCALES,
  TEXT_FONTS,
  TREE_STYLES,
  WALL_THICKNESSES,
  WINDOW_STYLES,
  layerOf,
  newId,
  type Elem,
  type Entity,
  type Floor,
  type LayerLook,
  type Opening,
  type PlanDoc,
  type Pt,
  type Room,
  type Settings,
  type Site,
  type Wall,
} from "@/lib/plan/types";
import { loadPhoto } from "@/lib/image";
import { projectKey, useProjects } from "@/lib/projects";
import { isSavedInBrowser, useSavedState } from "@/lib/useSavedState";

// ---------------------------------------------------------------------------
// The Floor Plan Studio workspace: tools on the left, the drawing in the
// middle, properties on the right, and a command line along the bottom.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "archhub.plan.v1";
const PLANNER_KEY = "archhub.concept-planner.v1";
const ACCENT = "#d17e5b";
const HISTORY_LIMIT = 60;

type ToolId =
  | "select"
  | "pan"
  | "wall"
  | "cwall"
  | "door"
  | "window"
  | "room"
  | "dim"
  | "line"
  | "furn"
  | "tree"
  | "text"
  | "rect"
  | "circle"
  | "arc"
  | "level"
  | "measure"
  | "column"
  | "beam"
  | "stair"
  | "slab"
  | "railing";

const TOOLS: { id: ToolId; label: string; key: string; group: string }[] = [
  { id: "select", label: "Select", key: "V", group: "Edit" },
  { id: "pan", label: "Pan", key: "H", group: "Edit" },
  { id: "wall", label: "Wall", key: "W", group: "Build" },
  { id: "cwall", label: "Curved wall", key: "U", group: "Build" },
  { id: "door", label: "Door", key: "D", group: "Build" },
  { id: "window", label: "Window", key: "N", group: "Build" },
  { id: "room", label: "Room", key: "R", group: "Build" },
  { id: "column", label: "Column", key: "K", group: "Structure" },
  { id: "beam", label: "Beam", key: "J", group: "Structure" },
  { id: "stair", label: "Stair", key: "S", group: "Structure" },
  { id: "slab", label: "Slab", key: "Y", group: "Structure" },
  { id: "railing", label: "Railing", key: "G", group: "Structure" },
  { id: "furn", label: "Furniture", key: "F", group: "Place" },
  { id: "tree", label: "Tree", key: "T", group: "Place" },
  { id: "dim", label: "Dimension", key: "M", group: "Annotate" },
  { id: "level", label: "Level mark", key: "E", group: "Annotate" },
  { id: "measure", label: "Measure", key: "Q", group: "Annotate" },
  { id: "line", label: "Line", key: "L", group: "Draft" },
  { id: "rect", label: "Rectangle", key: "B", group: "Draft" },
  { id: "circle", label: "Circle", key: "C", group: "Draft" },
  { id: "arc", label: "Arc", key: "A", group: "Draft" },
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
  | { kind: "grip"; original: Entity; grip: string }
  | { kind: "group"; originals: Entity[]; start: Pt; x: number; y: number; moved: boolean }
  | { kind: "box"; start: Pt };

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
    zoom: Math.min(Math.max(zoom, 0.0005), 2),
  };
}

/** Tidies a saved plan: every plan has at least one floor, and every object a floor. */
function normalizePlan(plan: Partial<PlanDoc> | null | undefined): PlanDoc {
  const floors =
    Array.isArray(plan?.floors) && plan.floors.length > 0
      ? plan.floors.filter((f) => f && typeof f.id === "string")
      : [GROUND_FLOOR];
  const safeFloors = floors.length > 0 ? floors : [GROUND_FLOOR];
  const known = new Set(safeFloors.map((f) => f.id));
  const fallback = known.has(GROUND_FLOOR.id) ? GROUND_FLOOR.id : safeFloors[0].id;
  const entities = (Array.isArray(plan?.entities) ? plan.entities.filter(isEntity) : []).map(
    (e) => (e.floor && known.has(e.floor) ? e : { ...e, floor: fallback }),
  );
  return {
    floors: safeFloors,
    entities,
    site: plan?.site && Number.isFinite(plan.site.w) ? plan.site : null,
    settings: { ...DEFAULT_SETTINGS, ...(plan?.settings ?? {}) },
  };
}

function readPlanFile(text: string): PlanDoc | null {
  try {
    const data = JSON.parse(text);
    if (!data || data.app !== "archhub" || data.kind !== "plan") return null;
    return normalizePlan(data.plan ?? {});
  } catch {
    return null;
  }
}

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

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
  // The class stays: it carries the rule that keeps line weights in pixels.
  copy.removeAttribute("style");
  return {
    source: new XMLSerializer().serializeToString(copy),
    width: Math.round(w * pixels),
    height: Math.round(h * pixels),
  };
}

export default function PlanStudio() {
  // Each project keeps its own drawing.
  const { active: project } = useProjects();
  const storageKey = projectKey(STORAGE_KEY, project.id);
  const [saved, saveDoc] = useSavedState(storageKey, EMPTY_PLAN);
  // `full` is the whole building (every floor). `doc` is just the floor being
  // worked on, which is what all the drawing tools see.
  const full: PlanDoc = useMemo(() => normalizePlan(saved), [saved]);
  const floors = useMemo(
    () => [...(full.floors ?? [GROUND_FLOOR])].sort((a, b) => b.level - a.level),
    [full.floors],
  );
  const [floorId, setFloorId] = useState(GROUND_FLOOR.id);
  const currentFloor = floors.find((f) => f.id === floorId) ?? floors[floors.length - 1];
  const doc: PlanDoc = useMemo(
    () => ({ ...full, entities: full.entities.filter((e) => e.floor === currentFloor.id) }),
    [full, currentFloor.id],
  );
  const { settings } = doc;
  const isLocked = (entity: Entity) => settings.layerLooks?.[layerOf(entity)]?.locked === true;

  const [tool, setToolState] = useState<ToolId>("wall");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = (id: string | null) => setSelectedIds(id ? [id] : []);
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null); // selection box being dragged
  const [points, setPoints] = useState<Pt[]>([]); // clicks so far with this tool
  const [cursor, setCursor] = useState<Snap | null>(null);
  const [buffer, setBuffer] = useState(""); // a length being typed
  const [overrides, setOverrides] = useState<Entity[]>([]); // objects being dragged
  const setOverride = (entity: Entity | null) => setOverrides(entity ? [entity] : []);
  const [hoverOpening, setHoverOpening] = useState<{ wallId: string; pos: number } | null>(null);
  const [view, setView] = useState<View | null>(null); // null = fit to drawing
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [past, setPast] = useState<PlanDoc[]>([]);
  const [future, setFuture] = useState<PlanDoc[]>([]);
  // null = automatic: shown on wide screens, tucked away on narrow ones.
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
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
    offset: 1000,
    rectAs: "wall" as "wall" | "line",
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const dxfRef = useRef<HTMLInputElement>(null);
  const traceRef = useRef<HTMLInputElement>(null);
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
  const shown: PlanDoc =
    overrides.length > 0
      ? {
          ...doc,
          entities: doc.entities.map((e) => overrides.find((o) => o.id === e.id) ?? e),
        }
      : doc;
  const selectedMany = shown.entities.filter((e) => selectedIds.includes(e.id));
  const selected = shown.entities.find((e) => e.id === selectedId) ?? null;

  // --- Saving, undo, redo ------------------------------------------------------

  /** Saves a change to the whole building, remembering the old state for Undo. */
  function saveFull(next: PlanDoc) {
    setPast([...past, full].slice(-HISTORY_LIMIT));
    setFuture([]);
    saveDoc(next);
  }

  /** Saves the objects of the current floor; other floors are left untouched. */
  function commit(entities: Entity[], extra?: Partial<PlanDoc>) {
    const others = full.entities.filter((e) => e.floor !== currentFloor.id);
    const mine = entities.map((e) =>
      e.floor === currentFloor.id ? e : { ...e, floor: currentFloor.id },
    );
    saveFull({ ...full, entities: [...others, ...mine], ...extra });
  }

  function undo() {
    if (past.length === 0) return;
    setFuture([full, ...future]);
    saveDoc(past[past.length - 1]);
    setPast(past.slice(0, -1));
  }

  function redo() {
    if (future.length === 0) return;
    setPast([...past, full]);
    saveDoc(future[0]);
    setFuture(future.slice(1));
  }

  function setSettings(changes: Partial<Settings>) {
    saveDoc({ ...full, settings: { ...settings, ...changes } });
  }

  // --- Floors ------------------------------------------------------------------

  function switchFloor(id: string) {
    setFloorId(id);
    setSelectedIds([]);
    setPoints([]);
    setBuffer("");
  }

  function addFloor(where: "above" | "below", copyCurrent = false) {
    const top = floors[0];
    const bottom = floors[floors.length - 1];
    const id = newId();
    let floor: Floor;
    if (where === "above") {
      const storeysAbove = floors.filter((f) => f.level > 0).length;
      floor = {
        id,
        name: storeysAbove < ORDINALS.length ? `${ORDINALS[storeysAbove]} floor` : `Floor ${storeysAbove + 1}`,
        level: top.level + top.height,
        height: top.height,
      };
    } else {
      const basements = floors.filter((f) => f.level < 0).length;
      floor = { id, name: `Basement ${basements + 1}`, level: bottom.level - 3000, height: 3000 };
    }
    let copies: Entity[] = [];
    if (copyCurrent) {
      // Copy this floor's objects up, keeping doors and windows on their walls.
      const wallIds = new Map<string, string>();
      for (const e of doc.entities) if (e.kind === "wall") wallIds.set(e.id, newId());
      copies = doc.entities
        .filter((e) => e.kind !== "image")
        .map((e) => {
          if (e.kind === "wall") return { ...e, id: wallIds.get(e.id)!, floor: id };
          if (e.kind === "door" || e.kind === "window") {
            return { ...e, id: newId(), wallId: wallIds.get(e.wallId) ?? e.wallId, floor: id };
          }
          return { ...e, id: newId(), floor: id };
        });
    }
    saveFull({ ...full, floors: [...floors, floor], entities: [...full.entities, ...copies] });
    switchFloor(id);
  }

  function updateFloor(changes: Partial<Floor>) {
    saveFull({
      ...full,
      floors: floors.map((f) => (f.id === currentFloor.id ? { ...f, ...changes } : f)),
    });
  }

  function deleteFloor() {
    if (floors.length < 2) return;
    if (!window.confirm(`Delete "${currentFloor.name}" and everything drawn on it? You can undo this.`)) return;
    const remaining = floors.filter((f) => f.id !== currentFloor.id);
    saveFull({
      ...full,
      floors: remaining,
      entities: full.entities.filter((e) => e.floor !== currentFloor.id),
    });
    switchFloor(remaining[remaining.length - 1].id);
  }

  // The floor directly below, shown faintly so walls can be lined up.
  const floorBelow = floors.find((f) => f.level < currentFloor.level);
  const ghostWalls = useMemo(
    () =>
      floorBelow
        ? full.entities.filter((e): e is Wall => e.kind === "wall" && e.floor === floorBelow.id)
        : [],
    [full.entities, floorBelow],
  );

  function setLayerLook(layer: string, changes: Partial<LayerLook>) {
    const looks = { ...(settings.layerLooks ?? {}) };
    looks[layer] = { ...looks[layer], ...changes };
    setSettings({ layerLooks: looks });
  }

  const allLayers = [...LAYERS, ...(settings.customLayers ?? [])];

  function addLayer() {
    const name = window.prompt("Name for the new layer (for example: Electrical, Plumbing, Grid lines):");
    if (!name || !name.trim()) return;
    setSettings({
      customLayers: [...(settings.customLayers ?? []), { id: `c-${newId()}`, name: name.trim().slice(0, 40) }],
    });
  }

  // Moves the selected objects onto a layer.
  function assignLayer(layer: string) {
    commit(
      doc.entities.map((e) => {
        if (!selectedIds.includes(e.id)) return e;
        const natural = layerOf({ ...e, layer: undefined });
        const next = { ...e };
        if (layer === natural) delete next.layer;
        else next.layer = layer;
        return next;
      }),
    );
  }

  function updateEntity(next: Entity) {
    commit(doc.entities.map((e) => (e.id === next.id ? next : e)));
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return;
    commit(dropOrphanOpenings(doc.entities.filter((e) => !selectedIds.includes(e.id))));
    setSelectedIds([]);
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
        targets.push({
          p:
            entity.kind === "wall"
              ? wallPointAt(entity, wallLength(entity) / 2).p
              : mid(entity.a, entity.b),
          kind: "Midpoint",
          owner: entity.id,
        });
      } else if (entity.kind === "elem") {
        targets.push({ p: entity.a, kind: entity.type === "column" ? "Column" : "Endpoint", owner: entity.id });
        if (entity.type !== "column") targets.push({ p: entity.b, kind: "Endpoint", owner: entity.id });
      } else if (entity.kind === "arc") {
        targets.push({ p: entity.a, kind: "Endpoint", owner: entity.id });
        targets.push({ p: entity.b, kind: "Endpoint", owner: entity.id });
      } else if (entity.kind === "circle") {
        targets.push({ p: entity.c, kind: "Centre", owner: entity.id });
      }
    }
    for (const corner of wallJunctionCorners(walls)) {
      targets.push({ p: corner, kind: "Corner" });
    }
    // The inside and outside corners at each end of a curved wall.
    for (const wall of walls) {
      for (const corner of curvedWallCorners(wall)) targets.push({ p: corner, kind: "Corner" });
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
        const hit = projectOnWall(raw, wall);
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
        Math.max(current.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), 0.0004),
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
    setView({ ...v, zoom: Math.min(Math.max(v.zoom * factor, 0.0004), 4) });
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

  // A new structural element, with sensible starting sizes for its kind.
  function makeElem(type: string, a: Pt, b: Pt): Elem {
    const sizes: Record<string, { w: number; d: number; base: number; h: number }> = {
      column: { w: 300, d: 300, base: 0, h: settings.wallH },
      beam: { w: 230, d: 0, base: settings.wallH - 450, h: 450 },
      stair: { w: 1000, d: 0, base: 0, h: currentFloor.height },
      slab: { w: 0, d: 0, base: -150, h: 150 },
      railing: { w: 50, d: 0, base: 0, h: 1000 },
    };
    return { id: newId(), kind: "elem", type, a, b, ...sizes[type] };
  }

  function finishRoom() {
    // Two corners are enough when a curved wall closes the shape between them.
    if (followCurves(points, walls).length < 3) return;
    const room: Room = {
      id: newId(),
      kind: "room",
      pts: followCurves(points, walls), // hug any curved wall between corners
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
      const length = wallLength(wall);
      if (length < width) continue;
      const hit = projectOnWall(raw, wall);
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
      const found = id ? doc.entities.find((e) => e.id === id) : undefined;
      const hit = found && !isLocked(found) ? found : undefined;
      event.currentTarget.setPointerCapture(event.pointerId);
      if (!hit) {
        // Empty space: start a selection box.
        if (!event.shiftKey) setSelectedIds([]);
        dragRef.current = { kind: "box", start: raw };
        return;
      }
      if (event.shiftKey) {
        // Shift-click adds to, or removes from, the selection.
        setSelectedIds(
          selectedIds.includes(hit.id)
            ? selectedIds.filter((item) => item !== hit.id)
            : [...selectedIds, hit.id],
        );
        return;
      }
      if (selectedIds.length > 1 && selectedIds.includes(hit.id)) {
        // Drag the whole selection together.
        dragRef.current = {
          kind: "group",
          originals: doc.entities.filter((e) => selectedIds.includes(e.id)),
          start: raw,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
        return;
      }
      setSelectedId(hit.id);
      dragRef.current = {
        kind: "move",
        original: hit,
        start: raw,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      return;
    }

    // Angle lock only applies to tools that draw one straight piece after another.
    const straight =
      ["wall", "line", "room", "beam", "stair", "railing"].includes(tool) ||
      (tool === "dim" && points.length === 1);
    const from = straight && points.length > 0 ? points[points.length - 1] : null;
    const snapped = snapPoint(raw, from, event.shiftKey);
    const p = snapped.p;

    if (tool === "column") {
      commit([...doc.entities, makeElem("column", p, p)]);
    } else if (tool === "beam" || tool === "stair" || tool === "slab" || tool === "railing") {
      if (points.length === 0) {
        setPoints([p]);
      } else if (dist(points[0], p) >= 50) {
        commit([...doc.entities, makeElem(tool, points[0], p)]);
        setPoints(tool === "railing" ? [p] : []); // railings carry on round a balcony
      }
    } else if (tool === "cwall") {
      if (points.length === 0) {
        setPoints([p]);
      } else if (points.length === 1) {
        if (dist(points[0], p) >= 10) setPoints([points[0], p]);
      } else {
        commit([
          ...doc.entities,
          {
            id: newId(),
            kind: "wall",
            a: points[0],
            b: points[1],
            m: p,
            t: settings.wallT,
            h: settings.wallH,
          },
        ]);
        setPoints([points[1]]); // carry on from where this wall ended
      }
    } else if (tool === "wall" || tool === "line") {
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
        const id = newId();
        commit([
          ...doc.entities,
          { id, kind: "text", p, text: text.trim().slice(0, 200), size: 1 },
        ]);
        // Select it straight away, so its font, size and colour can be set.
        setToolState("select");
        setSelectedId(id);
      }
    } else if (tool === "measure") {
      if (points.length === 0) {
        setPoints([p]);
        setNotice("");
      } else {
        const length = dist(points[0], p);
        setNotice(
          `Distance: ${formatLength(length, "mm")} mm  =  ${formatLength(length, "m")}  =  ${formatLength(length, "ft")}`,
        );
        setPoints([]);
      }
    } else if (tool === "level") {
      const text = window.prompt(
        "Height at this point, in metres, compared with your zero level (for example +0.45 or -1.20):",
      );
      if (text && text.trim()) {
        commit([
          ...doc.entities,
          { id: newId(), kind: "text", p, text: text.trim().slice(0, 40), size: 1, level: true },
        ]);
      }
    } else if (tool === "rect") {
      if (points.length === 0) setPoints([p]);
      else addRectangle(points[0], p);
    } else if (tool === "circle") {
      if (points.length === 0) {
        setPoints([p]);
      } else if (dist(points[0], p) >= 10) {
        commit([
          ...doc.entities,
          { id: newId(), kind: "circle", c: points[0], r: Math.round(dist(points[0], p)) },
        ]);
        setPoints([]);
        setBuffer("");
      }
    } else if (tool === "arc") {
      if (points.length < 2) {
        setPoints([...points, p]);
      } else {
        commit([...doc.entities, { id: newId(), kind: "arc", a: points[0], b: points[1], m: p }]);
        setPoints([]);
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

    if (drag?.kind === "box") {
      setBox({ a: drag.start, b: raw });
      return;
    }

    if (drag?.kind === "group") {
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      drag.moved = true;
      let dx = raw[0] - drag.start[0];
      let dy = raw[1] - drag.start[1];
      if (settings.snap) {
        dx = Math.round(dx / 50) * 50;
        dy = Math.round(dy / 50) * 50;
      }
      setOverrides(drag.originals.map((e) => moveEntity(e, dx, dy)));
      return;
    }

    if (drag?.kind === "move") {
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      drag.moved = true;
      const original = drag.original;
      if (original.kind === "door" || original.kind === "window") {
        const wall = walls.find((w) => w.id === original.wallId);
        if (!wall) return;
        const length = wallLength(wall);
        const along = projectOnWall(raw, wall).along;
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
      if (original.kind === "wall" && drag.grip === "m") {
        setOverride({ ...original, m: snapped.p });
      } else if (
        original.kind === "wall" ||
        original.kind === "line" ||
        original.kind === "dim" ||
        original.kind === "elem"
      ) {
        setOverride(
          drag.grip === "a" ? { ...original, a: snapped.p } : { ...original, b: snapped.p },
        );
      } else if (original.kind === "arc") {
        setOverride({ ...original, [drag.grip]: snapped.p });
      } else if (original.kind === "room") {
        const index = Number(drag.grip);
        setOverride({
          ...original,
          pts: original.pts.map((point, i) => (i === index ? snapped.p : point)),
        });
      }
      return;
    }

    const chained =
      ["wall", "line", "room", "beam", "stair", "railing"].includes(tool) ||
      (tool === "dim" && points.length === 1);
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
    if (drag?.kind === "box" && box) {
      // Dragging left-to-right picks only what is fully inside the box;
      // right-to-left also picks anything the box touches (as in AutoCAD).
      const area: Box = {
        x: Math.min(box.a[0], box.b[0]),
        y: Math.min(box.a[1], box.b[1]),
        w: Math.abs(box.b[0] - box.a[0]),
        h: Math.abs(box.b[1] - box.a[1]),
      };
      const crossing = box.b[0] < box.a[0];
      if (area.w > 4 * px || area.h > 4 * px) {
        setSelectedIds(
          doc.entities
            .filter((e) => e.kind !== "image" && !settings.hidden.includes(layerOf(e)) && !isLocked(e))
            .filter((e) => {
              const own = entityBox(e, walls);
              return crossing ? boxTouches(area, own) : boxContains(area, own);
            })
            .map((e) => e.id),
        );
      }
    } else if (drag && drag.kind !== "pan" && overrides.length > 0) {
      commit(doc.entities.map((e) => overrides.find((o) => o.id === e.id) ?? e));
    }
    setBox(null);
    setOverrides([]);
  }

  function endCommand() {
    if (tool === "room" && points.length >= 2) finishRoom();
    else setPoints([]);
    setBuffer("");
  }

  // --- Files --------------------------------------------------------------------------------

  function newDrawing() {
    if (doc.entities.length > 0 && !window.confirm("Start a new, empty drawing? You can undo this.")) return;
    saveFull({ ...full, floors: [GROUND_FLOOR], entities: [], site: null });
    switchFloor(GROUND_FLOOR.id);
    setView(null);
  }

  function saveProject() {
    const data = { app: "archhub", kind: "plan", version: 2, plan: full };
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
    saveFull(opened);
    switchFloor(opened.floors?.find((f) => f.id === GROUND_FLOOR.id)?.id ?? opened.floors![0].id);
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
      window.alert("Nothing that can be imported was found in that DXF file.");
      return;
    }
    commit([...doc.entities, ...result.lines]);
    setView(null);
    setNotice(
      `Imported ${result.lines.length} objects` +
        (result.skipped > 0 ? `; ${result.skipped} other items (blocks, hatches) were skipped.` : "."),
    );
  }

  // Places a picture (site map, survey, scanned plan) under the drawing.
  async function addTraceImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const photo = await loadPhoto(file, 1600);
      // Start at the site's width if there is one, otherwise 20 metres wide.
      const w = doc.site ? doc.site.w : 20000;
      const h = Math.round((w * photo.height) / photo.width);
      const image: Entity = {
        id: newId(),
        kind: "image",
        p: doc.site ? [0, 0] : [Math.round(v.cx - w / 2), Math.round(v.cy - h / 2)],
        w,
        h,
        href: photo.href,
        opacity: 0.6,
      };
      commit([...doc.entities, image]);
      setToolState("select");
      setSelectedId(image.id);
      setView(null);
      setNotice(
        isSavedInBrowser(storageKey)
          ? "Picture added. Set its real width on the right so it is at true scale."
          : "Picture added, but the browser's saving space is full. Use Save to keep your work.",
      );
    } catch {
      window.alert("That file could not be opened as a picture. Choose a JPG or PNG. (For a PDF, take a screenshot of the page first.)");
    }
  }

  function duplicateSelected() {
    if (selectedMany.length === 0) return;
    const wallIds = new Map<string, string>();
    const copies: Entity[] = [];
    for (const entity of selectedMany) {
      if (entity.kind === "door" || entity.kind === "window") continue;
      const copy = { ...moveEntity(entity, 500, 500), id: newId() };
      if (entity.kind === "wall") wallIds.set(entity.id, copy.id);
      copies.push(copy);
    }
    // Doors and windows are copied along with their wall.
    for (const entity of doc.entities) {
      if ((entity.kind === "door" || entity.kind === "window") && wallIds.has(entity.wallId)) {
        copies.push({ ...entity, id: newId(), wallId: wallIds.get(entity.wallId)! });
      }
    }
    if (copies.length === 0) return;
    commit([...doc.entities, ...copies]);
    setSelectedIds(
      copies.filter((e) => e.kind !== "door" && e.kind !== "window").map((e) => e.id),
    );
  }

  // Rotate and mirror work about the middle of everything selected.
  function transformSelected(
    change: (entity: Entity, centre: Pt) => Entity,
    withOpenings: boolean,
  ) {
    if (selectedMany.length === 0) return;
    const boxes = selectedMany.map((e) => entityBox(e, walls));
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const centre: Pt = [
      Math.round((minX + maxX) / 20) * 10,
      Math.round((minY + maxY) / 20) * 10,
    ];
    const wallIds = new Set(selectedMany.filter((e) => e.kind === "wall").map((e) => e.id));
    commit(
      doc.entities.map((e) => {
        const isOpening = e.kind === "door" || e.kind === "window";
        if (selectedIds.includes(e.id) && !isOpening) return change(e, centre);
        if (withOpenings && isOpening && wallIds.has(e.wallId)) return change(e, centre);
        return e;
      }),
    );
  }

  const rotateSelected = (degrees: number) =>
    transformSelected((e, centre) => rotateEntity(e, centre, degrees), false);
  const mirrorSelected = (axis: "x" | "y") =>
    transformSelected((e, centre) => mirrorEntity(e, centre, axis), true);

  // A parallel copy of a wall or line, like AutoCAD's OFFSET.
  function offsetSelected(distance: number) {
    if (!selected || (selected.kind !== "wall" && selected.kind !== "line")) return;
    let copy: Entity;
    const shape = selected.kind === "wall" ? wallShape(selected) : null;
    if (selected.kind === "wall" && selected.m && shape?.curved) {
      // A curved wall is offset by growing or shrinking its radius.
      const scale = Math.max((shape.r + distance) / shape.r, 0.05);
      const grow = (p: Pt): Pt =>
        roundPt([shape.c[0] + (p[0] - shape.c[0]) * scale, shape.c[1] + (p[1] - shape.c[1]) * scale]);
      copy = { ...selected, id: newId(), a: grow(selected.a), b: grow(selected.b), m: grow(selected.m) };
    } else {
      const [a, b] = offsetPoints(selected.a, selected.b, distance);
      copy = { ...selected, id: newId(), a, b };
    }
    commit([...doc.entities, copy]);
    setSelectedId(copy.id);
  }

  function addRectangle(a: Pt, c: Pt) {
    if (Math.abs(c[0] - a[0]) < 10 || Math.abs(c[1] - a[1]) < 10) return;
    const corners: Pt[] = [a, [c[0], a[1]], c, [a[0], c[1]]];
    const sides: Entity[] = corners.map((corner, index) => {
      const next = corners[(index + 1) % 4];
      return options.rectAs === "wall"
        ? { id: newId(), kind: "wall", a: corner, b: next, t: settings.wallT, h: settings.wallH }
        : { id: newId(), kind: "line", a: corner, b: next };
    });
    commit([...doc.entities, ...sides]);
    setPoints([]);
    setBuffer("");
  }

  const exportName = `floor-plan-${safeFileName(currentFloor.name, "floor")}`;

  function exportImage(kind: "png" | "svg") {
    const svg = svgRef.current;
    if (!svg) return;
    const { source, width, height } = buildExportSvg(svg, doc);
    if (kind === "svg") {
      downloadBlob(new Blob([source], { type: "image/svg+xml" }), `${exportName}.svg`);
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
        if (blob) downloadBlob(blob, `${exportName}.png`);
      }, "image/png");
    };
    image.onerror = () => window.alert("Sorry, the image could not be created in this browser.");
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  function exportDxfFile() {
    downloadBlob(new Blob([exportDxf(doc)], { type: "application/dxf" }), `${exportName}.dxf`);
  }

  function useSiteStudy() {
    let width = 0;
    let depth = 0;
    let facing = "";
    try {
      const stored = JSON.parse(window.localStorage.getItem(projectKey(PLANNER_KEY, project.id)) ?? "{}");
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

  // --- Keyboard ---------------------------------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = event.key;

      if (event.ctrlKey || event.metaKey) {
        const lower = key.toLowerCase();
        if (lower === "a") {
          event.preventDefault();
          setToolState("select");
          setSelectedIds(doc.entities.filter((e) => e.kind !== "image" && !isLocked(e)).map((e) => e.id));
          return;
        }
        if (lower === "d") {
          event.preventDefault();
          duplicateSelected();
          return;
        }
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
      const typingSize = (tool === "rect" || tool === "circle") && points.length > 0;
      if (
        ((drawingLength || typingSize) && /^[0-9.]$/.test(key)) ||
        (tool === "rect" && typingSize && key === ",")
      ) {
        setBuffer(buffer + key);
        return;
      }
      if (key === "Backspace" && buffer) {
        event.preventDefault();
        setBuffer(buffer.slice(0, -1));
        return;
      }
      if (key === "Enter") {
        if (typingSize && buffer) {
          const start = points[0];
          if (tool === "rect") {
            // Typed as width,height - for example 4000,3000
            const [w, h] = buffer.split(",").map((part) => parseLength(part, settings.unit));
            if (w && h) {
              const signX = cursor && cursor.p[0] < start[0] ? -1 : 1;
              const signY = cursor && cursor.p[1] < start[1] ? -1 : 1;
              addRectangle(start, [start[0] + signX * w, start[1] + signY * h]);
            }
          } else {
            const radius = parseLength(buffer, settings.unit);
            if (radius) {
              commit([...doc.entities, { id: newId(), kind: "circle", c: start, r: radius }]);
              setPoints([]);
            }
          }
          setBuffer("");
          return;
        }
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
      if (key === "Delete" && selectedIds.length > 0) {
        deleteSelected();
        return;
      }
      const shortcut = TOOLS.find((item) => item.key.toLowerCase() === key.toLowerCase());
      if (shortcut && !buffer) setTool(shortcut.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // --- What the command line says -----------------------------------------------------------------

  let prompt = "";
  if (tool === "select") prompt = "Click to select, Shift-click to add. Drag empty space to box-select. Drag objects to move them.";
  else if (tool === "level") prompt = "LEVEL MARK: click the point, then type its height.";
  else if (tool === "column") prompt = "COLUMN: click where each column stands. Select one afterwards to change its size.";
  else if (tool === "beam") prompt = points.length === 0 ? "BEAM: click one end." : "Click the other end.";
  else if (tool === "stair") prompt = points.length === 0 ? "STAIR: click the bottom step." : "Click the top of the stair.";
  else if (tool === "slab") prompt = points.length === 0 ? "SLAB: click one corner (balcony, canopy or sunshade)." : "Click the opposite corner.";
  else if (tool === "railing") prompt = points.length === 0 ? "RAILING: click the start." : "Click the next point. Esc to finish.";
  else if (tool === "measure") {
    prompt = points.length === 0 ? "MEASURE: click the first point." : "Click the second point to read the distance.";
  }
  else if (tool === "rect") {
    prompt =
      points.length === 0
        ? "RECTANGLE: click the first corner."
        : "Click the opposite corner, or type width,height (for example 4000,3000) and press Enter.";
  } else if (tool === "circle") {
    prompt = points.length === 0 ? "CIRCLE: click the centre." : "Click for the radius, or type it and press Enter.";
  } else if (tool === "arc") {
    prompt = ["ARC: click the start point.", "Click the end point.", "Click a point the arc should pass through."][points.length];
  }
  else if (tool === "pan") prompt = "Drag to move around the drawing. Scroll to zoom.";
  else if (tool === "cwall") {
    prompt = [
      "CURVED WALL: click the start point.",
      "Click the end point.",
      "Click a point the wall should bend through. The next wall then starts from this one's end; Esc to finish.",
    ][Math.min(points.length, 2)];
  } else if (tool === "wall" || tool === "line") {
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

  const gridStep = [50, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000].find((s) => s * v.zoom >= 14) ?? 500000;
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
          <path d={wallOutline(selected, [])} {...mark} />
          {grip(selected.a, "a")}
          {grip(selected.b, "b")}
          {selected.m && grip(selected.m, "m")}
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
    } else if (selected.kind === "elem") {
      const outline = elemRect(selected);
      selectionMark = (
        <>
          <rect
            x={-outline.length / 2 - 4 * px}
            y={-outline.width / 2 - 4 * px}
            width={outline.length + 8 * px}
            height={outline.width + 8 * px}
            transform={`translate(${outline.centre[0]} ${outline.centre[1]}) rotate(${(outline.angle * 180) / Math.PI})`}
            {...mark}
          />
          {selected.type !== "column" && grip(selected.a, "a")}
          {selected.type !== "column" && grip(selected.b, "b")}
        </>
      );
    } else if (selected.kind === "circle") {
      selectionMark = <circle cx={selected.c[0]} cy={selected.c[1]} r={selected.r} {...mark} />;
    } else if (selected.kind === "arc") {
      selectionMark = (
        <>
          <path d={arcPath(selected.a, selected.m, selected.b)} {...mark} />
          {grip(selected.a, "a")}
          {grip(selected.b, "b")}
          {grip(selected.m, "m")}
        </>
      );
    } else if (selected.kind === "image") {
      selectionMark = (
        <rect x={selected.p[0]} y={selected.p[1]} width={selected.w} height={selected.h} {...mark} />
      );
    } else {
      const wall = walls.find((w) => w.id === selected.wallId);
      if (wall) {
        const spot = wallPointAt(wall, selected.pos);
        const centre = spot.p;
        selectionMark = (
          <rect
            x={-selected.width / 2 - 4 * px}
            y={-wall.t / 2 - 4 * px}
            width={selected.width + 8 * px}
            height={wall.t + 8 * px}
            transform={`translate(${centre[0]} ${centre[1]}) rotate(${spot.angle})`}
            {...mark}
          />
        );
      }
    }
  }

  const totalArea = rooms.reduce((sum, room) => sum + polygonArea(room.pts), 0);
  const buildingArea = full.entities.reduce(
    (sum, e) => (e.kind === "room" ? sum + polygonArea(e.pts) : sum),
    0,
  );
  const canvasCursor = tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
  const groups = [...new Set(TOOLS.map((item) => item.group))];
  const furnitureGroups = [...new Set(FURNITURE.map((item) => item.group))];

  // --- The right-hand panel for the selected object -------------------------------------------------

  function selectionPanel(entity: Entity) {
    const actions = (
      <div className="flex flex-wrap gap-1.5 pt-1">
        {entity.kind !== "door" && entity.kind !== "window" && (
          <>
            <Btn onClick={duplicateSelected} title="Ctrl+D">
              Duplicate
            </Btn>
            {entity.kind !== "image" && (
              <>
                <Btn onClick={() => rotateSelected(90)}>Rotate 90°</Btn>
                <Btn onClick={() => mirrorSelected("x")}>Mirror ↔</Btn>
                <Btn onClick={() => mirrorSelected("y")}>Mirror ↕</Btn>
              </>
            )}
          </>
        )}
        <Btn onClick={deleteSelected} danger>
          Delete
        </Btn>
      </div>
    );
    if (entity.kind === "image") {
      return (
        <Section title="Traced picture">
          <Row label="Real width">
            <NumInput
              value={entity.w}
              min={100}
              suffix="mm"
              onCommit={(w) =>
                updateEntity({ ...entity, w, h: Math.round((w * entity.h) / entity.w) })
              }
            />
          </Row>
          <Row label="Opacity">
            <NumInput
              value={Math.round(entity.opacity * 100)}
              min={5}
              suffix="%"
              onCommit={(value) => updateEntity({ ...entity, opacity: Math.min(value, 100) / 100 })}
            />
          </Row>
          <p className="text-[#8b9099]">
            To bring it to true scale: measure something you know on the picture (for example the site
            width) and set the real width so they match. Drag to position it, then draw over it.
          </p>
          {actions}
        </Section>
      );
    }
    if (entity.kind === "wall") {
      const shape = wallShape(entity);
      return (
        <Section title={shape.curved ? "Curved wall" : "Wall"}>
          {shape.curved ? (
            <>
              <Row label="Length along curve">
                <span className="text-[#e6e8ec]">{formatLength(shape.length, settings.unit)}</span>
              </Row>
              <Row label="Radius (centre line)">
                <span className="text-[#e6e8ec]">{formatLength(shape.r, settings.unit)}</span>
              </Row>
              <Btn
                onClick={() =>
                  updateEntity({ id: entity.id, kind: "wall", a: entity.a, b: entity.b, t: entity.t, h: entity.h })
                }
              >
                Make straight
              </Btn>
            </>
          ) : (
            <>
              <Row label="Length">
                <NumInput
                  value={Math.round(shape.length)}
                  min={10}
                  suffix="mm"
                  onCommit={(value) =>
                    updateEntity({ ...entity, b: roundPt(add(entity.a, mul(unit(entity.a, entity.b), value))) })
                  }
                />
              </Row>
              <Btn
                onClick={() => {
                  // Start with a gentle bend to one side; drag the middle square to adjust.
                  const d = unit(entity.a, entity.b);
                  const middle = mid(entity.a, entity.b);
                  const bulge = shape.length * 0.2;
                  updateEntity({
                    ...entity,
                    m: roundPt([middle[0] - d[1] * bulge, middle[1] + d[0] * bulge]),
                  });
                }}
              >
                Make curved
              </Btn>
            </>
          )}
          <Row label="Thickness">
            <NumInput value={entity.t} min={20} suffix="mm" onCommit={(t) => updateEntity({ ...entity, t })} />
          </Row>
          <Row label="Height">
            <NumInput value={entity.h} min={100} suffix="mm" onCommit={(h) => updateEntity({ ...entity, h })} />
          </Row>
          <Row label="Offset copy">
            <NumInput value={options.offset} min={1} suffix="mm" onCommit={(offset) => setOptions({ ...options, offset })} />
          </Row>
          <div className="flex flex-wrap gap-1.5">
            <Btn onClick={() => offsetSelected(options.offset)}>Offset one side</Btn>
            <Btn onClick={() => offsetSelected(-options.offset)}>Offset other side</Btn>
          </div>
          <p className="text-[#8b9099]">
            Drag the blue squares to move either end{entity.m ? ", or the middle one to change the bend" : ""}.
          </p>
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
          <Row label="Font">
            <Select value={entity.font ?? "sans"} options={TEXT_FONTS} onChange={(font) => updateEntity({ ...entity, font })} />
          </Row>
          <div className="flex flex-wrap gap-1.5">
            <Btn active={entity.bold === true} onClick={() => updateEntity({ ...entity, bold: !entity.bold })}>
              Bold
            </Btn>
            <Btn active={entity.italic === true} onClick={() => updateEntity({ ...entity, italic: !entity.italic })}>
              Italic
            </Btn>
            <Btn onClick={() => updateEntity({ ...entity, text: entity.text.toUpperCase() })}>CAPITALS</Btn>
          </div>
          <Row label="Rotation">
            <NumInput value={entity.rot ?? 0} suffix="°" onCommit={(rot) => updateEntity({ ...entity, rot })} />
            <Btn onClick={() => updateEntity({ ...entity, rot: ((entity.rot ?? 0) + 90) % 360 })}>+90°</Btn>
          </Row>
          <Row label="Colour">
            <input
              type="color"
              value={entity.color || "#1f1f1f"}
              onChange={(event) => updateEntity({ ...entity, color: event.target.value })}
              aria-label="Text colour"
              className="h-7 w-10 cursor-pointer rounded border border-[#3a3e45] bg-transparent"
            />
            <Btn onClick={() => updateEntity({ ...entity, color: "" })} disabled={!entity.color}>
              Reset
            </Btn>
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
    if (entity.kind === "elem") {
      const name = ELEM_TYPES.find((item) => item.id === entity.type)?.name ?? "Element";
      const column = entity.type === "column";
      const slab = entity.type === "slab";
      return (
        <Section title={name}>
          {!column && (
            <Row label={slab ? "Size" : "Length"}>
              <span className="text-[#e6e8ec]">
                {slab
                  ? `${Math.round(Math.abs(entity.b[0] - entity.a[0]))} x ${Math.round(Math.abs(entity.b[1] - entity.a[1]))} mm`
                  : formatLength(dist(entity.a, entity.b), settings.unit)}
              </span>
            </Row>
          )}
          {!slab && (
            <Row label={column ? "Width" : "Width across"}>
              <NumInput value={entity.w} min={10} suffix="mm" onCommit={(w) => updateEntity({ ...entity, w })} />
            </Row>
          )}
          {column && (
            <Row label="Depth">
              <NumInput value={entity.d} min={10} suffix="mm" onCommit={(d) => updateEntity({ ...entity, d })} />
            </Row>
          )}
          <Row label={entity.type === "stair" ? "Total rise" : slab ? "Thickness" : "Height"}>
            <NumInput value={entity.h} min={10} suffix="mm" onCommit={(h) => updateEntity({ ...entity, h })} />
          </Row>
          <Row label="Starts above floor">
            <NumInput value={entity.base} suffix="mm" onCommit={(base) => updateEntity({ ...entity, base })} />
          </Row>
          {entity.type === "stair" && (
            <div className="flex flex-wrap gap-1.5">
              <Btn active={entity.turn !== "u"} onClick={() => updateEntity({ ...entity, turn: "" })}>
                Straight flight
              </Btn>
              <Btn active={entity.turn === "u"} onClick={() => updateEntity({ ...entity, turn: "u" })}>
                U-turn with landing
              </Btn>
            </div>
          )}
          {entity.type === "stair" && (
            <p className="text-[#8b9099]">
              {Math.max(2, Math.round(entity.h / 170))} steps, each about{" "}
              {Math.round(entity.h / Math.max(2, Math.round(entity.h / 170)))} mm high and{" "}
              {Math.round(dist(entity.a, entity.b) / Math.max(2, Math.round(entity.h / 170)))} mm deep.
            </p>
          )}
          {slab && (
            <p className="text-[#8b9099]">
              For a balcony keep it at floor level (starts at -150). For a canopy or sunshade, set
              &ldquo;Starts above floor&rdquo; to its height, for example 2400.
            </p>
          )}
          {actions}
        </Section>
      );
    }
    if (entity.kind === "circle") {
      return (
        <Section title="Circle">
          <Row label="Radius">
            <NumInput value={entity.r} min={10} suffix="mm" onCommit={(r) => updateEntity({ ...entity, r })} />
          </Row>
          <Row label="Area">
            <span className="text-[#e6e8ec]">{formatArea(Math.PI * entity.r * entity.r)}</span>
          </Row>
          {actions}
        </Section>
      );
    }
    if (entity.kind === "arc") {
      return (
        <Section title="Arc">
          <p className="text-[#8b9099]">Drag the three blue squares to reshape the arc.</p>
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
        <Link href="/dashboard" className="mr-1 shrink-0 font-mono text-[13px] font-semibold text-white">
          ← Arch<span className="text-[#d17e5b]">Hub</span>
        </Link>
        <span className="mr-2 shrink-0 border-l border-[#3a3e45] pl-3 text-[13px] text-[#b4b8c0]">
          {project.name} · Floor Plan Studio
        </span>
        <select
          value={currentFloor.id}
          onChange={(event) => switchFloor(event.target.value)}
          aria-label="Floor"
          title="Switch floor"
          className="mr-1 h-7 shrink-0 rounded border border-[#d17e5b] bg-[#15161a] px-2 text-[12px] text-white outline-none"
        >
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
            </option>
          ))}
        </select>
        <Btn onClick={newDrawing}>New</Btn>
        <Btn onClick={() => openRef.current?.click()}>Open</Btn>
        <Btn onClick={saveProject}>Save</Btn>
        <span className="mx-1 h-5 w-px shrink-0 bg-[#3a3e45]" />
        <Btn onClick={() => dxfRef.current?.click()} title="Bring in lines from a DXF file (AutoCAD: Save As DXF)">
          Import DXF
        </Btn>
        <Btn onClick={() => traceRef.current?.click()} title="Place a site map, survey or scanned plan under the drawing to trace over">
          Trace image
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
        <Link
          href="/elevations"
          title="See the elevations drawn from these plans"
          className="ml-1 flex h-7 shrink-0 items-center rounded border border-[#3a3e45] bg-[#26282d] px-2.5 text-[12px] text-[#d7d9de] hover:border-[#6b7280]"
        >
          Elevations →
        </Link>
        <span className="flex-1" />
        <Btn
          onClick={() => {
            const visible = panelOpen ?? window.matchMedia("(min-width: 768px)").matches;
            setPanelOpen(!visible);
          }}
          title="Show or hide the properties panel"
        >
          Panel
        </Btn>
        <input ref={openRef} type="file" accept=".json,application/json" onChange={openProject} className="hidden" aria-label="Open plan file" />
        <input ref={dxfRef} type="file" accept=".dxf" onChange={importDxfFile} className="hidden" aria-label="Import DXF file" />
        <input ref={traceRef} type="file" accept="image/*" onChange={addTraceImage} className="hidden" aria-label="Add image to trace" />
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
                    tool === item.id ? "bg-[#d17e5b] text-white" : "text-[#d7d9de] hover:bg-[#2c2f35]"
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

            {settings.ghost && ghostWalls.length > 0 && (
              <g data-export="skip" pointerEvents="none" opacity="0.3">
                {ghostWalls.map((wall) => (
                  <path
                    key={wall.id}
                    d={wallOutline(wall, ghostWalls)}
                    fill="none"
                    stroke={style.ink}
                    strokeWidth="1"
                    strokeDasharray="6 4"
                  />
                ))}
              </g>
            )}

            <PlanDrawing doc={shown} activeId={selectedId} />

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

              {selectedIds.length > 1 &&
                selectedMany.map((entity) => {
                  const own = entityBox(entity, walls);
                  return (
                    <rect
                      key={entity.id}
                      x={own.x - 3 * px}
                      y={own.y - 3 * px}
                      width={own.w + 6 * px}
                      height={own.h + 6 * px}
                      fill="none"
                      stroke={ACCENT}
                      strokeWidth="1.3"
                      strokeDasharray="5 4"
                      pointerEvents="none"
                    />
                  );
                })}

              {box && (
                <rect
                  x={Math.min(box.a[0], box.b[0])}
                  y={Math.min(box.a[1], box.b[1])}
                  width={Math.abs(box.b[0] - box.a[0])}
                  height={Math.abs(box.b[1] - box.a[1])}
                  fill={box.b[0] < box.a[0] ? "#39c06b" : ACCENT}
                  fillOpacity="0.12"
                  stroke={box.b[0] < box.a[0] ? "#39c06b" : ACCENT}
                  strokeWidth="1"
                  strokeDasharray={box.b[0] < box.a[0] ? "5 4" : undefined}
                  pointerEvents="none"
                />
              )}

              {["beam", "stair", "slab", "railing"].includes(tool) && points.length > 0 && cursor && (
                <g pointerEvents="none" stroke={ACCENT} strokeWidth="1.3" fill={ACCENT} fillOpacity="0.12">
                  {tool === "slab" ? (
                    <rect
                      x={Math.min(points[0][0], cursor.p[0])}
                      y={Math.min(points[0][1], cursor.p[1])}
                      width={Math.abs(cursor.p[0] - points[0][0])}
                      height={Math.abs(cursor.p[1] - points[0][1])}
                    />
                  ) : (
                    <line x1={points[0][0]} y1={points[0][1]} x2={cursor.p[0]} y2={cursor.p[1]} strokeWidth="2" />
                  )}
                  <text x={cursor.p[0] + 14 * px} y={cursor.p[1] - 12 * px} fontSize={12 * px} fill={ACCENT} fillOpacity="1" stroke={style.paper} strokeWidth="3" paintOrder="stroke">
                    {formatLength(dist(points[0], cursor.p), settings.unit)}
                  </text>
                </g>
              )}

              {tool === "cwall" && points.length > 0 && cursor && (
                <path
                  d={
                    points.length === 1
                      ? `M ${points[0].join(" ")} L ${cursor.p.join(" ")}`
                      : wallOutline(
                          { id: "preview", kind: "wall", a: points[0], b: points[1], m: cursor.p, t: settings.wallT, h: 0 },
                          [],
                        )
                  }
                  fill={ACCENT}
                  fillOpacity="0.18"
                  stroke={ACCENT}
                  strokeWidth="1.2"
                  pointerEvents="none"
                />
              )}

              {tool === "rect" && points.length > 0 && cursor && (
                <g pointerEvents="none">
                  <rect
                    x={Math.min(points[0][0], cursor.p[0])}
                    y={Math.min(points[0][1], cursor.p[1])}
                    width={Math.abs(cursor.p[0] - points[0][0])}
                    height={Math.abs(cursor.p[1] - points[0][1])}
                    fill={ACCENT}
                    fillOpacity="0.1"
                    stroke={ACCENT}
                    strokeWidth="1.2"
                  />
                  <text x={cursor.p[0] + 14 * px} y={cursor.p[1] - 12 * px} fontSize={12 * px} fill={ACCENT} stroke={style.paper} strokeWidth="3" paintOrder="stroke">
                    {formatLength(Math.abs(cursor.p[0] - points[0][0]), settings.unit)} x{" "}
                    {formatLength(Math.abs(cursor.p[1] - points[0][1]), settings.unit)}
                  </text>
                </g>
              )}

              {tool === "circle" && points.length > 0 && cursor && (
                <g pointerEvents="none">
                  <circle cx={points[0][0]} cy={points[0][1]} r={dist(points[0], cursor.p)} fill="none" stroke={ACCENT} strokeWidth="1.2" />
                  <text x={cursor.p[0] + 14 * px} y={cursor.p[1] - 12 * px} fontSize={12 * px} fill={ACCENT} stroke={style.paper} strokeWidth="3" paintOrder="stroke">
                    R {formatLength(dist(points[0], cursor.p), settings.unit)}
                  </text>
                </g>
              )}

              {tool === "arc" && points.length > 0 && cursor && (
                <path
                  d={
                    points.length === 1
                      ? `M ${points[0].join(" ")} L ${cursor.p.join(" ")}`
                      : arcPath(points[0], cursor.p, points[1])
                  }
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth="1.2"
                  pointerEvents="none"
                />
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

              {tool === "measure" && points.length > 0 && cursor && (
                <g pointerEvents="none">
                  <line x1={points[0][0]} y1={points[0][1]} x2={cursor.p[0]} y2={cursor.p[1]} stroke={ACCENT} strokeWidth="1.2" strokeDasharray="5 4" />
                  <text x={cursor.p[0] + 14 * px} y={cursor.p[1] - 12 * px} fontSize={12 * px} fill={ACCENT} stroke={style.paper} strokeWidth="3" paintOrder="stroke">
                    {formatLength(dist(points[0], cursor.p), settings.unit)}
                  </text>
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
                  transform={`translate(${wallPointAt(hoverWall, hoverOpening.pos).p.join(" ")}) rotate(${wallPointAt(hoverWall, hoverOpening.pos).angle})`}
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
        {
          <aside
            className={`absolute bottom-8 right-0 top-11 z-10 w-[280px] overflow-y-auto border-l border-[#2f3237] bg-[#202226] md:static md:shrink-0 ${
              panelOpen === null ? "hidden md:block" : panelOpen ? "block" : "hidden"
            }`}
          >
            <Section title="Floors">
              <div className="space-y-0.5">
                {floors.map((floor) => (
                  <button
                    key={floor.id}
                    type="button"
                    aria-pressed={floor.id === currentFloor.id}
                    onClick={() => switchFloor(floor.id)}
                    className={`flex h-7 w-full items-center justify-between rounded px-2 text-left ${
                      floor.id === currentFloor.id ? "bg-[#d17e5b] text-white" : "hover:bg-[#2c2f35]"
                    }`}
                  >
                    <span>{floor.name}</span>
                    <span className={`font-mono text-[10px] ${floor.id === currentFloor.id ? "text-white/85" : "text-[#8b9099]"}`}>
                      {floor.level >= 0 ? "+" : ""}
                      {(floor.level / 1000).toFixed(2)} m
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Btn onClick={() => addFloor("above")} title="Add an empty floor on top">
                  + Floor above
                </Btn>
                <Btn onClick={() => addFloor("below")} title="Add a basement below the lowest floor">
                  + Basement
                </Btn>
                <Btn onClick={() => addFloor("above", true)} title="Add a floor on top with a copy of this floor's walls, doors and windows">
                  Copy this floor up
                </Btn>
              </div>
              <Row label="Name">
                <TextInput value={currentFloor.name} onCommit={(name) => updateFloor({ name: name.trim() || currentFloor.name })} />
              </Row>
              <Row label="Floor level">
                <NumInput value={currentFloor.level} suffix="mm" onCommit={(level) => updateFloor({ level })} />
              </Row>
              <Row label="Floor-to-floor height">
                <NumInput value={currentFloor.height} min={500} suffix="mm" onCommit={(height) => updateFloor({ height })} />
              </Row>
              <Toggle label="Show the floor below faintly" checked={settings.ghost} onChange={(ghost) => setSettings({ ghost })} />
              <Btn onClick={deleteFloor} disabled={floors.length < 2} danger>
                Delete this floor
              </Btn>
            </Section>

            {selectedMany.length > 0 && (
              <Section title="Layer of selection">
                <Select
                  value={
                    selectedMany.every((e) => layerOf(e) === layerOf(selectedMany[0]))
                      ? layerOf(selectedMany[0])
                      : ""
                  }
                  options={[
                    ...(selectedMany.every((e) => layerOf(e) === layerOf(selectedMany[0]))
                      ? []
                      : [{ id: "", name: "(mixed)" }]),
                    ...allLayers.filter((layer) => !["site", "marks", "underlay"].includes(layer.id)),
                  ]}
                  onChange={(layer) => layer && assignLayer(layer)}
                />
              </Section>
            )}

            {selected && selectionPanel(selected)}

            {selectedIds.length > 1 && (
              <Section title={`${selectedIds.length} objects selected`}>
                <div className="flex flex-wrap gap-1.5">
                  <Btn onClick={duplicateSelected} title="Ctrl+D">
                    Duplicate
                  </Btn>
                  <Btn onClick={() => rotateSelected(90)}>Rotate 90°</Btn>
                  <Btn onClick={() => mirrorSelected("x")}>Mirror ↔</Btn>
                  <Btn onClick={() => mirrorSelected("y")}>Mirror ↕</Btn>
                  <Btn onClick={deleteSelected} danger>
                    Delete
                  </Btn>
                </div>
                <p className="text-[#8b9099]">Drag any selected object to move them all together.</p>
              </Section>
            )}

            {tool === "rect" && (
              <Section title="Rectangle tool">
                <p className="text-[#b4b8c0]">Draw the rectangle as:</p>
                <div className="flex flex-wrap gap-1.5">
                  <Btn active={options.rectAs === "wall"} onClick={() => setOptions({ ...options, rectAs: "wall" })}>
                    Four walls
                  </Btn>
                  <Btn active={options.rectAs === "line"} onClick={() => setOptions({ ...options, rectAs: "line" })}>
                    Thin lines
                  </Btn>
                </div>
              </Section>
            )}

            {(tool === "wall" || tool === "cwall") && (
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
                    <span>This floor</span>
                    <span>
                      {formatArea(totalArea)} · {formatAreaFeet(totalArea)}
                    </span>
                  </div>
                  {floors.length > 1 && (
                    <div className="flex justify-between px-1 text-[#b4b8c0]">
                      <span>All floors</span>
                      <span>
                        {formatArea(buildingArea)} · {formatAreaFeet(buildingArea)}
                      </span>
                    </div>
                  )}
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

            {doc.entities.some((e) => e.kind === "image") && (
              <Section title="Traced pictures">
                {doc.entities
                  .filter((e) => e.kind === "image")
                  .map((image, index) => (
                    <Btn
                      key={image.id}
                      active={selectedId === image.id}
                      onClick={() => {
                        setToolState("select");
                        setSelectedId(image.id);
                      }}
                    >
                      Select picture {index + 1}
                    </Btn>
                  ))}
                <p className="text-[#8b9099]">
                  A picture can only be moved while it is selected here, so it stays out of the way.
                </p>
              </Section>
            )}

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
              <p className="text-[#8b9099]">
                Tick to show. Lock a layer to protect it from changes. Line weight is the printed pen
                thickness.
              </p>
              {allLayers.map((layer) => {
                const look = settings.layerLooks?.[layer.id] ?? {};
                const custom = layer.id.startsWith("c-");
                return (
                  <div key={layer.id} className="rounded border border-[#2f3237] p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Toggle
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
                      <Btn
                        active={look.locked === true}
                        onClick={() => setLayerLook(layer.id, { locked: !look.locked })}
                        title="Locked layers cannot be selected or moved"
                      >
                        {look.locked ? "Locked" : "Lock"}
                      </Btn>
                    </div>
                    {!["underlay", "rooms", "marks"].includes(layer.id) && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Select
                          value={look.weight ? String(look.weight) : ""}
                          options={[
                            { id: "", name: "Weight: by style" },
                            ...LINE_WEIGHTS.map((w) => ({ id: String(w), name: `${w.toFixed(2)} mm` })),
                          ]}
                          onChange={(value) => setLayerLook(layer.id, { weight: value ? Number(value) : undefined })}
                        />
                        <input
                          type="color"
                          value={look.color || "#888888"}
                          onChange={(event) => setLayerLook(layer.id, { color: event.target.value })}
                          aria-label={`${layer.name} colour`}
                          title="Line colour"
                          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-[#3a3e45] bg-transparent"
                        />
                        <Btn onClick={() => setLayerLook(layer.id, { color: undefined })} disabled={!look.color} title="Use the render style's colour">
                          Reset
                        </Btn>
                        {custom && (
                          <Btn
                            danger
                            title="Remove this layer; its objects go back to their usual layers"
                            onClick={() => {
                              saveFull({
                                ...full,
                                entities: full.entities.map((e) => {
                                  if (e.layer !== layer.id) return e;
                                  const next = { ...e };
                                  delete next.layer;
                                  return next;
                                }),
                                settings: {
                                  ...settings,
                                  customLayers: (settings.customLayers ?? []).filter((item) => item.id !== layer.id),
                                },
                              });
                            }}
                          >
                            ✕
                          </Btn>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <Btn onClick={addLayer}>+ New layer</Btn>
            </Section>
          </aside>
        }
      </div>

      {/* Command line and status */}
      <footer className={`${bar} h-8 shrink-0 overflow-x-auto border-t px-2`}>
        <span className="shrink-0 font-mono text-[#d17e5b]">&gt;</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[#d7d9de]">
          {notice || prompt}
          {buffer && <span className="ml-2 rounded bg-[#d17e5b] px-1.5 text-white">{buffer}</span>}
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
