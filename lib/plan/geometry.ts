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
export function wallJunctionCorners(allWalls: Wall[]): Pt[] {
  const walls = allWalls.filter((wall) => !wall.m); // straight walls only
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

/** Applies the same change to every point of an object. */
function mapPoints(entity: Entity, change: (p: Pt) => Pt): Entity {
  switch (entity.kind) {
    case "wall":
      return {
        ...entity,
        a: change(entity.a),
        b: change(entity.b),
        ...(entity.m ? { m: change(entity.m) } : {}),
      };
    case "line":
    case "dim":
    case "elem":
      return { ...entity, a: change(entity.a), b: change(entity.b) };
    case "arc":
      return {
        ...entity,
        a: change(entity.a),
        b: change(entity.b),
        m: change(entity.m),
      };
    case "circle":
      return { ...entity, c: change(entity.c) };
    case "room":
      return { ...entity, pts: entity.pts.map(change) };
    case "tree":
    case "furn":
    case "text":
    case "image":
      return { ...entity, p: change(entity.p) };
    default:
      return entity; // doors and windows stay with their wall
  }
}

export function moveEntity(entity: Entity, dx: number, dy: number): Entity {
  return mapPoints(entity, (p) => [p[0] + dx, p[1] + dy]);
}

/** Turns an object around a centre point. Positive degrees turn clockwise. */
export function rotateEntity(entity: Entity, centre: Pt, degrees: number): Entity {
  if (entity.kind === "image") return entity; // pictures stay upright
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const turned = mapPoints(entity, (p) => {
    const x = p[0] - centre[0];
    const y = p[1] - centre[1];
    return roundPt([centre[0] + x * cos - y * sin, centre[1] + x * sin + y * cos]);
  });
  if (turned.kind === "furn") {
    return { ...turned, rot: (((turned.rot + degrees) % 360) + 360) % 360 };
  }
  return turned;
}

/** Flips an object left-to-right ("x") or top-to-bottom ("y") about a centre. */
export function mirrorEntity(entity: Entity, centre: Pt, axis: "x" | "y"): Entity {
  if (entity.kind === "image") return entity;
  if (entity.kind === "door" || entity.kind === "window") {
    // The wall has been flipped, so the door must swing the other way to
    // stay a true mirror image.
    return { ...entity, flipSide: !entity.flipSide };
  }
  const flipped = mapPoints(entity, (p) =>
    axis === "x" ? [2 * centre[0] - p[0], p[1]] : [p[0], 2 * centre[1] - p[1]],
  );
  if (flipped.kind === "furn") {
    const rot = axis === "x" ? -flipped.rot : 180 - flipped.rot;
    return { ...flipped, rot: ((rot % 360) + 360) % 360 };
  }
  return flipped;
}

/** A copy of a wall or line, moved sideways by a distance (negative = other side). */
export function offsetPoints(a: Pt, b: Pt, distance: number): [Pt, Pt] {
  const n = mul(perp(unit(a, b)), distance);
  return [roundPt(add(a, n)), roundPt(add(b, n))];
}

// --- Arcs ------------------------------------------------------------------

/** The centre and radius of the circle through three points (null if in a line). */
export function circleThrough(a: Pt, m: Pt, b: Pt): { c: Pt; r: number } | null {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const m2 = m[0] * m[0] + m[1] * m[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c: Pt = [
    (a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d,
    (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d,
  ];
  return { c, r: dist(c, a) };
}

/** The SVG path for an arc from a to b that passes through m. */
export function arcPath(a: Pt, m: Pt, b: Pt): string {
  const circle = circleThrough(a, m, b);
  if (!circle || circle.r > 1e7) return `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
  const cross = (p: Pt, q: Pt, o: Pt) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const turn = (m[0] - a[0]) * (b[1] - m[1]) - (m[1] - a[1]) * (b[0] - m[0]);
  const sweep = turn > 0 ? 1 : 0;
  const large = cross(b, m, a) * cross(b, circle.c, a) > 0 ? 1 : 0;
  return `M ${a[0]} ${a[1]} A ${circle.r} ${circle.r} 0 ${large} ${sweep} ${b[0]} ${b[1]}`;
}

// --- Structural elements -----------------------------------------------------

/** The plan outline of an element: where its middle is, which way it runs, and its size. */
export function elemRect(elem: Extract<Entity, { kind: "elem" }>): {
  centre: Pt;
  angle: number; // radians
  length: number;
  width: number;
} {
  if (elem.type === "column") {
    return { centre: elem.a, angle: 0, length: elem.w, width: elem.d };
  }
  if (elem.type === "slab") {
    return {
      centre: mid(elem.a, elem.b),
      angle: 0,
      length: Math.abs(elem.b[0] - elem.a[0]),
      width: Math.abs(elem.b[1] - elem.a[1]),
    };
  }
  return {
    centre: mid(elem.a, elem.b),
    angle: Math.atan2(elem.b[1] - elem.a[1], elem.b[0] - elem.a[0]),
    length: dist(elem.a, elem.b),
    width: elem.w,
  };
}

// --- Curved walls ------------------------------------------------------------
//
// A wall is curved when it has a third point, m, that its centre line passes
// through. Angles here are in radians and increase clockwise on screen.

export type WallShape =
  | { curved: false; length: number }
  | {
      curved: true;
      c: Pt; // centre of the curve
      r: number; // radius of the centre line
      start: number; // angle of the start point
      sweep: number; // angle travelled from start to end (negative = anticlockwise)
      length: number; // length along the curve
    };

export function wallShape(wall: Wall): WallShape {
  if (wall.m) {
    const circle = circleThrough(wall.a, wall.m, wall.b);
    if (circle && circle.r < 1e6) {
      const { c, r } = circle;
      const start = Math.atan2(wall.a[1] - c[1], wall.a[0] - c[0]);
      const end = Math.atan2(wall.b[1] - c[1], wall.b[0] - c[0]);
      const turn =
        (wall.m[0] - wall.a[0]) * (wall.b[1] - wall.m[1]) -
        (wall.m[1] - wall.a[1]) * (wall.b[0] - wall.m[0]);
      let sweep = end - start;
      if (turn > 0) while (sweep <= 0) sweep += Math.PI * 2;
      else while (sweep >= 0) sweep -= Math.PI * 2;
      return { curved: true, c, r, start, sweep, length: r * Math.abs(sweep) };
    }
  }
  return { curved: false, length: dist(wall.a, wall.b) };
}

export const wallLength = (wall: Wall) => wallShape(wall).length;

/** The point a given distance along a wall, and the wall's direction there. */
export function wallPointAt(wall: Wall, along: number): { p: Pt; angle: number } {
  const shape = wallShape(wall);
  if (!shape.curved) {
    return {
      p: add(wall.a, mul(unit(wall.a, wall.b), along)),
      angle: angleDeg(wall.a, wall.b),
    };
  }
  const direction = shape.sweep > 0 ? 1 : -1;
  const theta = shape.start + (direction * along) / shape.r;
  return {
    p: [shape.c[0] + shape.r * Math.cos(theta), shape.c[1] + shape.r * Math.sin(theta)],
    angle: (theta * 180) / Math.PI + direction * 90,
  };
}

/** The closest point on a wall's centre line, straight or curved. */
export function projectOnWall(p: Pt, wall: Wall) {
  const shape = wallShape(wall);
  if (!shape.curved) return project(p, wall.a, wall.b);
  const full = Math.PI * 2;
  const direction = shape.sweep > 0 ? 1 : -1;
  const size = Math.abs(shape.sweep);
  const theta = Math.atan2(p[1] - shape.c[1], p[0] - shape.c[0]);
  // How far round from the start, measured the way the wall runs.
  let travelled = (((theta - shape.start) * direction) % full + full) % full;
  if (travelled > size) {
    // Beyond the wall: use whichever end is nearer.
    travelled = travelled - size < full - travelled ? size : 0;
  }
  const along = travelled * shape.r;
  const point = wallPointAt(wall, along).p;
  return { along, point, distance: dist(p, point) };
}

/** The outline of a wall as an SVG path. */
export function wallOutline(wall: Wall, walls: Wall[]): string {
  const shape = wallShape(wall);
  if (!shape.curved) {
    const corners = wallCorners(wall, walls);
    return `M ${corners.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`;
  }
  const outer = shape.r + wall.t / 2;
  const inner = Math.max(shape.r - wall.t / 2, 1);
  const end = shape.start + shape.sweep;
  const at = (radius: number, theta: number) =>
    `${shape.c[0] + radius * Math.cos(theta)} ${shape.c[1] + radius * Math.sin(theta)}`;
  const large = Math.abs(shape.sweep) > Math.PI ? 1 : 0;
  const flag = shape.sweep > 0 ? 1 : 0;
  return (
    `M ${at(outer, shape.start)} A ${outer} ${outer} 0 ${large} ${flag} ${at(outer, end)} ` +
    `L ${at(inner, end)} A ${inner} ${inner} 0 ${large} ${1 - flag} ${at(inner, shape.start)} Z`
  );
}

/**
 * Round fillers where a curved wall meets another wall, so the join closes
 * up without a notch.
 */
export function wallJoints(walls: Wall[]): { p: Pt; r: number }[] {
  const joints: { p: Pt; r: number }[] = [];
  for (const wall of walls) {
    if (!wall.m) continue;
    for (const end of [wall.a, wall.b]) {
      const meets = walls.some(
        (other) =>
          other.id !== wall.id && (dist(other.a, end) < TOUCH || dist(other.b, end) < TOUCH),
      );
      if (meets) joints.push({ p: end, r: wall.t / 2 });
    }
  }
  return joints;
}

// --- Selecting by box --------------------------------------------------------

/** The rectangle around one object. */
export function entityBox(entity: Entity, walls: Wall[]): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  const take = (p: Pt, pad = 0) => {
    xs.push(p[0] - pad, p[0] + pad);
    ys.push(p[1] - pad, p[1] + pad);
  };
  switch (entity.kind) {
    case "wall":
      wallCorners(entity, []).forEach((p) => take(p));
      if (entity.m) take(entity.m, entity.t / 2);
      break;
    case "line":
    case "dim":
      take(entity.a);
      take(entity.b);
      break;
    case "elem":
      take(entity.a, Math.max(entity.w, entity.d) / 2);
      take(entity.b, Math.max(entity.w, entity.d) / 2);
      break;
    case "arc":
      take(entity.a);
      take(entity.b);
      take(entity.m);
      break;
    case "circle":
      take(entity.c, entity.r);
      break;
    case "room":
      entity.pts.forEach((p) => take(p));
      break;
    case "tree":
      take(entity.p, entity.r);
      break;
    case "furn":
      take(entity.p, 400);
      break;
    case "text":
      take(entity.p, 100);
      break;
    case "image":
      take(entity.p);
      take([entity.p[0] + entity.w, entity.p[1] + entity.h]);
      break;
    case "door":
    case "window": {
      const wall = walls.find((w) => w.id === entity.wallId);
      if (wall) take(wallPointAt(wall, entity.pos).p, entity.width / 2);
      break;
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** True when the object lies completely inside the box. */
export function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/** True when the object touches the box at all. */
export function boxTouches(first: Box, second: Box): boolean {
  return (
    first.x <= second.x + second.w &&
    second.x <= first.x + first.w &&
    first.y <= second.y + second.h &&
    second.y <= first.y + first.h
  );
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
        if (entity.m) take(entity.m, entity.t);
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
      case "image":
        take(entity.p);
        take([entity.p[0] + entity.w, entity.p[1] + entity.h]);
        break;
      case "circle":
        take(entity.c, entity.r);
        break;
      case "arc":
        take(entity.a);
        take(entity.b);
        take(entity.m);
        break;
      case "elem":
        take(entity.a, entity.w);
        take(entity.b, entity.w);
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
