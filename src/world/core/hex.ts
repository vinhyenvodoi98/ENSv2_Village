import { HEX_SIZE } from "../config/world.config";
import type { AxialCoord } from "./types";

/** Flat-top axial hex grid math. Pure TypeScript, no React, no three. */

const AXIAL_DIRECTIONS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function coordKey(coord: AxialCoord): string {
  return `${coord.q},${coord.r}`;
}

export function coordsEqual(a: AxialCoord, b: AxialCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function neighbors(coord: AxialCoord): AxialCoord[] {
  return AXIAL_DIRECTIONS.map((dir) => ({ q: coord.q + dir.q, r: coord.r + dir.r }));
}

export function distance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All coords at exactly `radius` steps from center. Radius 0 returns [center]. */
export function ring(center: AxialCoord, radius: number): AxialCoord[] {
  if (radius === 0) return [center];

  const results: AxialCoord[] = [];
  let cube = {
    q: center.q + AXIAL_DIRECTIONS[4].q * radius,
    r: center.r + AXIAL_DIRECTIONS[4].r * radius,
  };

  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push({ ...cube });
      const dir = AXIAL_DIRECTIONS[side];
      cube = { q: cube.q + dir.q, r: cube.r + dir.r };
    }
  }

  return results;
}

/** All coords within `radius` steps of center, including center. */
export function spiral(center: AxialCoord, radius: number): AxialCoord[] {
  const results: AxialCoord[] = [];
  for (let r = 0; r <= radius; r++) {
    results.push(...ring(center, r));
  }
  return results;
}

/** Axial -> flat-top world-space (x, z). Y is left to the caller (terrain height). */
export function toWorld(coord: AxialCoord, size: number = HEX_SIZE): [number, number] {
  const x = size * ((3 / 2) * coord.q);
  const z = size * ((Math.sqrt(3) / 2) * coord.q + Math.sqrt(3) * coord.r);
  return [x, z];
}

/** World-space (x, z) -> nearest axial coord (flat-top). */
export function fromWorld(x: number, z: number, size: number = HEX_SIZE): AxialCoord {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * z) / size;
  return roundAxial(q, r);
}

function roundAxial(q: number, r: number): AxialCoord {
  const x = q;
  const z = r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}
