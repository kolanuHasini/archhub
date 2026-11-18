// ---------------------------------------------------------------------------
// Render styles: the same plan can be shown as a technical drawing, a
// blueprint, or a coloured presentation plan. To add a style, copy one block
// and change its colours.
// ---------------------------------------------------------------------------

export type PlanStyle = {
  id: string;
  name: string;
  note: string;
  paper: string; // background
  ink: string; // general line colour
  wallFill: string;
  wallLine: string;
  wallLineWidth: number; // in screen pixels
  openingLine: string;
  dimLine: string;
  text: string;
  furnitureLine: string;
  furnitureFill: string;
  treeLine: string;
  treeFills: string[]; // empty = trees are drawn as lines only
  floorTint: string; // colour of a room with no finish ("none" = see-through)
  colour: boolean; // false = floor finishes are drawn as plain line hatches
  grid: string;
  site: string;
  shadow: string;
};

export const PLAN_STYLES: PlanStyle[] = [
  {
    id: "technical",
    name: "Technical",
    note: "Black lines on white, like a working drawing.",
    paper: "#ffffff",
    ink: "#111111",
    wallFill: "#ffffff",
    wallLine: "#111111",
    wallLineWidth: 2.2,
    openingLine: "#111111",
    dimLine: "#444444",
    text: "#111111",
    furnitureLine: "#555555",
    furnitureFill: "none",
    treeLine: "#444444",
    treeFills: [],
    floorTint: "none",
    colour: false,
    grid: "#d5dae3",
    site: "#666666",
    shadow: "rgba(0,0,0,0.18)",
  },
  {
    id: "poche",
    name: "Solid walls",
    note: "Walls filled solid black for a strong, readable plan.",
    paper: "#ffffff",
    ink: "#111111",
    wallFill: "#151515",
    wallLine: "#151515",
    wallLineWidth: 1,
    openingLine: "#111111",
    dimLine: "#444444",
    text: "#111111",
    furnitureLine: "#666666",
    furnitureFill: "none",
    treeLine: "#555555",
    treeFills: [],
    floorTint: "none",
    colour: false,
    grid: "#d5dae3",
    site: "#666666",
    shadow: "rgba(0,0,0,0.2)",
  },
  {
    id: "cad",
    name: "CAD dark",
    note: "Dark screen with coloured layers, like AutoCAD.",
    paper: "#0c0e12",
    ink: "#e6e6e6",
    wallFill: "#0c0e12",
    wallLine: "#f2d24b",
    wallLineWidth: 1.6,
    openingLine: "#4dd0e1",
    dimLine: "#7ddc7d",
    text: "#f0f0f0",
    furnitureLine: "#c9a0ff",
    furnitureFill: "none",
    treeLine: "#5fbf6a",
    treeFills: [],
    floorTint: "none",
    colour: false,
    grid: "#232a36",
    site: "#ff8a65",
    shadow: "rgba(0,0,0,0)",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    note: "White lines on deep blue.",
    paper: "#173a6b",
    ink: "#e8f0ff",
    wallFill: "#173a6b",
    wallLine: "#f3f7ff",
    wallLineWidth: 2,
    openingLine: "#e8f0ff",
    dimLine: "#b9cdf0",
    text: "#f3f7ff",
    furnitureLine: "#b9cdf0",
    furnitureFill: "none",
    treeLine: "#b9cdf0",
    treeFills: [],
    floorTint: "none",
    colour: false,
    grid: "#24508c",
    site: "#b9cdf0",
    shadow: "rgba(0,0,0,0)",
  },
  {
    id: "sage",
    name: "Presentation: sage",
    note: "Soft green walls on warm paper with watercolour trees.",
    paper: "#ece7db",
    ink: "#59664f",
    wallFill: "#43573f",
    wallLine: "#43573f",
    wallLineWidth: 1,
    openingLine: "#59664f",
    dimLine: "#7b8472",
    text: "#3c4a38",
    furnitureLine: "#8a917f",
    furnitureFill: "#f7f4ec",
    treeLine: "#5d7353",
    treeFills: ["#8fa67a", "#a9b98f", "#6f8c62", "#c3cfa8"],
    floorTint: "#f5f1e8",
    colour: true,
    grid: "#d9d2c2",
    site: "#8a917f",
    shadow: "rgba(40,50,35,0.22)",
  },
  {
    id: "terracotta",
    name: "Presentation: terracotta",
    note: "Burnt-orange outlines on cream, with muted planting.",
    paper: "#f7f2e8",
    ink: "#b4571f",
    wallFill: "#f7f2e8",
    wallLine: "#b4571f",
    wallLineWidth: 3,
    openingLine: "#b4571f",
    dimLine: "#c98a5e",
    text: "#8a3f14",
    furnitureLine: "#c9a183",
    furnitureFill: "#fbf8f1",
    treeLine: "#8c9a78",
    treeFills: ["#c8d2b3", "#aebb96", "#d9dfc6", "#97a883"],
    floorTint: "#fbf7ee",
    colour: true,
    grid: "#e6dccb",
    site: "#c98a5e",
    shadow: "rgba(120,70,30,0.18)",
  },
  {
    id: "charcoal",
    name: "Presentation: charcoal",
    note: "Dark grey walls with natural material colours.",
    paper: "#f3f1ec",
    ink: "#3b3b3b",
    wallFill: "#3a3a3c",
    wallLine: "#3a3a3c",
    wallLineWidth: 1,
    openingLine: "#3b3b3b",
    dimLine: "#777777",
    text: "#222222",
    furnitureLine: "#8b8b8b",
    furnitureFill: "#ffffff",
    treeLine: "#4f6b4a",
    treeFills: ["#7fa172", "#9cb88c", "#5f8757", "#b9cda9"],
    floorTint: "#faf9f5",
    colour: true,
    grid: "#dedbd3",
    site: "#777777",
    shadow: "rgba(0,0,0,0.25)",
  },
];

export function getStyle(id: string): PlanStyle {
  return PLAN_STYLES.find((style) => style.id === id) ?? PLAN_STYLES[0];
}

// Colours for floor finishes in the coloured (presentation) styles.
export const FINISH_COLOURS: Record<string, { fill: string; line: string }> = {
  tile600: { fill: "#f0eadd", line: "#cfc5b0" },
  tile300: { fill: "#eee9e0", line: "#d2cabb" },
  wood: { fill: "#dcbd8f", line: "#b98f5c" },
  stone: { fill: "#dedad0", line: "#b9b3a5" },
  concrete: { fill: "#e3e1dc", line: "#c9c6bf" },
  marble: { fill: "#f4f2ee", line: "#cfcac2" },
  brick: { fill: "#c98566", line: "#a5644a" },
  deck: { fill: "#c9a273", line: "#9d7748" },
  gravel: { fill: "#e4dfd3", line: "#aaa392" },
  herringbone: { fill: "#d6b281", line: "#b08a57" },
  checker: { fill: "#f2efe8", line: "#9a9890" },
  terrazzo: { fill: "#ebe6dc", line: "#a89f8f" },
  carpet: { fill: "#c9c3d1", line: "#aaa2b6" },
  pavers: { fill: "#c98f73", line: "#a56a50" },
  sand: { fill: "#eadcb8", line: "#c9b78a" },
  grass: { fill: "#cfdcb6", line: "#9db384" },
  water: { fill: "#cfe4ec", line: "#8fbccd" },
};
