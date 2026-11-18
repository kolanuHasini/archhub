import { buildElevation, lookOf, type Elevation, type ViewId } from "./elevation";
import {
  add,
  mul,
  perp,
  projectOnWall,
  sub,
  unit,
  wallCorners,
  wallPointAt,
  wallShape,
} from "./geometry";
import { GROUND_FLOOR, type Entity, type Floor, type Pt, type Wall } from "./types";

// ---------------------------------------------------------------------------
// A section is the building sliced along a straight line and looked at from
// the side. Walls the line passes through are "cut" and drawn solid; whatever
// lies behind the cut is drawn lightly, as in an elevation.
// ---------------------------------------------------------------------------

export type Cut = {
  id: string;
  u1: number;
  u2: number;
  z1: number;
  z2: number;
  lowest: boolean; // true = stands on the lowest floor, so it needs a footing
};

export type SectionDrawing = {
  cuts: Cut[]; // solid pieces of wall
  voids: { id: string; u1: number; u2: number; z1: number; z2: number }[]; // doors and windows cut through
  slabs: { level: number; u1: number; u2: number; name: string }[]; // one floor slab per floor
  roofLevel: number; // top of the highest walls
  roofSpan: { u1: number; u2: number } | null;
  beyond: Elevation; // what can be seen behind the cut
  floors: Floor[];
  lowestLevel: number;
  minU: number;
  maxU: number;
};

/**
 * `position` is where the cut is made: a y value on the plan when looking
 * front or back, an x value when looking left or right.
 */
export function buildSection(
  plan: { entities?: unknown; floors?: unknown },
  view: ViewId,
  position: number,
): SectionDrawing {
  const look = lookOf(view);
  const right: Pt = [-look[1], look[0]];
  const across = (p: Pt) => p[0] * right[0] + p[1] * right[1];
  const away = (p: Pt) => p[0] * look[0] + p[1] * look[1];
  const cutDepth = position * (look[0] + look[1]);

  const floors = (
    Array.isArray(plan.floors) && plan.floors.length > 0 ? plan.floors : [GROUND_FLOOR]
  ) as Floor[];
  const levelOf = new Map(floors.map((floor) => [floor.id, floor.level]));
  const lowestLevel = Math.min(...floors.map((floor) => floor.level));
  const entities = (Array.isArray(plan.entities) ? plan.entities : []) as Entity[];
  type FloorWall = Wall & { floor?: string };
  const walls = entities.filter((e): e is FloorWall => e.kind === "wall");

  const cuts: Cut[] = [];
  const voids: SectionDrawing["voids"] = [];
  // How far each floor's walls reach, left to right, for its slab.
  const reach = new Map<string, { u1: number; u2: number }>();

  for (const wall of walls) {
    const floorId = wall.floor ?? GROUND_FLOOR.id;
    const level = levelOf.get(floorId) ?? 0;
    const shape = wallShape(wall);
    if (shape.length < 1) continue;

    const ends = [across(wall.a), across(wall.b), ...(wall.m ? [across(wall.m)] : [])];
    const span = reach.get(floorId) ?? { u1: Infinity, u2: -Infinity };
    span.u1 = Math.min(span.u1, ...ends);
    span.u2 = Math.max(span.u2, ...ends);
    reach.set(floorId, span);

    const count = shape.curved ? Math.max(8, Math.ceil(shape.length / 400)) : 1;
    for (let i = 0; i < count; i++) {
      let corners: Pt[];
      if (!shape.curved) {
        corners = wallCorners(wall, walls.filter((w) => w.floor === wall.floor));
      } else {
        const a = wallPointAt(wall, (shape.length * i) / count).p;
        const b = wallPointAt(wall, (shape.length * (i + 1)) / count).p;
        const n = mul(perp(unit(a, b)), wall.t / 2);
        corners = [add(a, n), add(b, n), sub(b, n), sub(a, n)];
      }

      // Where does the cutting line cross the outline of this piece of wall?
      const crossings: number[] = [];
      for (let k = 0; k < corners.length; k++) {
        const p = corners[k];
        const q = corners[(k + 1) % corners.length];
        const dp = away(p) - cutDepth;
        const dq = away(q) - cutDepth;
        if (dp === dq || dp * dq > 0) continue;
        const t = dp / (dp - dq);
        crossings.push(across(p) + (across(q) - across(p)) * t);
      }
      if (crossings.length < 2) continue;
      const u1 = Math.min(...crossings);
      const u2 = Math.max(...crossings);
      if (u2 - u1 < 1) continue;

      // Is the cut passing through a door or window in this wall?
      const middle = (u1 + u2) / 2;
      const point: Pt = [
        right[0] * middle + look[0] * cutDepth,
        right[1] * middle + look[1] * cutDepth,
      ];
      const along = projectOnWall(point, wall).along;
      const opening = entities.find(
        (e) =>
          (e.kind === "door" || e.kind === "window") &&
          e.wallId === wall.id &&
          Math.abs(along - e.pos) <= e.width / 2,
      ) as Extract<Entity, { kind: "door" | "window" }> | undefined;

      const lowest = level === lowestLevel;
      const id = `${wall.id}-${i}`;
      if (!opening) {
        cuts.push({ id, u1, u2, z1: level, z2: level + wall.h, lowest });
      } else {
        const sill = level + opening.sill;
        const head = Math.min(sill + opening.height, level + wall.h);
        if (opening.sill > 0) cuts.push({ id: `${id}-below`, u1, u2, z1: level, z2: sill, lowest });
        if (head < level + wall.h) {
          cuts.push({ id: `${id}-above`, u1, u2, z1: head, z2: level + wall.h, lowest: false });
        }
        voids.push({ id: `${id}-void`, u1, u2, z1: sill, z2: head });
      }
    }
  }

  const beyond = buildElevation(plan, view, cutDepth);
  const sorted = [...floors].sort((a, b) => a.level - b.level);
  const slabs = sorted
    .filter((floor) => reach.has(floor.id))
    .map((floor) => ({ level: floor.level, name: floor.name, ...reach.get(floor.id)! }));

  const tops = walls.map((wall) => (levelOf.get(wall.floor ?? GROUND_FLOOR.id) ?? 0) + wall.h);
  const roofLevel = tops.length > 0 ? Math.max(...tops) : 0;
  const topFloor = sorted.filter((floor) => reach.has(floor.id)).pop();
  const us = [...reach.values()].flatMap((span) => [span.u1, span.u2]);

  return {
    cuts,
    voids,
    slabs,
    roofLevel,
    roofSpan: topFloor ? reach.get(topFloor.id)! : null,
    beyond,
    floors: sorted,
    lowestLevel,
    minU: us.length > 0 ? Math.min(...us) : 0,
    maxU: us.length > 0 ? Math.max(...us) : 0,
  };
}
