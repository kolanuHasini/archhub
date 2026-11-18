import * as THREE from "three";
import { getFurniture } from "./furniture";
import { dist, unit, wallPointAt, wallShape } from "./geometry";
import { FINISH_COLOURS } from "./styles";
import {
  DEFAULT_ROOF,
  DEFAULT_STRUCTURE,
  GROUND_FLOOR,
  type Entity,
  type Floor,
  type Pt,
  type Roof,
  type Settings,
  type Structure,
  type Wall,
} from "./types";

// ---------------------------------------------------------------------------
// Builds a 3D model from the floor plans.
//
// The plan is in millimetres with y running down the screen. The model is in
// metres: plan x becomes X, plan y becomes Z, and height becomes Y (up).
// ---------------------------------------------------------------------------

const M = 1 / 1000; // millimetres to metres

export const FACADE_COLOURS: Record<string, string> = {
  plaster: "#f1ece2",
  brick: "#c98566",
  concrete: "#d2d0cb",
  stone: "#d8d2c4",
  timber: "#c9a273",
  whitewash: "#fbfaf6",
  tile: "#d9c7b0",
  metal: "#9aa3a8",
  glass: "#bcd6de",
  jali: "#c98566",
};

// How tall furniture stands, by the group it belongs to.
const FURNITURE_HEIGHT: Record<string, number> = {
  Bedroom: 550,
  Living: 800,
  Dining: 750,
  Kitchen: 900,
  Bathroom: 800,
  Building: 2900,
  Outdoor: 1500,
  Landscape: 500,
};

export type ModelOptions = {
  clay: boolean; // everything in white, like a card model
  edges: boolean; // dark outlines on walls
  roof: boolean;
  furniture: boolean;
  trees: boolean;
  topFloor: number; // floors above this level are hidden (to look inside)
};

export type ModelInfo = {
  group: THREE.Group;
  centre: THREE.Vector3;
  size: number; // longest side, in metres
  eye: THREE.Vector3; // a good place to stand inside
};

type FloorEntity = Entity & { floor?: string };

export function buildModel(
  plan: { entities?: unknown; floors?: unknown; settings?: Partial<Settings>; site?: unknown },
  options: ModelOptions,
): ModelInfo {
  const group = new THREE.Group();
  const entities = (Array.isArray(plan.entities) ? plan.entities : []) as FloorEntity[];
  const floors = (
    Array.isArray(plan.floors) && plan.floors.length > 0 ? plan.floors : [GROUND_FLOOR]
  ) as Floor[];
  const levelOf = new Map(floors.map((floor) => [floor.id, floor.level]));
  const structure: Structure = { ...DEFAULT_STRUCTURE, ...(plan.settings?.structure ?? {}) };
  const roof: Roof = { ...DEFAULT_ROOF, ...(plan.settings?.roof ?? {}) };
  const facade = plan.settings?.facade ?? "plaster";
  const levelFor = (e: FloorEntity) => levelOf.get(e.floor ?? GROUND_FLOOR.id) ?? 0;
  const shown = (e: FloorEntity) => levelFor(e) <= options.topFloor;

  const tone = (colour: string) => (options.clay ? "#f4f2ec" : colour);
  const solid = (colour: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color: tone(colour), roughness: 0.9, ...extra });
  const wallMaterial = solid(FACADE_COLOURS[facade] ?? FACADE_COLOURS.plaster);
  const slabMaterial = solid("#cfcdc8");
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: options.clay ? "#dfe6e8" : "#9fc3cf",
    transparent: true,
    opacity: 0.38,
    roughness: 0.1,
  });
  const doorMaterial = solid("#9c6f43");
  const edgeMaterial = new THREE.LineBasicMaterial({ color: "#2a2a2a" });

  // A box standing on the plan: centred at `at`, `length` along the angle.
  function box(
    at: Pt,
    angle: number,
    length: number,
    thickness: number,
    base: number,
    height: number,
    material: THREE.Material,
    outlined = false,
  ) {
    if (length <= 0 || height <= 0) return;
    const geometry = new THREE.BoxGeometry(length * M, height * M, thickness * M);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(at[0] * M, (base + height / 2) * M, at[1] * M);
    mesh.rotation.y = -angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (outlined && options.edges) {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      lines.position.copy(mesh.position);
      lines.rotation.copy(mesh.rotation);
      group.add(lines);
    }
  }

  // --- Walls, with their doors and windows cut out ---------------------------------
  const walls = entities.filter((e): e is Wall & { floor?: string } => e.kind === "wall");
  const xs: number[] = [];
  const ys: number[] = [];
  let top = 0;

  for (const wall of walls) {
    xs.push(wall.a[0], wall.b[0]);
    ys.push(wall.a[1], wall.b[1]);
    if (!shown(wall)) continue;
    const level = levelFor(wall);
    top = Math.max(top, level + wall.h);
    const shape = wallShape(wall);
    const openings = entities.filter(
      (e): e is Extract<Entity, { kind: "door" | "window" }> =>
        (e.kind === "door" || e.kind === "window") && e.wallId === wall.id,
    );
    const sameFloor = walls.filter((w) => w.floor === wall.floor && w.id !== wall.id);
    const meets = (end: Pt) => sameFloor.some((w) => dist(w.a, end) < 1 || dist(w.b, end) < 1);

    // Cut the wall into short runs: one piece for a straight wall, many for a curve.
    const count = shape.curved ? Math.max(10, Math.ceil(shape.length / 300)) : 1;
    for (let i = 0; i < count; i++) {
      const from = (shape.length * i) / count;
      const to = (shape.length * (i + 1)) / count;
      const a = wallPointAt(wall, from).p;
      const b = wallPointAt(wall, to).p;
      const d = unit(a, b);
      const angle = Math.atan2(d[1], d[0]);
      const run = dist(a, b);
      const at = (along: number): Pt => [a[0] + d[0] * along, a[1] + d[1] * along];
      // Corners are closed by running straight walls half a thickness further.
      const before = !shape.curved && meets(wall.a) ? wall.t / 2 : 0;
      const after = !shape.curved && meets(wall.b) ? wall.t / 2 : 0;

      // Openings that fall in this run, in order.
      const gaps = openings
        .map((o) => ({ o, start: o.pos - o.width / 2 - from, end: o.pos + o.width / 2 - from }))
        .filter((gap) => gap.end > 0 && gap.start < run)
        .map((gap) => ({ ...gap, start: Math.max(gap.start, 0), end: Math.min(gap.end, run) }))
        .sort((first, second) => first.start - second.start);

      let cursor = -before;
      const fill = (start: number, end: number) =>
        // Curved walls are left without outlines, so they read as one smooth surface.
        box(at((start + end) / 2), angle, end - start + (shape.curved ? 12 : 0), wall.t, level, wall.h, wallMaterial, !shape.curved);
      for (const gap of gaps) {
        if (gap.start > cursor) fill(cursor, gap.start);
        const middle = at((gap.start + gap.end) / 2);
        const width = gap.end - gap.start;
        const sill = gap.o.sill;
        const head = Math.min(sill + gap.o.height, wall.h);
        box(middle, angle, width, wall.t, level, sill, wallMaterial, true); // below
        box(middle, angle, width, wall.t, level + head, wall.h - head, wallMaterial, true); // above
        if (gap.o.kind === "window" || gap.o.style === "sliding") {
          box(middle, angle, width, 30, level + sill, head - sill, glassMaterial);
        } else if (gap.o.style !== "opening") {
          box(middle, angle, width, 45, level + sill, head - sill, doorMaterial);
        }
        cursor = gap.end;
      }
      if (run + after > cursor) fill(cursor, run + after);
    }
  }

  const bounds =
    xs.length > 0
      ? { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) }
      : { x1: 0, x2: 10000, y1: 0, y2: 8000 };

  // The outline of the building on one floor. Rooms mark what is indoors, so
  // garden and boundary walls are not roofed over; with no rooms drawn, all
  // the walls of that floor are used.
  function footprint(floorId: string) {
    const rooms = entities.filter(
      (e) => e.kind === "room" && (e.floor ?? GROUND_FLOOR.id) === floorId,
    );
    const points: Pt[] =
      rooms.length > 0
        ? rooms.flatMap((room) => (room.kind === "room" ? room.pts : []))
        : walls
            .filter((w) => (w.floor ?? GROUND_FLOOR.id) === floorId)
            .flatMap((w) => [w.a, w.b]);
    if (points.length === 0) return null;
    const grow = rooms.length > 0 ? 230 : 115; // out to the outside face of the walls
    return {
      x1: Math.min(...points.map((p) => p[0])) - grow,
      x2: Math.max(...points.map((p) => p[0])) + grow,
      y1: Math.min(...points.map((p) => p[1])) - grow,
      y2: Math.max(...points.map((p) => p[1])) + grow,
    };
  }

  // --- Floors -------------------------------------------------------------------------
  for (const floor of floors) {
    if (floor.level > options.topFloor) continue;
    const area = footprint(floor.id);
    if (!area) continue;
    const { x1, x2, y1, y2 } = area;
    box([(x1 + x2) / 2, (y1 + y2) / 2], 0, x2 - x1, y2 - y1, floor.level - structure.slab, structure.slab, slabMaterial, true);
  }

  // Room floor finishes, laid just above the slab.
  for (const room of entities) {
    if (room.kind !== "room" || !shown(room) || room.pts.length < 3) continue;
    const colour = FINISH_COLOURS[room.finish]?.fill ?? "#ece8de";
    const outline = new THREE.Shape(room.pts.map((p) => new THREE.Vector2(p[0] * M, p[1] * M)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(outline), solid(colour, { side: THREE.DoubleSide }));
    mesh.rotation.x = Math.PI / 2; // lay the shape flat (its y becomes Z)
    mesh.position.y = (levelFor(room) + 8) * M;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- Roof ---------------------------------------------------------------------------
  const topFloors = floors.filter((floor) => floor.level <= options.topFloor);
  const highest = topFloors.sort((a, b) => b.level - a.level)[0];
  const roofArea = highest ? footprint(highest.id) : null;
  const allFloorsShown = floors.every((floor) => floor.level <= options.topFloor);
  if (options.roof && allFloorsShown && roofArea && roof.type !== "none") {
    const sloped = roof.type !== "flat";
    const over = sloped ? roof.overhang : 0;
    const x1 = roofArea.x1 - over;
    const x2 = roofArea.x2 + over;
    const y1 = roofArea.y1 - over;
    const y2 = roofArea.y2 + over;
    // The roof sits on the walls of the top floor.
    const roofTop = Math.max(
      ...walls
        .filter((w) => (w.floor ?? GROUND_FLOOR.id) === highest.id)
        .map((w) => highest.level + w.h),
      highest.level + 2400,
    );
    top = roofTop;
    // The lid on top of the walls.
    box([(x1 + x2) / 2, (y1 + y2) / 2], 0, x2 - x1, y2 - y1, top, structure.slab, slabMaterial, true);
    const base = top + structure.slab;

    if (roof.type === "flat") {
      const t = 230;
      const material = wallMaterial;
      box([(x1 + x2) / 2, y1 + t / 2], 0, x2 - x1, t, base, roof.parapet, material, true);
      box([(x1 + x2) / 2, y2 - t / 2], 0, x2 - x1, t, base, roof.parapet, material, true);
      box([x1 + t / 2, (y1 + y2) / 2], 0, t, y2 - y1 - t * 2, base, roof.parapet, material, true);
      box([x2 - t / 2, (y1 + y2) / 2], 0, t, y2 - y1 - t * 2, base, roof.parapet, material, true);
    } else {
      // The ridge runs along the longer side, unless it has been turned.
      const alongX = x2 - x1 >= y2 - y1 !== roof.turned;
      const length = alongX ? x2 - x1 : y2 - y1; // along the ridge
      const span = alongX ? y2 - y1 : x2 - x1; // across the ridge
      const slope = Math.tan((Math.min(Math.max(roof.pitch, 1), 70) * Math.PI) / 180);
      // A point given as (distance along ridge, distance across, height).
      const point = (l: number, s: number, h: number) =>
        alongX
          ? new THREE.Vector3((x1 + l) * M, (base + h) * M, (y1 + s) * M)
          : new THREE.Vector3((x1 + s) * M, (base + h) * M, (y1 + l) * M);
      const triangles: THREE.Vector3[] = [];
      const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) =>
        triangles.push(a, b, c, a, c, d);
      const A = point(0, 0, 0);
      const B = point(length, 0, 0);
      const C = point(length, span, 0);
      const D = point(0, span, 0);

      if (roof.type === "shed") {
        const rise = span * slope;
        const C2 = point(length, span, rise);
        const D2 = point(0, span, rise);
        quad(A, B, C2, D2); // the slope
        quad(D, C, C2, D2); // the tall back
        triangles.push(A, D, D2, B, C, C2); // the two ends
      } else {
        const rise = (span / 2) * slope;
        const inset = roof.type === "hip" ? Math.min(span / 2, length / 2) : 0;
        const R1 = point(inset, span / 2, rise);
        const R2 = point(length - inset, span / 2, rise);
        quad(A, B, R2, R1);
        quad(D, C, R2, R1);
        triangles.push(A, D, R1, B, C, R2); // gable ends, or the hips
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(triangles);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        solid("#a9634a", { side: THREE.DoubleSide, flatShading: true }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      if (options.edges) {
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), edgeMaterial));
      }
    }
  }

  // --- Furniture and trees ---------------------------------------------------------------
  if (options.furniture) {
    const material = solid("#e3ddd0");
    for (const item of entities) {
      if (item.kind !== "furn" || !shown(item)) continue;
      const details = getFurniture(item.item);
      const height = item.item === "person" ? 1700 : (FURNITURE_HEIGHT[details.group] ?? 750);
      if (["pool", "parking", "stepping"].includes(item.item)) continue; // flat on the ground
      box(item.p, (item.rot * Math.PI) / 180, details.w, details.d, levelFor(item), height, material, true);
    }
  }

  if (options.trees) {
    const trunk = solid("#7a5a3c");
    const leaves = [solid("#7fa172"), solid("#93b085"), solid("#6a8f5f")];
    let index = 0;
    for (const tree of entities) {
      if (tree.kind !== "tree") continue;
      const r = tree.r * M;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.07, r * 0.1, r * 1.6, 8), trunk);
      stem.position.set(tree.p[0] * M, r * 0.8 - structure.plinth * M, tree.p[1] * M);
      stem.castShadow = true;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves[index++ % leaves.length]);
      crown.position.set(tree.p[0] * M, r * 2.1 - structure.plinth * M, tree.p[1] * M);
      crown.castShadow = true;
      group.add(stem, crown);
    }
  }

  // --- Ground and plinth ----------------------------------------------------------------
  const site = plan.site as { w?: number; d?: number } | null | undefined;
  const pad = 9000;
  const gx1 = Math.min(bounds.x1 - pad, 0);
  const gx2 = Math.max(bounds.x2 + pad, site?.w ?? 0);
  const gy1 = Math.min(bounds.y1 - pad, 0);
  const gy2 = Math.max(bounds.y2 + pad, site?.d ?? 0);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry((gx2 - gx1) * M, (gy2 - gy1) * M),
    solid("#c9d3b4"),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(((gx1 + gx2) / 2) * M, -structure.plinth * M, ((gy1 + gy2) / 2) * M);
  ground.receiveShadow = true;
  group.add(ground);

  // A good place to stand: the middle of the first room, at eye height.
  const firstRoom = entities.find((e) => e.kind === "room" && (e.floor ?? GROUND_FLOOR.id) === GROUND_FLOOR.id);
  const stand: Pt =
    firstRoom && firstRoom.kind === "room"
      ? [
          firstRoom.pts.reduce((sum, p) => sum + p[0], 0) / firstRoom.pts.length,
          firstRoom.pts.reduce((sum, p) => sum + p[1], 0) / firstRoom.pts.length,
        ]
      : [(bounds.x1 + bounds.x2) / 2, (bounds.y1 + bounds.y2) / 2];

  return {
    group,
    centre: new THREE.Vector3(
      ((bounds.x1 + bounds.x2) / 2) * M,
      (top / 2) * M,
      ((bounds.y1 + bounds.y2) / 2) * M,
    ),
    size: Math.max(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1, top, 4000) * M,
    eye: new THREE.Vector3(stand[0] * M, 1.6, stand[1] * M),
  };
}

/** Frees the memory used by a model that is no longer shown. */
export function disposeModel(group: THREE.Group) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
