// ---------------------------------------------------------------------------
// The furniture library. Each item is drawn in plan (seen from above) from
// simple parts, measured in millimetres from the item's top-left corner.
//
//   ["r", x, y, width, height, cornerRadius]   a rectangle
//   ["c", centreX, centreY, radius]            a circle
//   ["e", centreX, centreY, radiusX, radiusY]  an oval
//   ["l", x1, y1, x2, y2]                      a line
//
// To add an item, copy one block and change the numbers.
// ---------------------------------------------------------------------------

export type Part =
  | ["r", number, number, number, number, number?]
  | ["c", number, number, number]
  | ["e", number, number, number, number]
  | ["l", number, number, number, number];

export type FurnitureItem = {
  id: string;
  name: string;
  group: string;
  w: number;
  d: number;
  parts: Part[];
};

const chair = (x: number, y: number): Part => ["r", x, y, 450, 450, 60];

const stairTreads: Part[] = Array.from(
  { length: 11 },
  (_, i): Part => ["l", 0, (i + 1) * 250, 1000, (i + 1) * 250],
);

export const FURNITURE: FurnitureItem[] = [
  {
    id: "bed-double",
    name: "Double bed",
    group: "Bedroom",
    w: 1800,
    d: 2000,
    parts: [
      ["r", 0, 0, 1800, 2000, 40],
      ["r", 150, 100, 650, 400, 60],
      ["r", 1000, 100, 650, 400, 60],
      ["l", 0, 650, 1800, 650],
    ],
  },
  {
    id: "bed-single",
    name: "Single bed",
    group: "Bedroom",
    w: 900,
    d: 2000,
    parts: [
      ["r", 0, 0, 900, 2000, 40],
      ["r", 150, 100, 600, 400, 60],
      ["l", 0, 650, 900, 650],
    ],
  },
  {
    id: "wardrobe",
    name: "Wardrobe",
    group: "Bedroom",
    w: 1800,
    d: 600,
    parts: [
      ["r", 0, 0, 1800, 600],
      ["l", 900, 0, 900, 600],
      ["l", 0, 0, 900, 600],
      ["l", 900, 0, 1800, 600],
    ],
  },
  {
    id: "desk",
    name: "Desk and chair",
    group: "Bedroom",
    w: 1200,
    d: 1100,
    parts: [["r", 0, 0, 1200, 600], chair(375, 650)],
  },
  {
    id: "sofa-3",
    name: "Sofa, 3 seats",
    group: "Living",
    w: 2100,
    d: 900,
    parts: [
      ["r", 0, 0, 2100, 900, 80],
      ["r", 0, 0, 2100, 200, 60],
      ["r", 0, 200, 200, 700, 60],
      ["r", 1900, 200, 200, 700, 60],
      ["l", 767, 200, 767, 900],
      ["l", 1333, 200, 1333, 900],
    ],
  },
  {
    id: "armchair",
    name: "Armchair",
    group: "Living",
    w: 850,
    d: 850,
    parts: [
      ["r", 0, 0, 850, 850, 80],
      ["r", 0, 0, 850, 200, 60],
      ["r", 0, 200, 150, 650, 50],
      ["r", 700, 200, 150, 650, 50],
    ],
  },
  {
    id: "coffee-table",
    name: "Coffee table",
    group: "Living",
    w: 1100,
    d: 600,
    parts: [["r", 0, 0, 1100, 600, 40]],
  },
  {
    id: "tv-unit",
    name: "TV unit",
    group: "Living",
    w: 1600,
    d: 400,
    parts: [
      ["r", 0, 0, 1600, 400],
      ["l", 200, 200, 1400, 200],
    ],
  },
  {
    id: "dining-6",
    name: "Dining table, 6",
    group: "Dining",
    w: 1800,
    d: 1900,
    parts: [
      ["r", 0, 500, 1800, 900, 30],
      chair(150, 0),
      chair(675, 0),
      chair(1200, 0),
      chair(150, 1450),
      chair(675, 1450),
      chair(1200, 1450),
    ],
  },
  {
    id: "round-4",
    name: "Round table, 4",
    group: "Dining",
    w: 1700,
    d: 1700,
    parts: [
      ["c", 850, 850, 500],
      ["r", 625, 0, 450, 400, 60],
      ["r", 625, 1300, 450, 400, 60],
      ["r", 0, 625, 400, 450, 60],
      ["r", 1300, 625, 400, 450, 60],
    ],
  },
  {
    id: "kitchen",
    name: "Kitchen counter",
    group: "Kitchen",
    w: 2400,
    d: 600,
    parts: [
      ["r", 0, 0, 2400, 600],
      ["r", 200, 100, 500, 400, 40],
      ["r", 1500, 100, 600, 400],
      ["c", 1650, 200, 70],
      ["c", 1950, 200, 70],
      ["c", 1650, 400, 70],
      ["c", 1950, 400, 70],
    ],
  },
  {
    id: "fridge",
    name: "Fridge",
    group: "Kitchen",
    w: 700,
    d: 700,
    parts: [
      ["r", 0, 0, 700, 700],
      ["l", 0, 620, 700, 620],
    ],
  },
  {
    id: "wc",
    name: "Toilet (WC)",
    group: "Bathroom",
    w: 400,
    d: 700,
    parts: [
      ["r", 0, 0, 400, 200, 30],
      ["e", 200, 450, 180, 250],
    ],
  },
  {
    id: "basin",
    name: "Wash basin",
    group: "Bathroom",
    w: 550,
    d: 450,
    parts: [
      ["r", 0, 0, 550, 450, 40],
      ["e", 275, 250, 190, 140],
      ["c", 275, 70, 20],
    ],
  },
  {
    id: "shower",
    name: "Shower",
    group: "Bathroom",
    w: 900,
    d: 900,
    parts: [
      ["r", 0, 0, 900, 900],
      ["l", 0, 0, 900, 900],
      ["l", 900, 0, 0, 900],
      ["c", 450, 450, 45],
    ],
  },
  {
    id: "stair",
    name: "Staircase",
    group: "Building",
    w: 1000,
    d: 3000,
    parts: [
      ["r", 0, 0, 1000, 3000],
      ...stairTreads,
      ["l", 500, 2900, 500, 150],
      ["l", 500, 150, 380, 330],
      ["l", 500, 150, 620, 330],
    ],
  },
  {
    id: "column",
    name: "Column 300 x 300",
    group: "Building",
    w: 300,
    d: 300,
    parts: [
      ["r", 0, 0, 300, 300],
      ["l", 0, 0, 300, 300],
      ["l", 300, 0, 0, 300],
    ],
  },
  {
    id: "car",
    name: "Car",
    group: "Outdoor",
    w: 1800,
    d: 4500,
    parts: [
      ["r", 0, 0, 1800, 4500, 320],
      ["r", 200, 950, 1400, 700, 120],
      ["r", 200, 3150, 1400, 600, 120],
      ["l", 200, 1650, 200, 3150],
      ["l", 1600, 1650, 1600, 3150],
    ],
  },
  {
    id: "person",
    name: "Person (for scale)",
    group: "Outdoor",
    w: 600,
    d: 400,
    parts: [
      ["e", 300, 200, 290, 150],
      ["c", 300, 200, 110],
    ],
  },
  {
    id: "pool",
    name: "Swimming pool",
    group: "Landscape",
    w: 4000,
    d: 8000,
    parts: [
      ["r", 0, 0, 4000, 8000, 300],
      ["r", 250, 250, 3500, 7500, 200],
      ["l", 600, 7200, 1400, 7200],
      ["l", 600, 6900, 1400, 6900],
    ],
  },
  {
    id: "pergola",
    name: "Pergola",
    group: "Landscape",
    w: 3600,
    d: 3000,
    parts: [
      ["r", 0, 0, 3600, 3000],
      ["l", 400, 0, 400, 3000],
      ["l", 800, 0, 800, 3000],
      ["l", 1200, 0, 1200, 3000],
      ["l", 1600, 0, 1600, 3000],
      ["l", 2000, 0, 2000, 3000],
      ["l", 2400, 0, 2400, 3000],
      ["l", 2800, 0, 2800, 3000],
      ["l", 3200, 0, 3200, 3000],
      ["r", 0, 0, 150, 150],
      ["r", 3450, 0, 150, 150],
      ["r", 0, 2850, 150, 150],
      ["r", 3450, 2850, 150, 150],
    ],
  },
  {
    id: "planter",
    name: "Planter box",
    group: "Landscape",
    w: 1800,
    d: 600,
    parts: [
      ["r", 0, 0, 1800, 600],
      ["c", 350, 300, 200],
      ["c", 900, 300, 220],
      ["c", 1450, 300, 200],
    ],
  },
  {
    id: "stepping",
    name: "Stepping stones",
    group: "Landscape",
    w: 700,
    d: 3200,
    parts: [
      ["r", 50, 0, 600, 500, 80],
      ["r", 0, 900, 600, 500, 80],
      ["r", 100, 1800, 600, 500, 80],
      ["r", 30, 2700, 600, 500, 80],
    ],
  },
  {
    id: "fountain",
    name: "Fountain",
    group: "Landscape",
    w: 2400,
    d: 2400,
    parts: [
      ["c", 1200, 1200, 1200],
      ["c", 1200, 1200, 950],
      ["c", 1200, 1200, 250],
    ],
  },
  {
    id: "rock",
    name: "Rock cluster",
    group: "Landscape",
    w: 1500,
    d: 1100,
    parts: [
      ["e", 500, 600, 480, 380],
      ["e", 1100, 450, 380, 300],
      ["e", 950, 850, 260, 200],
    ],
  },
  {
    id: "parking",
    name: "Parking bay",
    group: "Landscape",
    w: 2500,
    d: 5000,
    parts: [
      ["l", 0, 0, 0, 5000],
      ["l", 2500, 0, 2500, 5000],
      ["l", 0, 0, 2500, 0],
    ],
  },
  {
    id: "firepit",
    name: "Fire pit with seating",
    group: "Landscape",
    w: 3200,
    d: 3200,
    parts: [
      ["c", 1600, 1600, 450],
      ["c", 1600, 1600, 300],
      ["r", 1100, 0, 1000, 500, 80],
      ["r", 1100, 2700, 1000, 500, 80],
      ["r", 0, 1100, 500, 1000, 80],
      ["r", 2700, 1100, 500, 1000, 80],
    ],
  },
  {
    id: "bench",
    name: "Garden bench",
    group: "Outdoor",
    w: 1500,
    d: 500,
    parts: [
      ["r", 0, 0, 1500, 500, 30],
      ["l", 0, 120, 1500, 120],
    ],
  },
];

export function getFurniture(id: string): FurnitureItem {
  return FURNITURE.find((item) => item.id === id) ?? FURNITURE[0];
}
