"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// The picture in the hero: a small floor plan that draws itself, inside a
// frame that looks like the studio. Move the pointer over it and a crosshair
// follows, reading out the position in millimetres, as it does in the studio.
// ---------------------------------------------------------------------------

const WIDTH = 600;
const HEIGHT = 420;
const MM_PER_UNIT = 25; // the little plan is drawn at 1 unit = 25 mm

// Each line of the drawing, in the order it is drawn.
const WALLS = [
  "M 90 90 H 380", // top
  "M 380 90 V 200", // right, upper
  "M 380 200 A 110 110 0 0 1 270 330", // curved corner
  "M 270 330 H 90", // bottom
  "M 90 330 V 90", // left
  "M 230 90 V 200", // inner wall
  "M 230 200 H 90", // inner wall
];

const DETAILS = [
  "M 150 200 V 245 A 45 45 0 0 0 195 200", // door swing
  "M 270 90 H 340", // window
  "M 90 240 V 300", // window
  "M 110 110 H 190 V 170 H 110 Z M 110 128 H 190", // bed
  "M 290 130 H 350 V 170 H 290 Z", // table
  "M 430 120 m -34 0 a 34 34 0 1 0 68 0 a 34 34 0 1 0 -68 0", // tree
  "M 470 300 m -26 0 a 26 26 0 1 0 52 0 a 26 26 0 1 0 -52 0", // tree
];

const DIMENSIONS = [
  "M 90 60 H 380 M 90 52 V 68 M 380 52 V 68",
  "M 60 90 V 330 M 52 90 H 68 M 52 330 H 68",
];

export default function HeroPlan() {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  function follow(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPoint({
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    });
  }

  const readout = (value: number) =>
    Math.round(value * MM_PER_UNIT).toLocaleString("en").replace(/,/g, " ");

  return (
    <div className="border border-ink bg-surface shadow-[10px_10px_0_0_var(--line)]">
      {/* Title bar */}
      <div className="flex items-center justify-between gap-3 border-b border-ink px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider">
        <span>Ground floor plan</span>
        <span className="text-muted">Scale 1:100</span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="A floor plan with a curved wall being drawn"
        onPointerMove={follow}
        onPointerLeave={() => setPoint(null)}
        className="drafting-grid block w-full cursor-crosshair touch-none"
      >
        <g fill="none" stroke="var(--ink)" strokeLinecap="square">
          {WALLS.map((d, index) => (
            <path
              key={d}
              d={d}
              pathLength="1"
              strokeWidth="7"
              className="draw"
              style={{ animationDelay: `${0.3 + index * 0.22}s` }}
            />
          ))}
          {DETAILS.map((d, index) => (
            <path
              key={d}
              d={d}
              pathLength="1"
              strokeWidth="1.4"
              className="draw"
              style={{ animationDelay: `${2 + index * 0.16}s` }}
            />
          ))}
        </g>
        <g fill="none" stroke="var(--accent)" strokeWidth="1.2">
          {DIMENSIONS.map((d, index) => (
            <path
              key={d}
              d={d}
              pathLength="1"
              className="draw"
              style={{ animationDelay: `${3.2 + index * 0.25}s` }}
            />
          ))}
        </g>
        <g
          fill="var(--accent)"
          fontFamily="var(--font-geist-mono), monospace"
          fontSize="12"
          className="fade-in"
          style={{ animationDelay: "3.9s" }}
        >
          <text x="235" y="48" textAnchor="middle">
            7 250
          </text>
          <text x="48" y="214" textAnchor="middle" transform="rotate(-90 48 214)">
            6 000
          </text>
        </g>

        {/* The crosshair that follows the pointer. */}
        {point && (
          <g stroke="var(--accent)" strokeWidth="1" pointerEvents="none">
            <line x1={point.x} y1="0" x2={point.x} y2={HEIGHT} opacity="0.55" />
            <line x1="0" y1={point.y} x2={WIDTH} y2={point.y} opacity="0.55" />
            <rect
              x={point.x - 5}
              y={point.y - 5}
              width="10"
              height="10"
              fill="var(--surface)"
            />
          </g>
        )}
      </svg>

      {/* Status line */}
      <div className="flex items-center justify-between gap-3 border-t border-ink px-4 py-2 font-mono text-[11px] text-muted">
        <span className="truncate">
          <span className="text-accent">&gt;</span>{" "}
          {point ? "WALL: click the next point" : "Move over the drawing"}
        </span>
        <span className="shrink-0 tabular-nums">
          {point
            ? `X ${readout(point.x)}  Y ${readout(point.y)} mm`
            : "SNAP · ORTHO · GRID"}
        </span>
      </div>
    </div>
  );
}
