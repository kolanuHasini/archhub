import { polygonArea, wallOutline } from "@/lib/plan/geometry";
import type { Entity, Room, Wall } from "@/lib/plan/types";

// A small live picture of a project's floor plan, drawn from the real walls.

export type PlanSummary = {
  walls: Wall[];
  rooms: Room[];
  floors: number;
  area: number; // square millimetres, all floors
  objects: number;
};

/** Reads the useful facts out of a saved plan. */
export function summarisePlan(saved: {
  entities?: unknown;
  floors?: unknown;
}): PlanSummary {
  const entities = (Array.isArray(saved.entities) ? saved.entities : []) as Entity[];
  const floors = Array.isArray(saved.floors) ? saved.floors.length : 1;
  const onGround = (e: Entity) => (e.floor ?? "g") === "g";
  let walls = entities.filter((e): e is Wall => e.kind === "wall" && onGround(e));
  // If the ground floor is empty, show whichever floor has been drawn.
  if (walls.length === 0) walls = entities.filter((e): e is Wall => e.kind === "wall");
  const rooms = entities.filter((e): e is Room => e.kind === "room");
  return {
    walls,
    rooms: rooms.filter(onGround),
    floors,
    area: rooms.reduce((sum, room) => sum + polygonArea(room.pts), 0),
    objects: entities.length,
  };
}

export default function PlanThumb({ plan }: { plan: PlanSummary }) {
  if (plan.walls.length === 0) {
    return (
      <div className="drafting-grid flex h-full min-h-40 items-center justify-center text-[15px] text-muted">
        No walls drawn yet
      </div>
    );
  }
  const xs = plan.walls.flatMap((w) => [w.a[0], w.b[0], ...(w.m ? [w.m[0]] : [])]);
  const ys = plan.walls.flatMap((w) => [w.a[1], w.b[1], ...(w.m ? [w.m[1]] : [])]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(Math.max(...xs) - minX, 1000);
  const height = Math.max(Math.max(...ys) - minY, 1000);
  const pad = Math.max(width, height) * 0.12;
  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`}
      role="img"
      aria-label="Floor plan preview"
      className="drafting-grid h-full max-h-64 min-h-40 w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {plan.rooms.map((room) => (
        <polygon
          key={room.id}
          points={room.pts.map((p) => p.join(",")).join(" ")}
          fill="var(--accent)"
          fillOpacity="0.1"
        />
      ))}
      {plan.walls.map((wall) => (
        <path key={wall.id} d={wallOutline(wall, plan.walls)} fill="var(--ink)" />
      ))}
    </svg>
  );
}
