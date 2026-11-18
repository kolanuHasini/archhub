import * as THREE from "three";
import { elemBlocks } from "./elevation";
import { getFurniture } from "./furniture";
import { dist, elemRect, unit, wallPointAt, wallShape } from "./geometry";
import { FINISH_COLOURS } from "./styles";
import { material, measureBox, treeMaterial } from "./textures3d";
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
  // In the white card model everything is one matt colour; otherwise each
  // surface gets its real material, with texture and relief.
  const real = (name: string) => (options.clay ? solid("#f4f2ec") : material(name));
  const wallMaterial = real(facade);
  const slabMaterial = real("concrete");
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: options.clay ? "#dfe6e8" : "#a9c7d1",
    transparent: true,
    opacity: options.clay ? 0.35 : 0.3,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    envMapIntensity: 1.8,
  });
  const doorMaterial = real("door");
  const frameMaterial = solid("#2e3235", { roughness: 0.45, metalness: 0.5 });
  const sillMaterial = solid("#d9d5cb", { roughness: 0.8 });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: "#2a2a2a" });

  // A box standing on the plan: centred at `at`, `length` along the angle.
  function box(
    at: Pt,
    angle: number,
    length: number,
    thickness: number,
    base: number,
    height: number,
    material: THREE.Material, // (named so here; the textures come from textures3d)
    outlined = false,
  ) {
    if (length <= 0 || height <= 0) return;
    const geometry = new THREE.BoxGeometry(length * M, height * M, thickness * M);
    measureBox(geometry, length * M, height * M, thickness * M);
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
        const glazed = gap.o.kind === "window" || gap.o.style === "sliding";
        if (glazed) {
          box(middle, angle, width, 24, level + sill, head - sill, glassMaterial);
        } else if (gap.o.style !== "opening") {
          box(middle, angle, width - 90, 45, level + sill, head - sill - 45, doorMaterial);
        }
        if (gap.o.style !== "opening" && !options.clay) {
          // A frame around the opening, and a bar down the middle of wide windows.
          const bar = 55;
          const deep = 90;
          box(middle, angle, width, deep, level + head - bar, bar, frameMaterial);
          box(at(gap.start + bar / 2), angle, bar, deep, level + sill, head - sill, frameMaterial);
          box(at(gap.end - bar / 2), angle, bar, deep, level + sill, head - sill, frameMaterial);
          if (glazed) {
            box(middle, angle, width, deep, level + sill, bar, frameMaterial);
            const panes = Math.max(1, Math.round(width / 900));
            for (let k = 1; k < panes; k++) {
              box(at(gap.start + (width * k) / panes), angle, bar * 0.7, deep, level + sill, head - sill, frameMaterial);
            }
            // A sill that sticks out a little under the window.
            if (sill > 0) box(middle, angle, width + 120, wall.t + 110, level + sill - 45, 45, sillMaterial);
          }
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

  // --- Columns, beams, stairs, slabs and railings -------------------------------------
  for (const elem of entities) {
    if (elem.kind !== "elem" || !shown(elem)) continue;
    const level = levelFor(elem) + elem.base;
    const { centre, angle, length, width } = elemRect(elem);
    const d: Pt = [Math.cos(angle), Math.sin(angle)];
    const along = (distance: number): Pt => [
      centre[0] + d[0] * (distance - length / 2),
      centre[1] + d[1] * (distance - length / 2),
    ];
    if (elem.type === "column" || elem.type === "beam" || elem.type === "slab") {
      box(centre, angle, length, width, level, elem.h, real("concrete"), true);
    } else if (elem.type === "stair") {
      // Each step (and any landing) is a block, the same ones used in sections.
      for (const step of elemBlocks(elem, levelFor(elem))) {
        const [p0, p1, p2, p3] = step.corners;
        const middle: Pt = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4, (p0[1] + p1[1] + p2[1] + p3[1]) / 4];
        box(
          middle,
          Math.atan2(p1[1] - p0[1], p1[0] - p0[0]),
          dist(p0, p1),
          dist(p1, p2),
          step.z1,
          step.z2 - step.z1,
          real("concrete"),
        );
      }
    } else if (elem.type === "railing") {
      const posts = Math.max(2, Math.round(length / 1200) + 1);
      for (let i = 0; i < posts; i++) {
        box(along((length * i) / (posts - 1)), angle, 40, 40, level, elem.h, frameMaterial);
      }
      box(centre, angle, length, 55, level + elem.h - 45, 45, frameMaterial); // handrail
      box(centre, angle, length, 12, level + 90, elem.h - 180, glassMaterial); // glass panel
    }
  }

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
    // A stair that arrives at this floor needs an opening in its slab.
    const arriving = entities.filter(
      (e): e is Extract<Entity, { kind: "elem" }> & { floor?: string } =>
        e.kind === "elem" &&
        e.type === "stair" &&
        (e.floor ?? GROUND_FLOOR.id) !== floor.id &&
        Math.abs(levelFor(e) + e.base + e.h - floor.level) < 250,
    );
    if (arriving.length === 0) {
      box([(x1 + x2) / 2, (y1 + y2) / 2], 0, x2 - x1, y2 - y1, floor.level - structure.slab, structure.slab, slabMaterial, true);
      continue;
    }
    const outline = new THREE.Shape([
      new THREE.Vector2(x1 * M, y1 * M),
      new THREE.Vector2(x2 * M, y1 * M),
      new THREE.Vector2(x2 * M, y2 * M),
      new THREE.Vector2(x1 * M, y2 * M),
    ]);
    for (const stair of arriving) {
      const r = elemRect(stair);
      const d: Pt = [Math.cos(r.angle), Math.sin(r.angle)];
      const corner = (along: number, side: number) =>
        new THREE.Vector2(
          (r.centre[0] + d[0] * along - d[1] * side) * M,
          (r.centre[1] + d[1] * along + d[0] * side) * M,
        );
      const l = r.length / 2 + 50;
      const w = r.width / 2 + 50;
      outline.holes.push(new THREE.Path([corner(-l, -w), corner(l, -w), corner(l, w), corner(-l, w)]));
    }
    const slab = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outline, { depth: structure.slab * M, bevelEnabled: false }),
      slabMaterial,
    );
    slab.rotation.x = Math.PI / 2; // lay it flat; its thickness then runs downwards
    slab.position.y = floor.level * M;
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
  }

  // Room floor finishes, laid just above the slab.
  for (const room of entities) {
    if (room.kind !== "room" || !shown(room) || room.pts.length < 3) continue;
    const colour = FINISH_COLOURS[room.finish]?.fill ?? "#ece8de";
    const outline = new THREE.Shape(room.pts.map((p) => new THREE.Vector2(p[0] * M, p[1] * M)));
    // Finishes with a strong pattern get their real texture; the rest a matt colour.
    const textured: Record<string, string> = {
      wood: "woodFloor",
      herringbone: "woodFloor",
      deck: "timber",
      tile600: "tile",
      tile300: "tile",
      checker: "tile",
      stone: "paving",
      pavers: "brick",
      brick: "brick",
      concrete: "concrete",
      grass: "grass",
    };
    const floorMaterial =
      !options.clay && textured[room.finish]
        ? material(textured[room.finish])
        : solid(colour, { roughness: 0.7 });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(outline), floorMaterial);
    floorMaterial.side = THREE.DoubleSide;
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
      // Each point also remembers where it is on the roof surface, in metres,
      // so the tile texture runs up the slope at its true size.
      type RoofPoint = THREE.Vector3 & { tile?: [number, number] };
      const point = (l: number, s: number, h: number): RoofPoint => {
        const spot: RoofPoint = alongX
          ? new THREE.Vector3((x1 + l) * M, (base + h) * M, (y1 + s) * M)
          : new THREE.Vector3((x1 + s) * M, (base + h) * M, (y1 + l) * M);
        spot.tile = [l * M, Math.hypot(Math.min(s, span - s), h) * M];
        return spot;
      };
      const triangles: RoofPoint[] = [];
      const quad = (a: RoofPoint, b: RoofPoint, c: RoofPoint, d: RoofPoint) =>
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
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(triangles.flatMap((p) => p.tile ?? [0, 0]), 2),
      );
      geometry.computeVertexNormals();
      const roofMaterial = real("roofTile");
      roofMaterial.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geometry, roofMaterial);
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
    const trunk = solid("#6b4f38", { roughness: 1 });
    const leaves = ["#3f5f38", "#557a48", "#35512f", "#688a55"].map((colour) =>
      solid(colour, { roughness: 1 }),
    );
    for (const tree of entities) {
      if (tree.kind !== "tree") continue;
      // Each tree gets its own shape, the same every time it is drawn.
      let seed = 7;
      for (const letter of tree.id) seed = (seed * 31 + letter.charCodeAt(0)) % 100000;
      const next = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      const r = tree.r * M;
      const groundY = -structure.plinth * M;
      const x = tree.p[0] * M;
      const z = tree.p[1] * M;
      if (!options.clay) {
        // Three crossed cards carrying a painted tree.
        const look = treeMaterial(seed % 4);
        const wide = r * 2.5;
        const tall = r * 3.4;
        const lean = next() * Math.PI;
        for (let k = 0; k < 3; k++) {
          const card = new THREE.Mesh(new THREE.PlaneGeometry(wide, tall), look.leaves);
          card.customDepthMaterial = look.shadow;
          card.position.set(x, groundY + tall / 2, z);
          card.rotation.y = lean + (k * Math.PI) / 3;
          card.castShadow = true;
          group.add(card);
        }
        continue;
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.11, r * 1.7, 10), trunk);
      stem.position.set(x, groundY + r * 0.85, z);
      stem.castShadow = true;
      group.add(stem);
      // The crown is a cluster of overlapping, slightly uneven clumps of leaves.
      const clumps = 9;
      for (let k = 0; k < clumps; k++) {
        const size = r * (0.42 + next() * 0.3);
        const clump = new THREE.Mesh(
          new THREE.IcosahedronGeometry(size, 2),
          leaves[Math.floor(next() * leaves.length)],
        );
        const turn = next() * Math.PI * 2;
        const out = k === 0 ? 0 : r * (0.25 + next() * 0.45);
        clump.position.set(
          x + Math.cos(turn) * out,
          groundY + r * (1.75 + next() * 0.75),
          z + Math.sin(turn) * out,
        );
        clump.scale.set(1, 0.82 + next() * 0.25, 1);
        clump.castShadow = true;
        clump.receiveShadow = true;
        group.add(clump);
      }
    }
  }

  // --- Ground and plinth ----------------------------------------------------------------
  const site = plan.site as { w?: number; d?: number } | null | undefined;
  const pad = 30000; // grass well beyond the building, out towards the horizon
  const gx1 = Math.min(bounds.x1 - pad, 0);
  const gx2 = Math.max(bounds.x2 + pad, site?.w ?? 0);
  const gy1 = Math.min(bounds.y1 - pad, 0);
  const gy2 = Math.max(bounds.y2 + pad, site?.d ?? 0);
  // The building stands on a solid plinth, with a paved strip around it.
  for (const floor of floors) {
    if (floor.level !== Math.min(...floors.map((f) => f.level))) continue;
    const area = footprint(floor.id);
    if (!area) continue;
    const middle: Pt = [(area.x1 + area.x2) / 2, (area.y1 + area.y2) / 2];
    box(middle, 0, area.x2 - area.x1, area.y2 - area.y1, floor.level - structure.plinth, structure.plinth - structure.slab, real("concrete"));
    box(middle, 0, area.x2 - area.x1 + 2400, area.y2 - area.y1 + 2400, floor.level - structure.plinth, 50, real("paving"));
  }

  const groundGeometry = new THREE.PlaneGeometry((gx2 - gx1) * M, (gy2 - gy1) * M);
  const groundUv = groundGeometry.attributes.uv;
  for (let i = 0; i < groundUv.count; i++) {
    groundUv.setXY(i, groundUv.getX(i) * (gx2 - gx1) * M, groundUv.getY(i) * (gy2 - gy1) * M);
  }
  const ground = new THREE.Mesh(
    groundGeometry,
    options.clay ? solid("#e9e6dd") : material("grass"),
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
