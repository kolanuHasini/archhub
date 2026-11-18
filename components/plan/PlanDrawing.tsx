import { getFurniture, type Part } from "@/lib/plan/furniture";
import {
  add,
  angleDeg,
  centroid,
  dist,
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
  wallCorners,
} from "@/lib/plan/geometry";
import { FINISH_COLOURS, getStyle, type PlanStyle } from "@/lib/plan/styles";
import type {
  Dim,
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
      <g data-id={room.id} fontFamily={FONT} fill={style.text} textAnchor="middle">
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
      data-id={furn.id}
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
    <g data-id={tree.id} fill="none" stroke={style.treeLine} strokeWidth="1">
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
  const d = unit(wall.a, wall.b);
  const centre = add(wall.a, mul(d, opening.pos));
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
      data-id={opening.id}
      transform={`translate(${centre[0]} ${centre[1]}) rotate(${angleDeg(wall.a, wall.b)})`}
    >
      {/* Cut the gap out of the wall. */}
      <rect
        x={-half}
        y={-t / 2}
        width={w}
        height={t}
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
  style,
  letter,
  unitName,
}: {
  a: Pt;
  b: Pt;
  offset: number;
  id?: string;
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
    <g data-id={id} stroke={style.dimLine} fill="none">
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

export default function PlanDrawing({
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
  const show = (layer: string) => !settings.hidden.includes(layer);

  const of = <K extends string>(kind: K) =>
    doc.entities.filter((e) => e.kind === kind) as Extract<
      PlanDoc["entities"][number],
      { kind: K }
    >[];
  const walls = of("wall") as Wall[];
  const rooms = of("room") as Room[];
  const openings = doc.entities.filter(
    (e): e is Opening => e.kind === "door" || e.kind === "window",
  );
  const corners = walls.map((wall) => ({ wall, points: wallCorners(wall, walls) }));
  const shadowShift = `translate(${Math.max(...walls.map((w) => w.h), 3000) * 0.1} ${Math.max(...walls.map((w) => w.h), 3000) * 0.1})`;

  return (
    <g>
      <defs>
        <FinishPatterns style={style} />
      </defs>

      {/* Traced pictures sit at the very back. They can only be clicked while
          selected, so they never get in the way of drawing. */}
      {show("underlay") &&
        (of("image") as Underlay[]).map((image) => (
          <image
            key={image.id}
            data-id={image.id}
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
              {corners.map(({ wall, points }) => (
                <polygon key={wall.id} points={pts(points)} />
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
          <g key={line.id} data-id={line.id}>
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

      {/* Walls are drawn twice: outlines first, then fills on top, so that
          walls which meet merge into one clean shape. */}
      {show("walls") && (
        <>
          {corners.map(({ wall, points }) => (
            <polygon
              key={wall.id}
              data-id={wall.id}
              points={pts(points)}
              fill={style.wallFill}
              stroke={style.wallLine}
              strokeWidth={style.wallLineWidth * 2}
              strokeLinejoin="miter"
            />
          ))}
          {corners.map(({ wall, points }) => (
            <polygon
              key={wall.id}
              data-id={wall.id}
              points={pts(points)}
              fill={style.wallFill}
              stroke="none"
            />
          ))}
        </>
      )}

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
              a={dim.a}
              b={dim.b}
              offset={dim.offset}
              style={style}
              letter={letter}
              unitName={settings.unit}
            />
          ))}
          {settings.autoDims &&
            walls.map((wall) => (
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
        (of("text") as Label[]).map((label) => (
          <text
            key={label.id}
            data-id={label.id}
            x={label.p[0]}
            y={label.p[1]}
            fontSize={letter * label.size}
            fontFamily={FONT}
            fill={style.text}
          >
            {label.text}
          </text>
        ))}

      {show("marks") && <SheetMarks doc={doc} style={style} letter={letter} />}
    </g>
  );
}
