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
  font?: string; // "sans", "serif", "mono" or "hand"
  bold?: boolean;
  italic?: boolean;
  color?: string; // "" or missing = the render style's text colour
  rot?: number; // degrees, clockwise
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

// A structural or built element with a height: a column, beam, staircase,
// slab (balcony, canopy or sunshade) or railing.
//   column  - stands at point a; w and d are its two plan sizes
//   slab    - a rectangle with a and b as opposite corners
//   others  - run from a to b, and are w wide
// `base` is how far above the floor it starts; `h` is how tall it is.
export type Elem = {
  id: string;
  kind: "elem";
  type: string;
  a: Pt;
  b: Pt;
  w: number;
  d: number;
  base: number;
  h: number;
  turn?: string; // stairs only: "u" = two flights with a landing between
};

export const ELEM_TYPES = [
  { id: "column", name: "Column" },
  { id: "beam", name: "Beam" },
  { id: "stair", name: "Staircase" },
  { id: "slab", name: "Slab (balcony, canopy, sunshade)" },
  { id: "railing", name: "Railing" },
];

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

// Every object also remembers which floor it is on and, optionally, a layer
// it has been moved to (otherwise it sits on the usual layer for its kind).
export type Entity = (
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
  | Elem
  | Underlay
) & { floor?: string; layer?: string };

// One storey of the building. Levels and heights are in millimetres; a
// basement simply has a level below zero.
export type Floor = {
  id: string;
  name: string;
  level: number; // height of this floor above the ground floor
  height: number; // floor-to-floor height
};

export const GROUND_FLOOR: Floor = {
  id: "g",
  name: "Ground floor",
  level: 0,
  height: 3000,
};

// How one layer is drawn. Anything left out follows the render style.
export type LayerLook = {
  weight?: number; // line weight in millimetres, as on a printed drawing
  color?: string;
  locked?: boolean; // locked layers cannot be selected or moved
};

// Standard technical-pen line weights, in millimetres.
export const LINE_WEIGHTS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0];

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
  layerLooks: Record<string, LayerLook>; // line weight, colour and lock per layer
  customLayers: { id: string; name: string }[]; // layers you have added
  ghost: boolean; // show the floor below faintly, for lining walls up
  roof: Roof; // shown in elevations
  facade: string; // facade material shown in elevations
  structure: Structure; // sizes used when drawing sections
};

// The parts of the building below the floor, as drawn in sections.
export type Structure = {
  plinth: number; // height of the ground floor above the natural ground
  slab: number; // thickness of each floor slab
  footingDepth: number; // how far below ground the footing sits
  footingWidth: number; // width of the footing under each wall
};

export const DEFAULT_STRUCTURE: Structure = {
  plinth: 450,
  slab: 150,
  footingDepth: 1200,
  footingWidth: 900,
};

export type Roof = {
  type: string; // "flat", "gable", "hip" or "shed"
  pitch: number; // slope in degrees
  overhang: number; // how far the eaves stick out
  parapet: number; // height of the wall around a flat roof
  turned: boolean; // true = the ridge runs the short way
};

export const ROOF_TYPES = [
  { id: "flat", name: "Flat with parapet" },
  { id: "gable", name: "Gable (two slopes)" },
  { id: "hip", name: "Hip (four slopes)" },
  { id: "shed", name: "Shed (one slope)" },
  { id: "none", name: "No roof shown" },
];

export const FACADE_MATERIALS = [
  { id: "plaster", name: "Smooth plaster" },
  { id: "brick", name: "Exposed brick" },
  { id: "concrete", name: "Board-marked concrete" },
  { id: "stone", name: "Stone" },
  { id: "timber", name: "Timber cladding" },
  { id: "whitewash", name: "White lime wash" },
  { id: "tile", name: "Tile cladding" },
  { id: "metal", name: "Standing-seam metal" },
  { id: "glass", name: "Glass curtain wall" },
  { id: "jali", name: "Perforated brick (jali)" },
];

export const TEXT_FONTS = [
  { id: "sans", name: "Sans (clean)", css: "Arial, Helvetica, sans-serif" },
  { id: "serif", name: "Serif (classic)", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", name: "Mono (technical)", css: "'Courier New', Consolas, monospace" },
  { id: "hand", name: "Hand lettering", css: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" },
  { id: "narrow", name: "Narrow (titles)", css: "'Arial Narrow', 'Roboto Condensed', Impact, sans-serif" },
];

export const fontCss = (id: string | undefined) =>
  (TEXT_FONTS.find((font) => font.id === id) ?? TEXT_FONTS[0]).css;

export const DEFAULT_ROOF: Roof = {
  type: "flat",
  pitch: 25,
  overhang: 450,
  parapet: 600,
  turned: false,
};

export type PlanDoc = {
  floors?: Floor[];
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
  layerLooks: {},
  customLayers: [],
  ghost: true,
  roof: { type: "flat", pitch: 25, overhang: 450, parapet: 600, turned: false },
  facade: "plaster",
  structure: { plinth: 450, slab: 150, footingDepth: 1200, footingWidth: 900 },
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
  { id: "structure", name: "Structure, stairs and railings" },
  { id: "openings", name: "Doors and windows" },
  { id: "furniture", name: "Furniture" },
  { id: "landscape", name: "Landscape" },
  { id: "lines", name: "Drafting lines" },
  { id: "dims", name: "Dimensions" },
  { id: "text", name: "Text" },
  { id: "marks", name: "North arrow and scale bar" },
];

export function layerOf(entity: Entity): string {
  if (entity.layer) return entity.layer;
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
    case "elem":
      return "structure";
  }
}

export const DOOR_STYLES = [
  { id: "single", name: "Single swing", width: 900 },
  { id: "double", name: "Double swing", width: 1500 },
  { id: "sliding", name: "Sliding", width: 1800 },
  { id: "pocket", name: "Pocket (slides into wall)", width: 900 },
  { id: "bifold", name: "Bifold", width: 1800 },
  { id: "garage", name: "Garage / shutter", width: 2700 },
  { id: "pivot", name: "Pivot", width: 1200 },
  { id: "double-acting", name: "Double-acting (swings both ways)", width: 900 },
  { id: "revolving", name: "Revolving", width: 2000 },
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
  { id: "awning", name: "Awning (top-hung)", width: 900 },
  { id: "arched", name: "Arched", width: 1000 },
  { id: "clerestory", name: "Clerestory strip", width: 2400 },
];

export const TREE_STYLES = [
  { id: "canopy", name: "Canopy" },
  { id: "branch", name: "Branches" },
  { id: "palm", name: "Palm" },
  { id: "shrub", name: "Shrub" },
  { id: "conifer", name: "Conifer" },
  { id: "flower", name: "Flowering tree" },
  { id: "bamboo", name: "Bamboo clump" },
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
  { id: "herringbone", name: "Herringbone wood" },
  { id: "checker", name: "Checker tiles" },
  { id: "terrazzo", name: "Terrazzo" },
  { id: "carpet", name: "Carpet" },
  { id: "pavers", name: "Brick pavers" },
  { id: "sand", name: "Sand" },
  { id: "grass", name: "Grass" },
  { id: "water", name: "Water" },
];

export const WALL_THICKNESSES = [115, 150, 230, 300];
export const SCALES = [50, 100, 200, 500, 1000];

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
