import * as THREE from "three";

// ---------------------------------------------------------------------------
// Material textures for the 3D view, painted in the browser (no image files
// to download). Each one is a small square picture that repeats across a
// surface, and is also used as a "bump" so light catches joints and grain.
//
// `metres` is how much real surface one copy of the picture covers.
// ---------------------------------------------------------------------------

const SIZE = 512;

// A repeatable random number generator, so a material looks the same each time.
function random(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

type Painter = (context: CanvasRenderingContext2D, next: () => number) => void;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const part = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * (1 + amount))));
  return `rgb(${part(16)},${part(8)},${part(0)})`;
}

// Fine speckle, which stops flat colours from looking like plastic.
function grain(context: CanvasRenderingContext2D, next: () => number, strength: number, count = 9000) {
  for (let i = 0; i < count; i++) {
    const light = next() > 0.5;
    context.fillStyle = `rgba(${light ? "255,255,255" : "0,0,0"},${next() * strength})`;
    context.fillRect(next() * SIZE, next() * SIZE, 1 + next() * 2, 1 + next() * 2);
  }
}

const PAINTERS: Record<string, { metres: number; rough: number; bump: number; paint: Painter }> = {
  plaster: {
    metres: 2,
    rough: 0.95,
    bump: 0.02,
    paint: (c, next) => {
      c.fillStyle = "#efe9dd";
      c.fillRect(0, 0, SIZE, SIZE);
      grain(c, next, 0.06, 14000);
    },
  },
  whitewash: {
    metres: 2,
    rough: 0.95,
    bump: 0.02,
    paint: (c, next) => {
      c.fillStyle = "#f8f6f0";
      c.fillRect(0, 0, SIZE, SIZE);
      grain(c, next, 0.05, 12000);
    },
  },
  brick: {
    metres: 1,
    rough: 0.9,
    bump: 0.06,
    paint: (c, next) => {
      c.fillStyle = "#b9b2a6"; // mortar
      c.fillRect(0, 0, SIZE, SIZE);
      const courses = 12;
      const high = SIZE / courses;
      const wide = SIZE / 4;
      for (let row = 0; row < courses; row++) {
        const shift = row % 2 === 0 ? 0 : wide / 2;
        for (let i = -1; i < 5; i++) {
          c.fillStyle = shade("#b0694a", (next() - 0.5) * 0.3);
          c.fillRect(i * wide + shift + 3, row * high + 3, wide - 6, high - 6);
        }
      }
      grain(c, next, 0.1);
    },
  },
  jali: {
    metres: 1,
    rough: 0.9,
    bump: 0.08,
    paint: (c, next) => {
      c.fillStyle = "#b0694a";
      c.fillRect(0, 0, SIZE, SIZE);
      const cell = SIZE / 8;
      c.fillStyle = "#3a2a22";
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if ((row + col) % 2 === 0) c.fillRect(col * cell + 14, row * cell + 14, cell - 28, cell - 28);
        }
      }
      grain(c, next, 0.08);
    },
  },
  concrete: {
    metres: 2.4,
    rough: 0.85,
    bump: 0.03,
    paint: (c, next) => {
      c.fillStyle = "#c9c7c1";
      c.fillRect(0, 0, SIZE, SIZE);
      // Cloudy patches, as on cast concrete.
      for (let i = 0; i < 60; i++) {
        c.fillStyle = `rgba(${next() > 0.5 ? "255,255,255" : "70,70,70"},0.05)`;
        c.beginPath();
        c.arc(next() * SIZE, next() * SIZE, 30 + next() * 90, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = "rgba(60,60,60,0.35)";
      c.lineWidth = 2;
      for (const at of [0, SIZE / 2]) {
        c.beginPath();
        c.moveTo(0, at);
        c.lineTo(SIZE, at);
        c.moveTo(at, 0);
        c.lineTo(at, SIZE);
        c.stroke();
      }
      c.fillStyle = "rgba(50,50,50,0.5)"; // formwork tie holes
      for (const x of [SIZE / 8, (SIZE * 3) / 8, (SIZE * 5) / 8, (SIZE * 7) / 8]) {
        for (const y of [SIZE / 4, (SIZE * 3) / 4]) {
          c.beginPath();
          c.arc(x, y, 5, 0, Math.PI * 2);
          c.fill();
        }
      }
      grain(c, next, 0.07);
    },
  },
  stone: {
    metres: 1.6,
    rough: 0.95,
    bump: 0.07,
    paint: (c, next) => {
      c.fillStyle = "#8f887b";
      c.fillRect(0, 0, SIZE, SIZE);
      const rows = 6;
      const high = SIZE / rows;
      for (let row = 0; row < rows; row++) {
        let x = -next() * 60;
        while (x < SIZE) {
          const wide = 70 + next() * 110;
          c.fillStyle = shade("#cfc8b8", (next() - 0.5) * 0.28);
          c.fillRect(x + 3, row * high + 3, wide - 6, high - 6);
          x += wide;
        }
      }
      grain(c, next, 0.1);
    },
  },
  timber: {
    metres: 0.9,
    rough: 0.75,
    bump: 0.04,
    paint: (c, next) => {
      const boards = 6;
      const wide = SIZE / boards;
      for (let i = 0; i < boards; i++) {
        c.fillStyle = shade("#b98958", (next() - 0.5) * 0.25);
        c.fillRect(i * wide, 0, wide, SIZE);
        c.strokeStyle = "rgba(60,35,15,0.18)";
        c.lineWidth = 1;
        for (let k = 0; k < 14; k++) {
          const x = i * wide + next() * wide;
          c.beginPath();
          c.moveTo(x, 0);
          c.bezierCurveTo(x + 6, SIZE / 3, x - 6, (SIZE * 2) / 3, x + 3, SIZE);
          c.stroke();
        }
        c.fillStyle = "rgba(40,22,8,0.55)";
        c.fillRect(i * wide, 0, 3, SIZE);
      }
    },
  },
  tile: {
    metres: 1.2,
    rough: 0.5,
    bump: 0.03,
    paint: (c, next) => {
      const cell = SIZE / 4;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          c.fillStyle = shade("#d6c4ac", (next() - 0.5) * 0.12);
          c.fillRect(col * cell, row * cell, cell, cell);
        }
      }
      c.strokeStyle = "rgba(90,75,55,0.6)";
      c.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        c.beginPath();
        c.moveTo(i * cell, 0);
        c.lineTo(i * cell, SIZE);
        c.moveTo(0, i * cell);
        c.lineTo(SIZE, i * cell);
        c.stroke();
      }
    },
  },
  metal: {
    metres: 1.6,
    rough: 0.35,
    bump: 0.05,
    paint: (c) => {
      c.fillStyle = "#8f989d";
      c.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 4; i++) {
        const x = (i * SIZE) / 4;
        c.fillStyle = "rgba(255,255,255,0.35)";
        c.fillRect(x, 0, 6, SIZE);
        c.fillStyle = "rgba(0,0,0,0.35)";
        c.fillRect(x + 6, 0, 5, SIZE);
      }
    },
  },
  glass: {
    metres: 3,
    rough: 0.1,
    bump: 0.02,
    paint: (c) => {
      c.fillStyle = "#9db9c4";
      c.fillRect(0, 0, SIZE, SIZE);
      c.strokeStyle = "#50626a";
      c.lineWidth = 8;
      c.strokeRect(0, 0, SIZE / 2, SIZE);
      c.strokeRect(SIZE / 2, 0, SIZE / 2, SIZE);
      c.strokeRect(0, 0, SIZE, SIZE / 2);
    },
  },
  roofTile: {
    metres: 1.2,
    rough: 0.8,
    bump: 0.08,
    paint: (c, next) => {
      const rows = 6;
      const high = SIZE / rows;
      const wide = SIZE / 5;
      for (let row = 0; row < rows; row++) {
        for (let i = -1; i < 6; i++) {
          const shift = row % 2 === 0 ? 0 : wide / 2;
          c.fillStyle = shade("#a85f44", (next() - 0.5) * 0.28);
          c.fillRect(i * wide + shift, row * high, wide - 3, high);
        }
        c.fillStyle = "rgba(40,18,10,0.55)"; // shadow under each course
        c.fillRect(0, row * high + high - 7, SIZE, 7);
      }
      grain(c, next, 0.08);
    },
  },
  grass: {
    metres: 4,
    rough: 1,
    bump: 0.05,
    paint: (c, next) => {
      c.fillStyle = "#66784a";
      c.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 26000; i++) {
        c.fillStyle = shade("#66784a", (next() - 0.5) * 0.55);
        c.fillRect(next() * SIZE, next() * SIZE, 2, 3 + next() * 4);
      }
    },
  },
  paving: {
    metres: 2.4,
    rough: 0.9,
    bump: 0.03,
    paint: (c, next) => {
      const cell = SIZE / 4;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          c.fillStyle = shade("#c4bfb4", (next() - 0.5) * 0.14);
          c.fillRect(col * cell + 2, row * cell + 2, cell - 4, cell - 4);
        }
      }
      grain(c, next, 0.07);
    },
  },
  woodFloor: {
    metres: 1.6,
    rough: 0.55,
    bump: 0.02,
    paint: (c, next) => {
      const rows = 8;
      const high = SIZE / rows;
      for (let row = 0; row < rows; row++) {
        let x = -next() * 200;
        while (x < SIZE) {
          const wide = 180 + next() * 160;
          c.fillStyle = shade("#b88a5a", (next() - 0.5) * 0.22);
          c.fillRect(x + 1, row * high + 1, wide - 2, high - 2);
          x += wide;
        }
      }
      grain(c, next, 0.05, 5000);
    },
  },
  door: {
    metres: 1,
    rough: 0.6,
    bump: 0.03,
    paint: (c, next) => {
      c.fillStyle = "#7c5433";
      c.fillRect(0, 0, SIZE, SIZE);
      c.strokeStyle = "rgba(40,22,8,0.3)";
      for (let k = 0; k < 60; k++) {
        const x = next() * SIZE;
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x + (next() - 0.5) * 14, SIZE);
        c.stroke();
      }
    },
  },
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** A realistic material by name. Made once, then reused. */
export function material(name: string): THREE.MeshStandardMaterial {
  const known = PAINTERS[name] ? name : "plaster";
  const ready = cache.get(known);
  if (ready) return ready;
  const recipe = PAINTERS[known];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (context) recipe.paint(context, random(known.length * 7919 + known.charCodeAt(0)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / recipe.metres, 1 / recipe.metres);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const bump = new THREE.CanvasTexture(canvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.copy(texture.repeat);
  const made = new THREE.MeshStandardMaterial({
    map: texture,
    bumpMap: bump,
    bumpScale: recipe.bump * 12,
    roughness: recipe.rough,
    metalness: known === "metal" ? 0.6 : 0,
  });
  cache.set(known, made);
  return made;
}

/**
 * Re-measures a box's surface in metres, so textures keep their true size
 * (a brick stays a brick) whatever the size of the wall.
 */
export function measureBox(geometry: THREE.BoxGeometry, length: number, height: number, thickness: number) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4); // 0,1 = ends; 2,3 = top, bottom; 4,5 = sides
    const across = face < 2 ? thickness : length;
    const up = face === 2 || face === 3 ? thickness : height;
    uv.setXY(i, uv.getX(i) * across, uv.getY(i) * up);
  }
  uv.needsUpdate = true;
}
