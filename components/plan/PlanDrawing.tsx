import { memo } from "react";
import { getFurniture, type Part } from "@/lib/plan/furniture";
import {
  add,
  angleDeg,
  arcPath,
  centroid,
  dist,
  elemRect,
  extents,
  formatArea,
  formatAreaFeet,
  formatLength,
  mid,
  mul,
  perp,
  polygonArea,
  sub,
  unit,
  wallJoints,
  wallOutline,
  wallPointAt,
} from "@/lib/plan/geometry";
import { FINISH_COLOURS, getStyle, type PlanStyle } from "@/lib/plan/styles";
import { fontCss, layerOf } from "@/lib/plan/types";
import type {
  Arc,
  Circle,
  Dim,
  Elem,
  Furn,
  Label,
  Line,
  Opening,
  PlanDoc,
  Pt,
  Room,
  Tree,
  Underlay,
  Unit,
  Wall,
} from "@/lib/plan/types";

// ---------------------------------------------------------------------------
// Draws the plan itself (no tools, grid or selection marks), so the very same
// drawing is used on screen and in exported images.
//
// Line widths are in screen pixels (the SVG uses "non-scaling" strokes), while
// every position and size is in real millimetres.
// ---------------------------------------------------------------------------

const FONT = "Arial, Helvetica, sans-serif";
const pts = (points: Pt[]) => points.map((p) => `${p[0]},${p[1]}`).join(" ");

// A repeatable "random" number generator, so each tree keeps its own shape.
function seeded(id: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) {
    seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  }
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    seed ^= seed >>> 16;
    return (seed >>> 0) / 4294967296;
  };
}

// --- Floor finishes ----------------------------------------------------------

function FinishPatterns({ style }: { style: PlanStyle }) {
  const make = (
    id: string,
    w: number,
    h: number,
    lines: string,
    extra?: React.ReactNode,
  ) => {
    const colours = FINISH_COLOURS[id];
    const fill = style.colour ? colours.fill : "none";
    const line = style.colour ? colours.line : style.ink;
    return (
      <pattern
        key={id}
        id={`finish-${id}`}
        width={w}
        height={h}
        patternUnits="userSpaceOnUse"
      >
        {fill !== "none" && <rect width={w} height={h} fill={fill} />}
        <g
          fill="none"
          stroke={line}
          strokeWidth={Math.max(w, h) / 60}
          opacity={style.colour ? 1 : 0.35}
        >
          {lines && <path d={lines} />}
          {extra}
        </g>
      </pattern>
    );
  };
  return (
    <>
      {make("tile600", 600, 600, "M600 0H0V600")}
      {make("tile300", 300, 300, "M300 0H0V300")}
      {make("wood", 1200, 300, "M0 0H1200M0 150H1200M0 0V150M600 150V300")}
      {make("stone", 900, 900, "M0 0H900M0 450H900M0 0V900M320 0V450M640 450V900")}
      {make(
        "concrete",
        800,
        800,
        "",
        <>
          <circle cx="150" cy="200" r="6" />
          <circle cx="520" cy="110" r="6" />
          <circle cx="650" cy="560" r="6" />
          <circle cx="260" cy="640" r="6" />
        </>,
      )}
      {make(
        "grass",
        500,
        500,
        "M80 120l30 -60M110 120l20 -50M300 260l30 -60M330 260l20 -50M150 420l30 -60M420 90l25 -55M400 440l30 -60",
      )}
      {make("water", 600, 300, "M0 150Q150 80 300 150T600 150")}
      {make("herringbone", 600, 600, "M0 300L300 0M300 600L600 300M0 300L300 600M300 0L600 300")}
      {make("pavers", 400, 200, "M0 0H400M0 100H400M0 0V100M200 100V200")}
      {make(
        "checker",
        600,
        600,
        "M600 0H0V600",
        <path d="M0 0H300V300H0ZM300 300H600V600H300Z" fill="currentColor" stroke="none" opacity="0.28" />,
      )}
      {make(
        "terrazzo",
        500,
        500,
        "",
        <>
          <path d="M60 70l40 20-30 30ZM300 60l50 10-20 40ZM180 230l30-30 30 40ZM400 280l40 30-50 20ZM90 380l50 0-20 40ZM310 420l30-30 20 40Z" />
        </>,
      )}
      {make("carpet", 200, 200, "M50 50h1M150 150h1M150 50h1M50 150h1")}
      {make("sand", 300, 300, "M40 60h1M190 30h1M250 170h1M110 200h1M60 270h1M210 250h1")}
      {make("marble", 1200, 1200, "M1200 0H0V1200M150 1050L420 700L380 520M700 200L900 420L1080 380")}
      {make("brick", 480, 240, "M0 0H480M0 120H480M0 0V120M240 0V120M120 120V240M360 120V240")}
      {make("deck", 1800, 140, "M0 0H1800M900 0V140")}
      {make(
        "gravel",
        400,
        400,
        "",
        <>
          <circle cx="60" cy="80" r="10" />
          <circle cx="210" cy="40" r="7" />
          <circle cx="330" cy="130" r="10" />
          <circle cx="130" cy="220" r="8" />
          <circle cx="280" cy="270" r="10" />
          <circle cx="70" cy="340" r="7" />
          <circle cx="360" cy="360" r="8" />
        </>,
      )}
    </>
  );
}

function RoomView({
  room,
  style,
  textures,
  letter,
}: {
  room: Room;
  style: PlanStyle;
  textures: boolean;
  letter: number;
}) {
  let fill = style.floorTint;
  if (room.finish !== "none" && FINISH_COLOURS[room.finish]) {
    if (textures) fill = `url(#finish-${room.finish})`;
    else if (style.colour) fill = FINISH_COLOURS[room.finish].fill;
  }
  const area = polygonArea(room.pts);
  const [cx, cy] = centroid(room.pts);
  return (
    <g>
      <polygon
        points={pts(room.pts)}
        fill={fill}
        stroke={style.ink}
        strokeOpacity="0.3"
        strokeWidth="1"
        strokeDasharray="5 4"
        pointerEvents="none"
      />
      <g data-id={room.id} data-layer={layerOf(room)} fontFamily={FONT} fill={style.text} textAnchor="middle">
        <text x={cx} y={cy - letter * 0.2} fontSize={letter * 1.15} fontWeight="bold">
          {room.name}
        </text>
        <text x={cx} y={cy + letter * 1.1} fontSize={letter * 0.9}>
          {formatArea(area)} · {formatAreaFeet(area)}
        </text>
      </g>
    </g>
  );
}

// --- Furniture ---------------------------------------------------------------

function PartView({ part }: { part: Part }) {
  if (part[0] === "r") {
    return (
      <rect x={part[1]} y={part[2]} width={part[3]} height={part[4]} rx={part[5] ?? 0} />
    );
  }
  if (part[0] === "c") return <circle cx={part[1]} cy={part[2]} r={part[3]} />;
  if (part[0] === "e") {
    return <ellipse cx={part[1]} cy={part[2]} rx={part[3]} ry={part[4]} />;
  }
  return <line x1={part[1]} y1={part[2]} x2={part[3]} y2={part[4]} />;
}

function FurnView({ furn, style }: { furn: Furn; style: PlanStyle }) {
  const item = getFurniture(furn.item);
  return (
    <g
      data-id={furn.id} data-layer={layerOf(furn)}
      transform={`translate(${furn.p[0]} ${furn.p[1]}) rotate(${furn.rot}) translate(${-item.w / 2} ${-item.d / 2})`}
      fill={style.furnitureFill}
      stroke={style.furnitureLine}
      strokeWidth="1"
    >
      <rect width={item.w} height={item.d} fill="transparent" stroke="none" />
      {item.parts.map((part, index) => (
        <PartView key={index} part={part} />
      ))}
    </g>
  );
}

// --- Trees -------------------------------------------------------------------

function TreeView({ tree, style }: { tree: Tree; style: PlanStyle }) {
  const random = seeded(tree.id);
  const [x, y] = tree.p;
  const r = tree.r;
  const coloured = style.treeFills.length > 0;
  const pick = () =>
    style.treeFills[Math.floor(random() * style.treeFills.length)];
  const parts: React.ReactNode[] = [];

  const spokes = (count: number, reach: number, fork: boolean) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const length = r * reach * (0.8 + random() * 0.2);
      const ex = x + Math.cos(angle) * length;
      const ey = y + Math.sin(angle) * length;
      parts.push(<line key={`s${i}`} x1={x} y1={y} x2={ex} y2={ey} />);
      if (fork) {
        const fx = x + Math.cos(angle) * length * 0.55;
        const fy = y + Math.sin(angle) * length * 0.55;
        for (const side of [-0.5, 0.5]) {
          parts.push(
            <line
              key={`f${i}${side}`}
              x1={fx}
              y1={fy}
              x2={fx + Math.cos(angle + side) * length * 0.4}
              y2={fy + Math.sin(angle + side) * length * 0.4}
            />,
          );
        }
      }
    }
  };

  if (tree.style === "shrub") {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + random();
      parts.push(
        <circle
          key={i}
          cx={x + Math.cos(angle) * r * 0.45}
          cy={y + Math.sin(angle) * r * 0.45}
          r={r * (0.4 + random() * 0.15)}
          fill={coloured ? pick() : "none"}
          fillOpacity="0.75"
        />,
      );
    }
  } else if (tree.style === "flower") {
    parts.push(
      <circle key="bg" cx={x} cy={y} r={r} fill={coloured ? pick() : "none"} fillOpacity="0.6" />,
    );
    for (let i = 0; i < 9; i++) {
      const angle = random() * Math.PI * 2;
      const reach = r * (0.2 + random() * 0.65);
      parts.push(
        <circle
          key={`p${i}`}
          cx={x + Math.cos(angle) * reach}
          cy={y + Math.sin(angle) * reach}
          r={r * 0.09}
          fill={coloured ? "#d98a9a" : "none"}
          stroke={coloured ? "none" : undefined}
        />,
      );
    }
  } else if (tree.style === "bamboo") {
    for (let i = 0; i < 9; i++) {
      const angle = random() * Math.PI * 2;
      const reach = r * random() * 0.75;
      const cx = x + Math.cos(angle) * reach;
      const cy = y + Math.sin(angle) * reach;
      parts.push(
        <circle key={`b${i}`} cx={cx} cy={cy} r={r * 0.2} fill={coloured ? pick() : "none"} fillOpacity="0.7" />,
      );
      parts.push(<circle key={`d${i}`} cx={cx} cy={cy} r={r * 0.04} fill={style.treeLine} />);
    }
  } else if (tree.style === "conifer") {
    // A pointed star, the usual plan symbol for a pine or fir.
    const points: string[] = [];
    const tips = 12;
    for (let i = 0; i < tips * 2; i++) {
      const angle = (i / (tips * 2)) * Math.PI * 2;
      const reach = i % 2 === 0 ? r : r * 0.62;
      points.push(`${x + Math.cos(angle) * reach},${y + Math.sin(angle) * reach}`);
    }
    parts.push(
      <polygon
        key="star"
        points={points.join(" ")}
        fill={coloured ? pick() : "none"}
        fillOpacity="0.75"
      />,
    );
    parts.push(<circle key="c" cx={x} cy={y} r={r * 0.08} fill={style.treeLine} />);
  } else if (tree.style === "palm") {
    if (coloured) {
      parts.push(<circle key="bg" cx={x} cy={y} r={r} fill={pick()} fillOpacity="0.3" stroke="none" />);
    }
    spokes(9, 1, false);
    parts.push(<circle key="c" cx={x} cy={y} r={r * 0.12} fill={style.treeLine} />);
  } else if (tree.style === "branch") {
    if (coloured) {
      parts.push(<circle key="bg" cx={x} cy={y} r={r} fill={pick()} fillOpacity="0.28" stroke="none" />);
    }
    spokes(9, 0.95, true);
  } else {
    // canopy
    if (coloured) {
      parts.push(<circle key="bg" cx={x} cy={y} r={r} fill={pick()} fillOpacity="0.7" strokeOpacity="0.5" />);
      for (let i = 0; i < 3; i++) {
        const angle = random() * Math.PI * 2;
        parts.push(
          <circle
            key={`b${i}`}
            cx={x + Math.cos(angle) * r * 0.35}
            cy={y + Math.sin(angle) * r * 0.35}
            r={r * (0.35 + random() * 0.2)}
            fill={pick()}
            fillOpacity="0.55"
            stroke="none"
          />,
        );
      }
      parts.push(<circle key="t" cx={x} cy={y} r={r * 0.06} fill={style.treeLine} stroke="none" />);
    } else {
      parts.push(<circle key="o" cx={x} cy={y} r={r} />);
      spokes(8, 0.85, false);
      parts.push(<circle key="i" cx={x} cy={y} r={r * 0.1} />);
    }
  }

  return (
    <g data-id={tree.id} data-layer={layerOf(tree)} fill="none" stroke={style.treeLine} strokeWidth="1">
      <circle cx={x} cy={y} r={r} fill="transparent" stroke="none" />
      {parts}
    </g>
  );
}

// --- Doors and windows ---------------------------------------------------------

function OpeningView({
  opening,
  wall,
  style,
}: {
  opening: Opening;
  wall: Wall;
  style: PlanStyle;
}) {
  const spot = wallPointAt(wall, opening.pos);
  const centre = spot.p;
  const w = opening.width;
  const t = wall.t;
  const half = w / 2;
  let symbol: React.ReactNode;

  if (opening.kind === "door") {
    if (opening.style === "double") {
      symbol = (
        <path
          d={`M ${-half} ${t / 2} L ${-half} ${t / 2 + half} A ${half} ${half} 0 0 0 0 ${t / 2}
              M ${half} ${t / 2} L ${half} ${t / 2 + half} A ${half} ${half} 0 0 1 0 ${t / 2}`}
        />
      );
    } else if (opening.style === "sliding") {
      symbol = (
        <>
          <line x1={-half} y1={-t / 6} x2={w * 0.08} y2={-t / 6} strokeWidth="2.2" />
          <line x1={-w * 0.08} y1={t / 6} x2={half} y2={t / 6} strokeWidth="2.2" />
        </>
      );
    } else if (opening.style === "pivot") {
      // The leaf turns about a point set in from the edge.
      const pivot = -half + w * 0.2;
      symbol = (
        <path
          d={`M ${pivot} ${-t / 2 - w * 0.2} L ${pivot} ${t / 2 + w * 0.8} A ${w * 0.8} ${w * 0.8} 0 0 0 ${half} ${t / 2}`}
        />
      );
    } else if (opening.style === "double-acting") {
      symbol = (
        <>
          <path d={`M ${-half} ${t / 2} L ${-half} ${t / 2 + w} A ${w} ${w} 0 0 0 ${half} ${t / 2}`} />
          <path
            d={`M ${-half} ${-t / 2} L ${-half} ${-t / 2 - w} A ${w} ${w} 0 0 1 ${half} ${-t / 2}`}
            strokeDasharray="5 4"
            strokeOpacity="0.7"
          />
        </>
      );
    } else if (opening.style === "revolving") {
      symbol = (
        <>
          <circle r={half} />
          <path d={`M ${-half * 0.7} ${-half * 0.7} L ${half * 0.7} ${half * 0.7} M ${-half * 0.7} ${half * 0.7} L ${half * 0.7} ${-half * 0.7}`} />
        </>
      );
    } else if (opening.style === "pocket") {
      // The leaf slides into a pocket inside the wall.
      symbol = (
        <>
          <rect x={-half - w} y={-t / 4} width={w} height={t / 2} strokeDasharray="4 3" strokeOpacity="0.7" />
          <line x1={-half - w * 0.45} y1={0} x2={-half + w * 0.55} y2={0} strokeWidth="2.4" />
        </>
      );
    } else if (opening.style === "bifold") {
      symbol = (
        <path
          d={`M ${-half} ${t / 2} L ${-half + w / 4} ${t / 2 + w / 4} L 0 ${t / 2}
              M ${half} ${t / 2} L ${half - w / 4} ${t / 2 + w / 4} L 0 ${t / 2}`}
        />
      );
    } else if (opening.style === "garage") {
      // The door rolls or swings up overhead: shown dashed.
      symbol = (
        <>
          <line x1={-half} y1={0} x2={half} y2={0} strokeWidth="2.2" />
          <rect x={-half} y={t / 2} width={w} height={w * 0.3} strokeDasharray="6 4" strokeOpacity="0.7" />
        </>
      );
    } else if (opening.style === "opening") {
      symbol = (
        <path
          d={`M ${-half} ${-t / 2} H ${half} M ${-half} ${t / 2} H ${half}`}
          strokeDasharray="4 4"
          strokeOpacity="0.6"
        />
      );
    } else {
      symbol = (
        <path
          d={`M ${-half} ${t / 2} L ${-half} ${t / 2 + w} A ${w} ${w} 0 0 0 ${half} ${t / 2}`}
        />
      );
    }
  } else {
    const frame = <rect x={-half} y={-t / 2} width={w} height={t} />;
    if (opening.style === "sliding") {
      symbol = (
        <>
          {frame}
          <line x1={-half} y1={-t / 8} x2={w * 0.05} y2={-t / 8} />
          <line x1={-w * 0.05} y1={t / 8} x2={half} y2={t / 8} />
        </>
      );
    } else if (opening.style === "fixed") {
      symbol = (
        <>
          {frame}
          <line x1={-half} y1={-t / 8} x2={half} y2={-t / 8} />
          <line x1={-half} y1={t / 8} x2={half} y2={t / 8} />
        </>
      );
    } else if (opening.style === "awning") {
      // Hinged at the top and pushed out at the bottom: shown with a dashed chevron.
      symbol = (
        <>
          {frame}
          <line x1={-half} y1={0} x2={half} y2={0} />
          <path d={`M ${-half} ${t / 2} L 0 ${t / 2 + w * 0.18} L ${half} ${t / 2}`} strokeDasharray="5 4" strokeOpacity="0.7" />
        </>
      );
    } else if (opening.style === "bay") {
      // A bay window steps out beyond the wall.
      const out = w * 0.28;
      const inset = w * 0.2;
      symbol = (
        <>
          <path
            d={`M ${-half} ${t / 2} L ${-half + inset} ${t / 2 + out} L ${half - inset} ${t / 2 + out} L ${half} ${t / 2}`}
            strokeWidth="2"
          />
          <path
            d={`M ${-half} ${-t / 2} L ${-half} ${t / 2} M ${half} ${-t / 2} L ${half} ${t / 2}
                M ${-half + inset * 0.75} ${t / 2 + out * 0.75} L ${half - inset * 0.75} ${t / 2 + out * 0.75}`}
          />
        </>
      );
    } else if (opening.style === "louvre") {
      symbol = (
        <>
          {frame}
          {[-0.36, -0.18, 0, 0.18, 0.36].map((k) => (
            <line key={k} x1={w * k - t * 0.25} y1={t * 0.3} x2={w * k + t * 0.25} y2={-t * 0.3} />
          ))}
        </>
      );
    } else if (opening.style === "french") {
      // Full-height glazed doors: two leaves with light swing arcs.
      symbol = (
        <>
          {frame}
          <path
            d={`M ${-half} ${t / 2} L ${-half} ${t / 2 + half} A ${half} ${half} 0 0 0 0 ${t / 2}
                M ${half} ${t / 2} L ${half} ${t / 2 + half} A ${half} ${half} 0 0 1 0 ${t / 2}`}
            strokeOpacity="0.7"
          />
        </>
      );
    } else if (opening.style === "ventilator") {
      symbol = (
        <>
          {frame}
          <line x1={-half} y1={0} x2={half} y2={0} strokeDasharray="5 4" />
        </>
      );
    } else {
      symbol = (
        <>
          {frame}
          <line x1={-half} y1={0} x2={half} y2={0} />
        </>
      );
    }
  }

  return (
    <g
      data-id={opening.id} data-layer={layerOf(opening)}
      transform={`translate(${centre[0]} ${centre[1]}) rotate(${spot.angle})`}
    >
      {/* Cut the gap out of the wall (a little deeper on a curved wall). */}
      <rect
        x={-half}
        y={wall.m ? -t * 0.62 : -t / 2}
        width={w}
        height={wall.m ? t * 1.24 : t}
        data-keep="1"
        fill={style.paper}
        stroke={style.paper}
        strokeWidth={style.wallLineWidth * 2 + 1}
      />
      <g fill="none" stroke={style.openingLine} strokeWidth="1.3">
        <line x1={-half} y1={-t / 2} x2={-half} y2={t / 2} />
        <line x1={half} y1={-t / 2} x2={half} y2={t / 2} />
        <g
          transform={`scale(${opening.flipHinge ? -1 : 1} ${opening.flipSide ? -1 : 1})`}
        >
          {symbol}
        </g>
      </g>
    </g>
  );
}

// --- Dimensions ----------------------------------------------------------------

export function DimView({
  a,
  b,
  offset,
  id,
  layer,
  style,
  letter,
  unitName,
}: {
  a: Pt;
  b: Pt;
  offset: number;
  id?: string;
  layer?: string;
  style: PlanStyle;
  letter: number;
  unitName: Unit;
}) {
  const d = unit(a, b);
  const n = perp(d);
  const sign = offset >= 0 ? 1 : -1;
  const a2 = add(a, mul(n, offset));
  const b2 = add(b, mul(n, offset));
  const gap = mul(n, sign * letter * 0.3);
  const over = mul(n, sign * letter * 0.4);
  const tick: Pt = [(d[0] - n[0]) * letter * 0.3, (d[1] - n[1]) * letter * 0.3];
  const centre = mid(a2, b2);
  let angle = angleDeg(a, b);
  if (angle > 90 || angle <= -90) angle += 180;
  const seg = (p: Pt, q: Pt, key: string, width = 1) => (
    <line key={key} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} strokeWidth={width} />
  );
  return (
    <g data-id={id} data-layer={layer ?? "dims"} stroke={style.dimLine} fill="none">
      {id && (
        <line
          x1={a2[0]}
          y1={a2[1]}
          x2={b2[0]}
          y2={b2[1]}
          stroke="transparent"
          strokeWidth="14"
        />
      )}
      {seg(add(a, gap), add(a2, over), "ea")}
      {seg(add(b, gap), add(b2, over), "eb")}
      {seg(a2, b2, "line")}
      {seg(sub(a2, tick), add(a2, tick), "ta", 1.8)}
      {seg(sub(b2, tick), add(b2, tick), "tb", 1.8)}
      <text
        transform={`translate(${centre[0]} ${centre[1]}) rotate(${angle})`}
        y={-letter * 0.35}
        fontSize={letter}
        fontFamily={FONT}
        textAnchor="middle"
        fill={style.text}
        stroke="none"
      >
        {formatLength(dist(a, b), unitName)}
      </text>
    </g>
  );
}

// --- North arrow and scale bar ---------------------------------------------------

function SheetMarks({
  doc,
  style,
  letter,
}: {
  doc: PlanDoc;
  style: PlanStyle;
  letter: number;
}) {
  const box = extents(doc);
  const r = letter * 2.2;
  const nx = box.x + box.w + letter * 5;
  const ny = box.y + r;
  const segment = doc.settings.scale * 10; // 1 m at 1:100
  const bx = box.x;
  const by = box.y + box.h + letter * 5;
  return (
    <g fontFamily={FONT} fill={style.text} stroke={style.ink} strokeWidth="1">
      <g transform={`translate(${nx} ${ny}) rotate(${doc.site?.north ?? 0})`}>
        <circle r={r} fill="none" />
        <path d={`M 0 ${-r} L ${r * 0.45} ${r * 0.7} L 0 ${r * 0.35} Z`} fill={style.ink} />
        <path d={`M 0 ${-r} L ${-r * 0.45} ${r * 0.7} L 0 ${r * 0.35} Z`} fill="none" />
        <text y={-r - letter * 0.4} fontSize={letter * 1.2} fontWeight="bold" textAnchor="middle" stroke="none">
          N
        </text>
      </g>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={bx + i * segment}
          y={by}
          width={segment}
          height={letter * 0.5}
          fill={i % 2 === 0 ? style.ink : "none"}
        />
      ))}
      <text x={bx} y={by + letter * 1.8} fontSize={letter} stroke="none">
        0
      </text>
      <text x={bx + segment * 4} y={by + letter * 1.8} fontSize={letter} textAnchor="middle" stroke="none">
        {formatLength(segment * 4, "m")}
      </text>
      <text x={bx + segment * 4 + letter * 3} y={by + letter * 0.6} fontSize={letter} stroke="none">
        Scale 1:{doc.settings.scale}
      </text>
    </g>
  );
}

// --- The whole drawing -------------------------------------------------------------

function PlanDrawing({
  doc,
  activeId = null,
}: {
  doc: PlanDoc;
  activeId?: string | null; // the selected object, if any
}) {
  const { settings, site } = doc;
  const base = getStyle(settings.style);
  const style: PlanStyle = settings.wallColor
    ? { ...base, wallFill: settings.wallColor, wallLine: settings.wallColor }
    : base;
  const letter = 2.5 * settings.scale; // 2.5 mm tall lettering on paper
  // Objects on a hidden layer are left out altogether.
  const visible = doc.entities.filter((e) => !settings.hidden.includes(layerOf(e)));
  const show = (layer: string) =>
    layer === "site" || layer === "marks" ? !settings.hidden.includes(layer) : true;

  // Per-layer line weight and colour, written as CSS so it applies to every
  // object on that layer. 0.25 mm on paper is drawn 1 pixel wide.
  const layerCss = Object.entries(settings.layerLooks ?? {})
    .map(([id, look]) => {
      const lines = `[data-layer="${id}"]:not(g):not(text):not(image):not([data-wall]):not([stroke="none"]):not([stroke="transparent"]), [data-layer="${id}"] *:not(text):not([stroke="none"]):not([stroke="transparent"]):not([data-keep])`;
      let css = "";
      if (look.weight) {
        css += `${lines}{stroke-width:${look.weight * 4}px}`;
        css += `[data-layer="${id}"][data-wall]{stroke-width:${look.weight * 8}px}`;
      }
      if (look.color && /^#[0-9a-fA-F]{6}$/.test(look.color)) {
        css += `${lines}{stroke:${look.color}}`;
        css += `[data-layer="${id}"][data-wall]{stroke:${look.color}}`;
        css += `text[data-layer="${id}"], [data-layer="${id}"] text{fill:${look.color}}`;
      }
      return css;
    })
    .join("");

  const of = <K extends string>(kind: K) =>
    visible.filter((e) => e.kind === kind) as Extract<
      PlanDoc["entities"][number],
      { kind: K }
    >[];
  const walls = of("wall") as Wall[];
  const rooms = of("room") as Room[];
  const openings = visible.filter(
    (e): e is Opening => e.kind === "door" || e.kind === "window",
  );
  const outlines = walls.map((wall) => ({ wall, d: wallOutline(wall, walls) }));
  const joints = wallJoints(walls);
  const shadowShift = `translate(${Math.max(...walls.map((w) => w.h), 3000) * 0.1} ${Math.max(...walls.map((w) => w.h), 3000) * 0.1})`;

  return (
    <g>
      <defs>
        <FinishPatterns style={style} />
      </defs>
      {layerCss && <style>{layerCss}</style>}

      {/* Traced pictures sit at the very back. They can only be clicked while
          selected, so they never get in the way of drawing. */}
      {show("underlay") &&
        (of("image") as Underlay[]).map((image) => (
          <image
            key={image.id}
            data-id={image.id} data-layer={layerOf(image)}
            href={image.href}
            x={image.p[0]}
            y={image.p[1]}
            width={image.w}
            height={image.h}
            opacity={image.opacity}
            preserveAspectRatio="none"
            pointerEvents={image.id === activeId ? "auto" : "none"}
          />
        ))}

      {site && show("site") && (
        <g fontFamily={FONT}>
          <rect
            width={site.w}
            height={site.d}
            fill="none"
            stroke={style.site}
            strokeWidth="1.4"
            strokeDasharray="14 6 3 6"
          />
          <text
            x={site.w / 2}
            y={site.d + letter * 2}
            fontSize={letter * 1.1}
            textAnchor="middle"
            fill={style.site}
          >
            ROAD
          </text>
          <text x={0} y={-letter * 0.8} fontSize={letter * 0.9} fill={style.site}>
            Site {formatLength(site.w, "m")} x {formatLength(site.d, "m")} ={" "}
            {formatArea(site.w * site.d)}
          </text>
        </g>
      )}

      {show("rooms") &&
        rooms.map((room) => (
          <RoomView
            key={room.id}
            room={room}
            style={style}
            textures={settings.textures}
            letter={letter}
          />
        ))}

      {show("furniture") &&
        (of("furn") as Furn[]).map((furn) => (
          <FurnView key={furn.id} furn={furn} style={style} />
        ))}

      {settings.shadows && (
        <g fill={style.shadow} stroke="none" pointerEvents="none">
          {show("walls") && (
            <g transform={shadowShift}>
              {outlines.map(({ wall, d }) => (
                <path key={wall.id} d={d} />
              ))}
            </g>
          )}
          {show("landscape") &&
            (of("tree") as Tree[]).map((tree) => (
              <circle
                key={tree.id}
                cx={tree.p[0] + tree.r * 0.18}
                cy={tree.p[1] + tree.r * 0.18}
                r={tree.r}
              />
            ))}
        </g>
      )}

      {show("lines") &&
        (of("line") as Line[]).map((line) => (
          <g key={line.id} data-id={line.id} data-layer={layerOf(line)}>
            <line
              x1={line.a[0]}
              y1={line.a[1]}
              x2={line.b[0]}
              y2={line.b[1]}
              stroke="transparent"
              strokeWidth="12"
            />
            <line
              x1={line.a[0]}
              y1={line.a[1]}
              x2={line.b[0]}
              y2={line.b[1]}
              stroke={style.ink}
              strokeWidth="1.1"
            />
          </g>
        ))}

      {show("lines") && (
        <g fill="none">
          {(of("circle") as Circle[]).map((circle) => (
            <g key={circle.id} data-id={circle.id} data-layer={layerOf(circle)}>
              <circle cx={circle.c[0]} cy={circle.c[1]} r={circle.r} stroke="transparent" strokeWidth="12" />
              <circle cx={circle.c[0]} cy={circle.c[1]} r={circle.r} stroke={style.ink} strokeWidth="1.1" />
            </g>
          ))}
          {(of("arc") as Arc[]).map((arc) => {
            const d = arcPath(arc.a, arc.m, arc.b);
            return (
              <g key={arc.id} data-id={arc.id} data-layer={layerOf(arc)}>
                <path d={d} stroke="transparent" strokeWidth="12" />
                <path d={d} stroke={style.ink} strokeWidth="1.1" />
              </g>
            );
          })}
        </g>
      )}

      {/* Walls are drawn twice: outlines first, then fills on top, so that
          walls which meet merge into one clean shape. */}
      {show("walls") && (
        <>
          {outlines.map(({ wall, d }) => (
            <path
              key={wall.id}
              data-id={wall.id} data-layer={layerOf(wall)}
              data-wall="1"
              d={d}
              fill={style.wallFill}
              stroke={style.wallLine}
              strokeWidth={style.wallLineWidth * 2}
              strokeLinejoin="miter"
            />
          ))}
          {joints.map((joint, index) => (
            <circle
              key={index}
              cx={joint.p[0]}
              cy={joint.p[1]}
              r={joint.r}
              fill={style.wallFill}
              stroke={style.wallLine}
              strokeWidth={style.wallLineWidth * 2}
              pointerEvents="none"
            />
          ))}
          {outlines.map(({ wall, d }) => (
            <path key={wall.id} data-id={wall.id} data-layer={layerOf(wall)} d={d} fill={style.wallFill} stroke="none" />
          ))}
          {joints.map((joint, index) => (
            <circle
              key={index}
              cx={joint.p[0]}
              cy={joint.p[1]}
              r={joint.r}
              fill={style.wallFill}
              stroke="none"
              pointerEvents="none"
            />
          ))}
        </>
      )}

      {/* Columns, beams, stairs, slabs and railings */}
      {(of("elem") as Elem[]).map((elem) => {
        const { centre, angle, length, width } = elemRect(elem);
        const x = -length / 2;
        const y = -width / 2;
        const line = { stroke: style.ink, strokeWidth: 1.2, fill: "none" };
        const steps = Math.max(2, Math.round(length / 280));
        return (
          <g
            key={elem.id}
            data-id={elem.id}
            data-layer={layerOf(elem)}
            transform={`translate(${centre[0]} ${centre[1]}) rotate(${(angle * 180) / Math.PI})`}
          >
            <rect x={x} y={y} width={length} height={width} fill="transparent" stroke="transparent" strokeWidth="10" />
            {elem.type === "column" && (
              <rect x={x} y={y} width={length} height={width} fill={style.ink} stroke={style.ink} strokeWidth="1.5" />
            )}
            {elem.type === "beam" && (
              <rect x={x} y={y} width={length} height={width} {...line} strokeDasharray="9 5" />
            )}
            {elem.type === "slab" && (
              <>
                <rect x={x} y={y} width={length} height={width} {...line} strokeDasharray="12 4 2 4" />
                <line x1={x} y1={y} x2={x + length} y2={y + width} {...line} strokeOpacity="0.4" />
              </>
            )}
            {elem.type === "railing" && (
              <>
                <rect x={x} y={y} width={length} height={width} {...line} />
                <line x1={x} y1={0} x2={x + length} y2={0} {...line} strokeOpacity="0.5" />
              </>
            )}
            {elem.type === "stair" && (
              <>
                <rect x={x} y={y} width={length} height={width} {...line} />
                {Array.from({ length: steps - 1 }, (_, i) => (
                  <line
                    key={i}
                    x1={x + (length * (i + 1)) / steps}
                    y1={y}
                    x2={x + (length * (i + 1)) / steps}
                    y2={y + width}
                    {...line}
                    strokeWidth="1"
                  />
                ))}
                {/* The arrow points up the stair. */}
                <path
                  d={`M ${x + length * 0.08} 0 H ${x + length * 0.92} M ${x + length * 0.92 - width * 0.2} ${-width * 0.15} L ${x + length * 0.92} 0 L ${x + length * 0.92 - width * 0.2} ${width * 0.15}`}
                  {...line}
                />
              </>
            )}
          </g>
        );
      })}

      {show("openings") &&
        openings.map((opening) => {
          const wall = walls.find((w) => w.id === opening.wallId);
          return wall ? (
            <OpeningView key={opening.id} opening={opening} wall={wall} style={style} />
          ) : null;
        })}

      {show("landscape") &&
        (of("tree") as Tree[]).map((tree) => (
          <TreeView key={tree.id} tree={tree} style={style} />
        ))}

      {show("dims") && (
        <>
          {(of("dim") as Dim[]).map((dim) => (
            <DimView
              key={dim.id}
              id={dim.id}
              layer={layerOf(dim)}
              a={dim.a}
              b={dim.b}
              offset={dim.offset}
              style={style}
              letter={letter}
              unitName={settings.unit}
            />
          ))}
          {settings.autoDims &&
            walls.filter((wall) => !wall.m).map((wall) => (
              <DimView
                key={`auto-${wall.id}`}
                a={wall.a}
                b={wall.b}
                offset={wall.t / 2 + letter * 2}
                style={style}
                letter={letter}
                unitName={settings.unit}
              />
            ))}
        </>
      )}

      {show("text") &&
        (of("text") as Label[]).map((label) => {
          const size = letter * label.size;
          return (
            <g key={label.id} data-id={label.id} data-layer={layerOf(label)}>
              {label.level && (
                // A level mark: a small target showing where the height applies.
                <g stroke={style.ink} strokeWidth="1.2" fill="none">
                  <circle cx={label.p[0]} cy={label.p[1]} r={size * 0.45} />
                  <path
                    d={`M ${label.p[0] - size * 0.7} ${label.p[1]} H ${label.p[0] + size * 0.7} M ${label.p[0]} ${label.p[1] - size * 0.7} V ${label.p[1] + size * 0.7}`}
                  />
                  <path
                    d={`M ${label.p[0]} ${label.p[1]} L ${label.p[0] + size * 0.45} ${label.p[1]} A ${size * 0.45} ${size * 0.45} 0 0 0 ${label.p[0]} ${label.p[1] - size * 0.45} Z`}
                    fill={style.ink}
                  />
                </g>
              )}
              <text
                x={label.p[0] + (label.level ? size * 0.9 : 0)}
                y={label.p[1] + (label.level ? size * 0.35 : 0)}
                fontSize={size}
                fontFamily={fontCss(label.font)}
                fontWeight={label.bold ? "bold" : "normal"}
                fontStyle={label.italic ? "italic" : "normal"}
                fill={label.color || style.text}
                transform={label.rot ? `rotate(${label.rot} ${label.p[0]} ${label.p[1]})` : undefined}
              >
                {label.text}
              </text>
            </g>
          );
        })}

      {show("marks") && <SheetMarks doc={doc} style={style} letter={letter} />}
    </g>
  );
}

// Redrawn only when the plan itself changes, so large buildings stay smooth
// while the pointer moves.
export default memo(PlanDrawing);
