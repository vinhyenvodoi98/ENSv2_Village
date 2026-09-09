import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from "three";
import { coordKey, hexToWorld } from "@/world/core/hex";
import { HEX_HEIGHT, ROADS } from "@/world/config/world.config";
import type { AxialCoord, Tile } from "@/world/core/types";

function pointAt(coord: AxialCoord, tiles: Map<string, Tile>): Vector3 {
  const [x, z] = hexToWorld(coord);
  const height = tiles.get(coordKey(coord))?.height ?? 0;
  return new Vector3(x, HEX_HEIGHT + height + ROADS.surfaceOffset, z);
}

/**
 * A flat ribbon strip following a Catmull-Rom curve through the path's hex
 * centers, sampled onto the *current* terrain height (never baked in) and
 * lifted just above the tile tops so it never z-fights with them, from any
 * camera angle.
 */
export function buildRoadRibbonGeometry(path: AxialCoord[], tiles: Map<string, Tile>): BufferGeometry {
  const geometry = new BufferGeometry();
  if (path.length < 2) return geometry;

  const points = path.map((coord) => pointAt(coord, tiles));
  const curve = new CatmullRomCurve3(points, false, "catmullrom", 0.5);
  const sampleCount = Math.max(2, (path.length - 1) * ROADS.samplesPerSegment);
  const samples = curve.getSpacedPoints(sampleCount);
  const halfWidth = ROADS.width / 2;

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  samples.forEach((point, i) => {
    const tangent = curve.getTangentAt(i / sampleCount);
    const side = new Vector3(-tangent.z, 0, tangent.x).normalize();
    const left = point.clone().addScaledVector(side, halfWidth);
    const right = point.clone().addScaledVector(side, -halfWidth);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);

    if (i > 0) {
      const a = (i - 1) * 2;
      const b = a + 1;
      const c = i * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  });

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}
