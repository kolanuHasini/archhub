// ---------------------------------------------------------------------------
// What a floor plan is made of. Every measurement is in millimetres, the unit
// architects draw in. x goes right, y goes down the screen.
// ---------------------------------------------------------------------------

export type Pt = [number, number];

export type Wall = {
  id: string;
  kind: "wall";
  a: Pt; // start of the wall's centre line
  b: Pt; // end of the wall's centre line
  m?: Pt; // curved walls only: a point the centre line bends through
  t: number; // thickness
  h: number; // height (used later for elevations, sections and 3D)
};

export type Opening = {
  id: string;
  kind: "door" | "window";
  wallId: string;
  pos: number; // distance from the wall's start to the middle of the opening
  width: number;
  style: string;
  flipSide: boolean; // which side of the wall the door swings to
  flipHinge: boolean; // which end the hinge is on
  sill: number; // height of the bottom above the floor
  height: number;
};

export type Dim = {
  id: string;
  kind: "dim";
  a: Pt;
  b: Pt;
  offset: number; // how far the dimension line sits from the measured points
};

export type Room = {
  id: string;
  kind: "room";
  pts: Pt[];
  name: string;
  finish: string; // floor finish
};

export type Tree = {
  id: string;
  kind: "tree";
  p: Pt;
  r: number; // canopy radius
  style: string;
};

export type Furn = {
  id: string;
  kind: "furn";
  p: Pt; // centre
  rot: number; // degrees
  item: string;
};

export type Label = {
  id: string;
  kind: "text";
  p: Pt;
  text: string;
  size: number; // 1 = normal lettering size
  level?: boolean; // true = a level mark (a height above or below ground)
};

export type Line = {
  id: string;
  kind: "line";
  a: Pt;
  b: Pt;
};

export type Circle = {
  id: string;
  kind: "circle";
  c: Pt; // centre
  r: number;
};

// An arc that starts at a, ends at b and passes through m.
export type Arc = {
  id: string;
  kind: "arc";
  a: Pt;
  b: Pt;
  m: Pt;
};

// A picture placed under the drawing to trace over: a site map, a survey,
// a scanned plan or a photo of a paper sketch.
export type Underlay = {
  id: string;
  kind: "image";
  p: Pt; // top-left corner
  w: number; // real width the picture covers
  h: number;
  href: string;
  opacity: number; // 0 to 1
};

export type Entity =
  | Wall
  | Opening
  | Dim
  | Room
  | Tree
  | Furn
  | Label
  | Line
  | Circle
  | Arc
  | Underlay;

// The plot of land. Its top-left corner is at 0,0 and the road is along the
// bottom edge. `north` is the direction of north on screen, in degrees
// clockwise from straight up.
export type Site = { w: number; d: number; north: number };

export type Unit = "mm" | "m" | "ft";

export type Settings = {
  style: string; // render style id
  wallColor: string; // "" = use the style's own wall colour
  shadows: boolean;
  textures: boolean;
  grid: boolean;
  autoDims: boolean; // show the length of every wall
  snap: boolean;
  ortho: boolean; // lock drawing to 45 degree steps
  scale: number; // 100 means 1:100; sets the size of lettering
  unit: Unit;
  wallT: number; // thickness for new walls
  wallH: number; // height for new walls
  hidden: string[]; // layers switched off
};

export type PlanDoc = {
  entities: Entity[];
  site: Site | null;
  settings: Settings;
};

export const DEFAULT_SETTINGS: Settings = {
  style: "technical",
  wallColor: "",
  shadows: false,
  textures: true,
  grid: true,
  autoDims: false,
  snap: true,
  ortho: true,
  scale: 100,
  unit: "mm",
  wallT: 230,
  wallH: 3000,
  hidden: [],
};

export const EMPTY_PLAN: PlanDoc = {
  entities: [],
  site: null,
  settings: DEFAULT_SETTINGS,
};

export const LAYERS: { id: string; name: string }[] = [
  { id: "underlay", name: "Traced pictures" },
  { id: "site", name: "Site boundary" },
  { id: "rooms", name: "Rooms and floors" },
  { id: "walls", name: "Walls" },
  { id: "openings", name: "Doors and windows" },
  { id: "furniture", name: "Furniture" },
  { id: "landscape", name: "Landscape" },
  { id: "lines", name: "Drafting lines" },
  { id: "dims", name: "Dimensions" },
  { id: "text", name: "Text" },
  { id: "marks", name: "North arrow and scale bar" },
];

export function layerOf(entity: Entity): string {
  switch (entity.kind) {
    case "wall":
      return "walls";
    case "door":
    case "window":
      return "openings";
    case "dim":
      return "dims";
    case "room":
      return "rooms";
    case "tree":
      return "landscape";
    case "furn":
      return "furniture";
    case "text":
      return "text";
    case "line":
    case "circle":
    case "arc":
      return "lines";
    case "image":
      return "underlay";
  }
}

export const DOOR_STYLES = [
  { id: "single", name: "Single swing", width: 900 },
  { id: "double", name: "Double swing", width: 1500 },
  { id: "sliding", name: "Sliding", width: 1800 },
  { id: "pocket", name: "Pocket (slides into wall)", width: 900 },
  { id: "bifold", name: "Bifold", width: 1800 },
  { id: "garage", name: "Garage / shutter", width: 2700 },
  { id: "opening", name: "Open archway", width: 1200 },
];

export const WINDOW_STYLES = [
  { id: "casement", name: "Casement", width: 1200 },
  { id: "sliding", name: "Sliding", width: 1500 },
  { id: "fixed", name: "Fixed glass", width: 1800 },
  { id: "ventilator", name: "Ventilator", width: 600 },
  { id: "bay", name: "Bay window", width: 2100 },
  { id: "louvre", name: "Louvre", width: 900 },
  { id: "french", name: "French window", width: 1500 },
];

export const TREE_STYLES = [
  { id: "canopy", name: "Canopy" },
  { id: "branch", name: "Branches" },
  { id: "palm", name: "Palm" },
  { id: "shrub", name: "Shrub" },
  { id: "conifer", name: "Conifer" },
];

export const FLOOR_FINISHES = [
  { id: "none", name: "None" },
  { id: "tile600", name: "Tiles 600 x 600" },
  { id: "tile300", name: "Tiles 300 x 300" },
  { id: "wood", name: "Wood planks" },
  { id: "stone", name: "Stone paving" },
  { id: "marble", name: "Marble" },
  { id: "concrete", name: "Concrete" },
  { id: "brick", name: "Brick paving" },
  { id: "deck", name: "Timber deck" },
  { id: "gravel", name: "Gravel" },
  { id: "grass", name: "Grass" },
  { id: "water", name: "Water" },
];

export const WALL_THICKNESSES = [115, 150, 230, 300];
export const SCALES = [50, 100, 200, 500];

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
