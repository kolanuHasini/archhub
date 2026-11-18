import { getFurniture } from "./furniture";
import { add, dist, mul, perp, sub, unit, wallCorners } from "./geometry";
import {
  newId,
  type Entity,
  type Line,
  type Opening,
  type PlanDoc,
  type Pt,
  type Wall,
} from "./types";

// ---------------------------------------------------------------------------
// DXF is the open exchange format that AutoCAD, Revit, SketchUp and others
// can open and save. (DWG itself is a closed format that a website cannot
// read or write; in AutoCAD use "Save As > DXF" to bring a drawing here.)
//
// DXF measures y upwards, the screen measures y downwards, so y is flipped.
// ---------------------------------------------------------------------------

const DXF_LAYERS: Record<string, number> = {
  WALLS: 7, // white/black
  OPENINGS: 4, // cyan
  DIMENSIONS: 3, // green
  ROOMS: 8, // grey
  FURNITURE: 6, // magenta
  LANDSCAPE: 3,
  LINES: 7,
  TEXT: 7,
  SITE: 1, // red
};

export function exportDxf(doc: PlanDoc): string {
  const out: string[] = [];
  const put = (code: number, value: string | number) => {
    out.push(String(code), typeof value === "number" ? String(Number(value.toFixed(3))) : value);
  };
  const line = (layer: string, a: Pt, b: Pt) => {
    put(0, "LINE");
    put(8, layer);
    put(10, a[0]);
    put(20, -a[1]);
    put(11, b[0]);
    put(21, -b[1]);
  };
  const loop = (layer: string, points: Pt[]) => {
    points.forEach((point, index) =>
      line(layer, point, points[(index + 1) % points.length]),
    );
  };
  const text = (layer: string, at: Pt, height: number, value: string) => {
    put(0, "TEXT");
    put(8, layer);
    put(10, at[0]);
    put(20, -at[1]);
    put(40, height);
    put(1, value.replace(/[\r\n]+/g, " "));
  };

  // Header: drawing units are millimetres.
  put(0, "SECTION");
  put(2, "HEADER");
  put(9, "$INSUNITS");
  put(70, 4);
  put(0, "ENDSEC");

  // Layer table.
  put(0, "SECTION");
  put(2, "TABLES");
  put(0, "TABLE");
  put(2, "LAYER");
  put(70, Object.keys(DXF_LAYERS).length);
  for (const [name, colour] of Object.entries(DXF_LAYERS)) {
    put(0, "LAYER");
    put(2, name);
    put(70, 0);
    put(62, colour);
    put(6, "CONTINUOUS");
  }
  put(0, "ENDTAB");
  put(0, "ENDSEC");

  put(0, "SECTION");
  put(2, "ENTITIES");

  if (doc.site) {
    loop("SITE", [
      [0, 0],
      [doc.site.w, 0],
      [doc.site.w, doc.site.d],
      [0, doc.site.d],
    ]);
  }

  const walls = doc.entities.filter((e): e is Wall => e.kind === "wall");
  const textHeight = 2.5 * doc.settings.scale;

  for (const entity of doc.entities) {
    switch (entity.kind) {
      case "wall":
        loop("WALLS", wallCorners(entity, walls));
        break;
      case "door":
      case "window": {
        const wall = walls.find((w) => w.id === entity.wallId);
        if (!wall) break;
        const d = unit(wall.a, wall.b);
        const n = mul(perp(d), wall.t / 2);
        const centre = add(wall.a, mul(d, entity.pos));
        const left = sub(centre, mul(d, entity.width / 2));
        const right = add(centre, mul(d, entity.width / 2));
        loop("OPENINGS", [add(left, n), add(right, n), sub(right, n), sub(left, n)]);
        if (entity.kind === "window") line("OPENINGS", left, right);
        break;
      }
      case "dim": {
        const n = mul(perp(unit(entity.a, entity.b)), entity.offset);
        const a = add(entity.a, n);
        const b = add(entity.b, n);
        line("DIMENSIONS", entity.a, a);
        line("DIMENSIONS", entity.b, b);
        line("DIMENSIONS", a, b);
        text(
          "DIMENSIONS",
          [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          textHeight,
          String(Math.round(dist(entity.a, entity.b))),
        );
        break;
      }
      case "room":
        loop("ROOMS", entity.pts);
        break;
      case "tree":
        put(0, "CIRCLE");
        put(8, "LANDSCAPE");
        put(10, entity.p[0]);
        put(20, -entity.p[1]);
        put(40, entity.r);
        break;
      case "furn": {
        const item = getFurniture(entity.item);
        const angle = (entity.rot * Math.PI) / 180;
        const turn = (x: number, y: number): Pt => [
          entity.p[0] + x * Math.cos(angle) - y * Math.sin(angle),
          entity.p[1] + x * Math.sin(angle) + y * Math.cos(angle),
        ];
        loop("FURNITURE", [
          turn(-item.w / 2, -item.d / 2),
          turn(item.w / 2, -item.d / 2),
          turn(item.w / 2, item.d / 2),
          turn(-item.w / 2, item.d / 2),
        ]);
        break;
      }
      case "text":
        text("TEXT", entity.p, textHeight * entity.size, entity.text);
        break;
      case "line":
        line("LINES", entity.a, entity.b);
        break;
    }
  }

  put(0, "ENDSEC");
  put(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

const MAX_IMPORTED_LINES = 8000;

/**
 * Reads the lines and polylines from a DXF file as drafting lines.
 * Returns null if the file does not look like a DXF.
 */
export function importDxf(
  content: string,
): { lines: Line[]; skipped: number } | null {
  const rows = content.split(/\r\n|\r|\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const code = Number(rows[i].trim());
    if (!Number.isInteger(code)) return null;
    pairs.push([code, rows[i + 1].trim()]);
  }
  if (!pairs.some(([code, value]) => code === 0 && value === "SECTION")) {
    return null;
  }

  // Work out the drawing's units so everything arrives in millimetres.
  let factor = 1;
  const unitsAt = pairs.findIndex(([c, v]) => c === 9 && v === "$INSUNITS");
  if (unitsAt >= 0 && pairs[unitsAt + 1]) {
    const units = Number(pairs[unitsAt + 1][1]);
    factor = { 1: 25.4, 2: 304.8, 5: 10, 6: 1000 }[units] ?? 1;
  }

  const lines: Line[] = [];
  let skipped = 0;
  const addLine = (a: Pt, b: Pt) => {
    if (lines.length >= MAX_IMPORTED_LINES) {
      skipped++;
      return;
    }
    lines.push({
      id: newId(),
      kind: "line",
      a: [a[0] * factor, -a[1] * factor],
      b: [b[0] * factor, -b[1] * factor],
    });
  };

  let start = pairs.findIndex(([c, v]) => c === 2 && v === "ENTITIES");
  if (start < 0) start = 0;
  let i = start + 1;
  while (i < pairs.length) {
    const [code, value] = pairs[i];
    if (code !== 0) {
      i++;
      continue;
    }
    if (value === "ENDSEC" || value === "EOF") break;
    // Collect this entity's own values (up to the next code 0).
    let end = i + 1;
    while (end < pairs.length && pairs[end][0] !== 0) end++;
    const body = pairs.slice(i + 1, end);
    const num = (wanted: number) => {
      const found = body.find(([c]) => c === wanted);
      return found ? Number(found[1]) : NaN;
    };

    if (value === "LINE") {
      const a: Pt = [num(10), num(20)];
      const b: Pt = [num(11), num(21)];
      if ([...a, ...b].every(Number.isFinite)) addLine(a, b);
    } else if (value === "LWPOLYLINE") {
      const points: Pt[] = [];
      let x: number | null = null;
      for (const [c, v] of body) {
        if (c === 10) x = Number(v);
        else if (c === 20 && x !== null) {
          points.push([x, Number(v)]);
          x = null;
        }
      }
      const closed = (num(70) & 1) === 1;
      for (let k = 0; k + 1 < points.length; k++) addLine(points[k], points[k + 1]);
      if (closed && points.length > 2) addLine(points[points.length - 1], points[0]);
    } else if (value !== "SECTION") {
      // Arcs, circles, blocks, text and so on are not brought in yet.
      if (!["VERTEX", "SEQEND", "POLYLINE"].includes(value)) skipped++;
    }
    i = end;
  }

  return { lines, skipped };
}

/** Removes openings whose wall no longer exists. */
export function dropOrphanOpenings(entities: Entity[]): Entity[] {
  const wallIds = new Set(
    entities.filter((e) => e.kind === "wall").map((e) => e.id),
  );
  return entities.filter(
    (e) =>
      (e.kind !== "door" && e.kind !== "window") ||
      wallIds.has((e as Opening).wallId),
  );
}
