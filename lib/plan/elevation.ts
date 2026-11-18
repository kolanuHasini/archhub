import {
  add,
  elemRect,
  mul,
  perp,
  sub,
  unit,
  wallCorners,
  wallPointAt,
  wallShape,
} from "./geometry";
import { GROUND_FLOOR, type Entity, type Floor, type Pt, type Roof, type Wall } from "./types";

// ---------------------------------------------------------------------------
// Turns the floor plans into an elevation: the building seen flat-on from one
// side. Every wall becomes a rectangle as wide as it appears from that side
// and as tall as its height, placed at its floor's level.
//
// Positions in an elevation are (u, z): u runs left to right across the
// picture, z is the height above the ground floor. All in millimetres.
// ---------------------------------------------------------------------------

export type ViewId = "front" | "back" | "left" | "right";

// The direction the viewer looks in, on the plan (x right, y down the screen).
// The road runs along the bottom of the plan, so "front" looks up the screen.
const LOOK: Record<ViewId, Pt> = {
  front: [0, -1],
  back: [0, 1],
  left: [1, 0],
  right: [-1, 0],
};

export const VIEWS: { id: ViewId; name: string }[] = [
  { id: "front", name: "Front (road side)" },
  { id: "back", name: "Back" },
  { id: "left", name: "Left side" },
  { id: "right", name: "Right side" },
];

export type OpeningFace = {
  id: string;
  kind: "door" | "window";
  style: string;
  u1: number;
  u2: number;
  z1: number;
  z2: number;
};

export type Face = {
  id: string;
  depth: number; // distance from the viewer; larger is further away
  u1: number;
  u2: number;
  z1: number;
  z2: number;
  openings: OpeningFace[];
  // Pieces of a curved wall are drawn without lines between them; only the
  // outermost pieces get a vertical edge.
  curved?: boolean;
  edgeLeft?: boolean;
  edgeRight?: boolean;
  elem?: string; // set for columns, beams, stairs, slabs and railings
};

/**
 * The solid blocks that make up a structural element: its outline on plan
 * and how high it reaches. A stair is one block per step.
 */
export function elemBlocks(
  elem: Extract<Entity, { kind: "elem" }>,
  level: number,
): { corners: Pt[]; z1: number; z2: number }[] {
  const { centre, angle, length, width } = elemRect(elem);
  const d: Pt = [Math.cos(angle), Math.sin(angle)];
  const n: Pt = [-d[1], d[0]];
  const corner = (along: number, side: number): Pt => [
    centre[0] + d[0] * (along - length / 2) + n[0] * side * (width / 2),
    centre[1] + d[1] * (along - length / 2) + n[1] * side * (width / 2),
  ];
  const block = (from: number, to: number) => [
    corner(from, 1),
    corner(to, 1),
    corner(to, -1),
    corner(from, -1),
  ];
  const base = level + elem.base;
  if (elem.type !== "stair") return [{ corners: block(0, length), z1: base, z2: base + elem.h }];
  if (elem.turn === "u") {
    // Up the first flight, across a landing, and back down the second side.
    const count = Math.max(4, Math.round(elem.h / 170));
    const riser = elem.h / count;
    const first = Math.floor(count / 2); // the landing is step number `first`
    const run = length - elem.w; // the flights; the landing takes the rest
    const lane = elem.w / 2 + 50;
    const piece = (from: number, to: number, side: number, half: number) => {
      const at = (along: number, across: number): Pt => [
        centre[0] + d[0] * (along - length / 2) + n[0] * across,
        centre[1] + d[1] * (along - length / 2) + n[1] * across,
      ];
      return [at(from, side - half), at(to, side - half), at(to, side + half), at(from, side + half)];
    };
    const blocks: { corners: Pt[]; z1: number; z2: number }[] = [];
    const going1 = run / Math.max(first - 1, 1);
    for (let i = 0; i < first - 1; i++) {
      blocks.push({ corners: piece(i * going1, (i + 1) * going1, lane, elem.w / 2), z1: base, z2: base + (i + 1) * riser });
    }
    blocks.push({ corners: piece(run, length, 0, width / 2), z1: base, z2: base + first * riser });
    const rest = count - first;
    const going2 = run / rest;
    for (let j = 0; j < rest; j++) {
      blocks.push({
        corners: piece(run - (j + 1) * going2, run - j * going2, -lane, elem.w / 2),
        z1: base,
        z2: base + (first + j + 1) * riser,
      });
    }
    return blocks;
  }
  const steps = Math.max(2, Math.round(elem.h / 170));
  return Array.from({ length: steps }, (_, i) => ({
    corners: block((length * i) / steps, (length * (i + 1)) / steps),
    z1: base,
    z2: base + ((i + 1) * elem.h) / steps,
  }));
}

export type TreeFace = { id: string; depth: number; u: number; r: number };

export type Elevation = {
  faces: Face[]; // sorted from furthest to nearest, ready to draw in order
  trees: TreeFace[];
  floors: Floor[];
  minU: number;
  maxU: number;
  top: number; // highest point
  bottom: number; // lowest point (below zero if there is a basement)
  ridgeAlongView: boolean; // true when the building's long side faces the viewer
  depthSpan: number; // how deep the building is, front to back, from this side
  // Where the roof sits. Rooms mark what is indoors, so garden and boundary
  // walls are not roofed; with no rooms drawn, all the walls are used.
  roofU1: number;
  roofU2: number;
};

/** The outline of the roof as seen in an elevation, and how high it rises. */
export function roofOutline(roof: Roof, e: Elevation): { d: string; rise: number; ridgeAcross: boolean } {
  const sloped = roof.type === "gable" || roof.type === "hip" || roof.type === "shed";
  const ridgeAcross = e.ridgeAlongView !== roof.turned;
  if (e.faces.length === 0 || roof.type === "none") return { d: "", rise: 0, ridgeAcross };
  if (!sloped) {
    const h = roof.parapet;
    return {
      d: h > 0 ? `M ${e.roofU1} ${-e.top} V ${-e.top - h} H ${e.roofU2} V ${-e.top}` : "",
      rise: h,
      ridgeAcross,
    };
  }
  const left = e.roofU1 - roof.overhang;
  const right = e.roofU2 + roof.overhang;
  const slope = Math.tan((Math.min(Math.max(roof.pitch, 1), 70) * Math.PI) / 180);
  const span = (ridgeAcross ? e.depthSpan : e.roofU2 - e.roofU1) + roof.overhang * 2;
  const top = -e.top;
  if (roof.type === "shed") {
    const rise = span * slope;
    return {
      d: ridgeAcross
        ? `M ${left} ${top} H ${right} V ${top - rise} H ${left} Z`
        : `M ${left} ${top} H ${right} L ${right} ${top - rise} Z`,
      rise,
      ridgeAcross,
    };
  }
  const rise = (span / 2) * slope;
  const inset = roof.type === "hip" ? Math.min(span / 2, (right - left) / 2) : 0;
  return {
    d: ridgeAcross
      ? `M ${left} ${top} H ${right} L ${right - inset} ${top - rise} H ${left + inset} Z`
      : `M ${left} ${top} H ${right} L ${(left + right) / 2} ${top - rise} Z`,
    rise,
    ridgeAcross,
  };
}

/** The direction the viewer looks in for each view. */
export const lookOf = (view: ViewId): Pt => LOOK[view];

/**
 * `beyond` is used for sections: only what lies further away than that
 * distance is included (the part of the building behind the cut).
 */
export function buildElevation(
  plan: { entities?: unknown; floors?: unknown },
  view: ViewId,
  beyond?: number,
): Elevation {
  const look = LOOK[view];
  const right: Pt = [-look[1], look[0]]; // the viewer's right-hand direction
  const across = (p: Pt) => p[0] * right[0] + p[1] * right[1];
  const away = (p: Pt) => p[0] * look[0] + p[1] * look[1];

  const floors = (
    Array.isArray(plan.floors) && plan.floors.length > 0 ? plan.floors : [GROUND_FLOOR]
  ) as Floor[];
  const levelOf = new Map(floors.map((floor) => [floor.id, floor.level]));
  const entities = (Array.isArray(plan.entities) ? plan.entities : []) as Entity[];
  type FloorWall = Wall & { floor?: string };
  const walls = entities.filter((e): e is FloorWall => e.kind === "wall");

  const faces: Face[] = [];

  for (const wall of walls) {
    const level = levelOf.get(wall.floor ?? GROUND_FLOOR.id) ?? 0;
    const shape = wallShape(wall);
    const length = shape.length;
    if (length < 1) continue;

    // A straight wall is one piece. A curved wall is cut into short pieces.
    const count = shape.curved ? Math.max(8, Math.ceil(length / 400)) : 1;
    const pieces: Face[] = [];
    for (let i = 0; i < count; i++) {
      let corners: Pt[];
      if (!shape.curved) {
        corners = wallCorners(wall, walls.filter((w) => w.floor === wall.floor));
      } else {
        const a = wallPointAt(wall, (length * i) / count).p;
        const b = wallPointAt(wall, (length * (i + 1)) / count).p;
        const n = mul(perp(unit(a, b)), wall.t / 2);
        corners = [add(a, n), add(b, n), sub(b, n), sub(a, n)];
      }
      if (beyond !== undefined && Math.max(...corners.map(away)) <= beyond + 1) continue;
      const us = corners.map(across);
      pieces.push({
        id: `${wall.id}-${i}`,
        depth: Math.min(...corners.map(away)),
        u1: Math.min(...us),
        u2: Math.max(...us),
        z1: level,
        z2: level + wall.h,
        openings: [],
        curved: shape.curved,
      });
    }
    if (shape.curved && pieces.length > 0) {
      const leftmost = pieces.reduce((best, piece) => (piece.u1 < best.u1 ? piece : best));
      const rightmost = pieces.reduce((best, piece) => (piece.u2 > best.u2 ? piece : best));
      leftmost.edgeLeft = true;
      rightmost.edgeRight = true;
    }

    // Doors and windows on this wall.
    for (const opening of entities) {
      if ((opening.kind !== "door" && opening.kind !== "window") || opening.wallId !== wall.id) {
        continue;
      }
      const spot = wallPointAt(wall, opening.pos);
      const angle = (spot.angle * Math.PI) / 180;
      const along: Pt = [Math.cos(angle), Math.sin(angle)];
      // A wall seen end-on shows no openings.
      if (Math.abs(along[0] * look[0] + along[1] * look[1]) > 0.75) continue;
      const a = across(sub(spot.p, mul(along, opening.width / 2)));
      const b = across(add(spot.p, mul(along, opening.width / 2)));
      const index = Math.min(count - 1, Math.floor((opening.pos / length) * count));
      const piece = pieces.find((item) => item.id === `${wall.id}-${index}`);
      if (!piece) continue; // that part of the wall is not in view
      piece.openings.push({
        id: opening.id,
        kind: opening.kind,
        style: opening.style,
        u1: Math.min(a, b),
        u2: Math.max(a, b),
        z1: level + opening.sill,
        z2: Math.min(level + opening.sill + opening.height, level + wall.h),
      });
    }
    faces.push(...pieces);
  }

  // Columns, beams, stairs, slabs and railings.
  for (const elem of entities) {
    if (elem.kind !== "elem") continue;
    const level = levelOf.get((elem as { floor?: string }).floor ?? GROUND_FLOOR.id) ?? 0;
    elemBlocks(elem, level).forEach((piece, index) => {
      if (beyond !== undefined && Math.max(...piece.corners.map(away)) <= beyond + 1) return;
      const us = piece.corners.map(across);
      faces.push({
        id: `${elem.id}-${index}`,
        depth: Math.min(...piece.corners.map(away)),
        u1: Math.min(...us),
        u2: Math.max(...us),
        z1: piece.z1,
        z2: piece.z2,
        openings: [],
        elem: elem.type,
      });
    });
  }

  faces.sort((first, second) => second.depth - first.depth);

  const trees: TreeFace[] = entities
    .filter((e) => e.kind === "tree")
    .filter((e) => beyond === undefined || away((e as Extract<Entity, { kind: "tree" }>).p) > beyond)
    .map((tree) => {
      const t = tree as Extract<Entity, { kind: "tree" }>;
      return { id: t.id, depth: away(t.p), u: across(t.p), r: t.r };
    })
    .sort((first, second) => second.depth - first.depth);

  const us = faces.filter((face) => !face.elem).flatMap((face) => [face.u1, face.u2]);
  const depths = walls.flatMap((wall) => [away(wall.a), away(wall.b)]);
  // Indoors is wherever rooms have been traced (plus the wall around them).
  const indoors = entities.flatMap((e) => (e.kind === "room" ? e.pts : []));
  const roofUs = indoors.length > 0 ? indoors.map(across) : us;
  const roofDepths = indoors.length > 0 ? indoors.map(away) : depths;
  const grow = indoors.length > 0 ? 230 : 0;
  const roofU1 = roofUs.length > 0 ? Math.min(...roofUs) - grow : 0;
  const roofU2 = roofUs.length > 0 ? Math.max(...roofUs) + grow : 0;
  const widthSpan = roofU2 - roofU1;
  const depthSpan =
    roofDepths.length > 0 ? Math.max(...roofDepths) - Math.min(...roofDepths) + grow * 2 : 0;
  return {
    ridgeAlongView: widthSpan >= depthSpan,
    depthSpan,
    roofU1,
    roofU2,
    faces,
    trees,
    floors: [...floors].sort((a, b) => a.level - b.level),
    minU: us.length > 0 ? Math.min(...us) : 0,
    maxU: us.length > 0 ? Math.max(...us) : 0,
    // The top of the building is the top of its walls (not of a railing or canopy).
    top: Math.max(0, ...faces.filter((face) => !face.elem).map((face) => face.z2)),
    bottom: faces.length > 0 ? Math.min(0, ...faces.map((face) => face.z1)) : 0,
  };
}
