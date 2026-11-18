import type { Entity, PlanDoc, Pt, Unit, Wall } from "./types";

// ---------------------------------------------------------------------------
// The measuring and maths behind the plan.
// ---------------------------------------------------------------------------

export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const roundPt = (p: Pt): Pt => [Math.round(p[0]), Math.round(p[1])];

/** A direction of length 1 from a to b (or pointing right if a = b). */
export function unit(a: Pt, b: Pt): Pt {
  const length = dist(a, b);
  return length < 1e-9 ? [1, 0] : [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
}

/** The direction at a right angle to d. */
export const perp = (d: Pt): Pt => [-d[1], d[0]];

export function angleDeg(a: Pt, b: Pt): number {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

/** The closest point to p on the line from a to b. */
export function project(p: Pt, a: Pt, b: Pt) {
  const length = dist(a, b);
  if (length < 1e-9) return { along: 0, point: a, distance: dist(p, a) };
  const d = unit(a, b);
  const raw = (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1];
  const along = Math.min(Math.max(raw, 0), length);
  const point: Pt = [a[0] + d[0] * along, a[1] + d[1] * along];
  return { along, point, distance: dist(p, point) };
}

/** Where two endless lines cross, or null if they are parallel. */
export function lineCross(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d1 = sub(a2, a1);
  const d2 = sub(b2, b1);
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(cross) < 1e-9) return null;
  const k = ((b1[0] - a1[0]) * d2[1] - (b1[1] - a1[1]) * d2[0]) / cross;
  return [a1[0] + d1[0] * k, a1[1] + d1[1] * k];
}

/** Area of a shape from its corners, in square millimetres. */
export function polygonArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

export function centroid(points: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}

// --- Walls -----------------------------------------------------------------

const TOUCH = 1; // points closer than 1 mm count as the same point

/**
 * The four corners of a wall. An end that meets another wall's end is pushed
 * out by half the thickness, so that corners close up squarely.
 */
export function wallCorners(wall: Wall, walls: Wall[]): Pt[] {
  const d = unit(wall.a, wall.b);
  const n = perp(d);
  const half = wall.t / 2;
  const meets = (end: Pt) =>
    walls.some(
      (other) =>
        other.id !== wall.id &&
        (dist(other.a, end) < TOUCH || dist(other.b, end) < TOUCH),
    );
  const a = meets(wall.a) ? sub(wall.a, mul(d, half)) : wall.a;
  const b = meets(wall.b) ? add(wall.b, mul(d, half)) : wall.b;
  return [
    add(a, mul(n, half)),
    add(b, mul(n, half)),
    sub(b, mul(n, half)),
    sub(a, mul(n, half)),
  ];
}

/** The two long faces of a wall, as endless lines. */
function wallFaces(wall: Wall): [Pt, Pt][] {
  const n = mul(perp(unit(wall.a, wall.b)), wall.t / 2);
  return [
    [add(wall.a, n), add(wall.b, n)],
    [sub(wall.a, n), sub(wall.b, n)],
  ];
}

/**
 * The inner and outer corner points where walls meet. Snapping to these lets
 * a room be traced along the inside faces, so its area is the true floor area.
 */
export function wallJunctionCorners(walls: Wall[]): Pt[] {
  const corners: Pt[] = [];
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const first = walls[i];
      const second = walls[j];
      let junction: Pt | null = null;
      for (const end of [first.a, first.b]) {
        if (project(end, second.a, second.b).distance < TOUCH) junction = end;
      }
      for (const end of [second.a, second.b]) {
        if (project(end, first.a, first.b).distance < TOUCH) junction = end;
      }
      if (!junction) continue;
      const reach = Math.max(first.t, second.t) * 1.5;
      for (const faceA of wallFaces(first)) {
        for (const faceB of wallFaces(second)) {
          const corner = lineCross(faceA[0], faceA[1], faceB[0], faceB[1]);
          if (corner && dist(corner, junction) < reach) {
            // Tidy away tiny rounding errors (to a tenth of a millimetre).
            corners.push([
              Math.round(corner[0] * 10) / 10,
              Math.round(corner[1] * 10) / 10,
            ]);
          }
        }
      }
    }
  }
  return corners;
}

// --- Moving things ----------------------------------------------------------

export function moveEntity(entity: Entity, dx: number, dy: number): Entity {
  const shift = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  switch (entity.kind) {
    case "wall":
    case "line":
    case "dim":
      return { ...entity, a: shift(entity.a), b: shift(entity.b) };
    case "room":
      return { ...entity, pts: entity.pts.map(shift) };
    case "tree":
    case "furn":
    case "text":
      return { ...entity, p: shift(entity.p) };
    default:
      return entity; // doors and windows slide along their wall instead
  }
}

// --- Extents ---------------------------------------------------------------

export type Box = { x: number; y: number; w: number; h: number };

/** The rectangle that contains everything drawn. */
export function extents(doc: PlanDoc): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  const take = (p: Pt, pad = 0) => {
    xs.push(p[0] - pad, p[0] + pad);
    ys.push(p[1] - pad, p[1] + pad);
  };
  if (doc.site) {
    take([0, 0]);
    take([doc.site.w, doc.site.d]);
  }
  for (const entity of doc.entities) {
    switch (entity.kind) {
      case "wall":
        take(entity.a, entity.t);
        take(entity.b, entity.t);
        break;
      case "line":
        take(entity.a);
        take(entity.b);
        break;
      case "dim":
        take(entity.a, Math.abs(entity.offset));
        take(entity.b, Math.abs(entity.offset));
        break;
      case "room":
        entity.pts.forEach((p) => take(p));
        break;
      case "tree":
        take(entity.p, entity.r);
        break;
      case "furn":
        take(entity.p, 1500);
        break;
      case "text":
        take(entity.p, 500);
        break;
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, w: 12000, h: 9000 };
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(Math.max(...xs) - x, 1000),
    h: Math.max(Math.max(...ys) - y, 1000),
  };
}

// --- Writing measurements ----------------------------------------------------

export function formatLength(mm: number, unitName: Unit): string {
  if (unitName === "mm") return String(Math.round(mm));
  if (unitName === "m") return `${(mm / 1000).toFixed(2)} m`;
  const totalInches = Math.round(mm / 25.4);
  return `${Math.floor(totalInches / 12)}'-${totalInches % 12}"`;
}

/** Turns what was typed into millimetres, or null if it is not a number. */
export function parseLength(text: string, unitName: Unit): number | null {
  const value = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unitName === "mm") return value;
  if (unitName === "m") return value * 1000;
  return value * 304.8;
}

export function formatArea(squareMm: number): string {
  const squareM = squareMm / 1_000_000;
  return `${squareM.toFixed(2)} m²`;
}

export function formatAreaFeet(squareMm: number): string {
  return `${Math.round((squareMm / 1_000_000) * 10.7639).toLocaleString()} sq ft`;
}
