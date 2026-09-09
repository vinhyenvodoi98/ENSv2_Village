import { HEX_SIZE } from "../config/world.config";
import type { AxialCoord } from "./types";

/**
 * Pointy-top axial hex grid math. Pure TypeScript, no React, no three.
 *
 * Convention: axial (q, r), pointy-top orientation — each hex has a vertex
 * pointing along +z/-z (the "r" axis) and flat edges facing +x/-x. This
 * matches the default orientation of a `CylinderGeometry` with
 * `radialSegments = 6` (no extra rotation needed), so `HexTile` / `HexGrid`
 * can extrude the geometry as-is. Never mix this with offset coordinates
 * elsewhere in the codebase.
 */

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

/** Inverse of `coordKey`. Assumes a well-formed `"q,r"` key. */
export function parseCoordKey(key: string): AxialCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
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

/** Axial -> pointy-top world-space (x, z). Y is left to the caller (terrain height). */
export function hexToWorld(coord: AxialCoord, size: number = HEX_SIZE): [number, number] {
  const x = size * Math.sqrt(3) * (coord.q + coord.r / 2);
  const z = size * (3 / 2) * coord.r;
  return [x, z];
}

/** World-space (x, z) -> nearest axial coord (pointy-top). */
export function worldToHex(x: number, z: number, size: number = HEX_SIZE): AxialCoord {
  const q = (Math.sqrt(3) * x - z) / (3 * size);
  const r = (2 * z) / (3 * size);
  return roundAxial(q, r);
}

/**
 * The 6 world-space corner points of a hex, in the same pointy-top
 * orientation as `hexToWorld` (corner 0 points toward +z). `y` is a flat
 * offset applied to every corner — callers pass the tile's terrain height.
 */
export function hexCorners(
  coord: AxialCoord,
  size: number = HEX_SIZE,
  y: number = 0
): [number, number, number][] {
  const [cx, cz] = hexToWorld(coord, size);
  const corners: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    corners.push([cx + size * Math.sin(angle), y, cz + size * Math.cos(angle)]);
  }
  return corners;
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
