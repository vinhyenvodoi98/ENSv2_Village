import { CatmullRomCurve3, Vector3 } from "three";
import { coordKey, hexToWorld } from "@/world/core/hex";
import { HEX_HEIGHT, ROADS, CITIZENS } from "@/world/config/world.config";
import type { AxialCoord, Tile } from "@/world/core/types";

/** Same curve family `roadGeometry.ts` builds its ribbon from, lifted a hair above the road surface so feet never z-fight it. */
export function buildCitizenPathCurve(path: AxialCoord[], tiles: Map<string, Tile>): CatmullRomCurve3 | null {
  if (path.length < 2) return null;

  const points = path.map((coord) => {
    const [x, z] = hexToWorld(coord);
    const height = tiles.get(coordKey(coord))?.height ?? 0;
    return new Vector3(x, HEX_HEIGHT + height + ROADS.surfaceOffset + CITIZENS.groundClearance, z);
  });

  // Roads connect fortress centers. Trim both ends toward the first/last
  // road segment so citizens visually enter and leave at the curtain wall.
  if (points.length >= 2) {
    const startDirection = points[1].clone().sub(points[0]).normalize();
    const endDirection = points[points.length - 2].clone().sub(points[points.length - 1]).normalize();
    points[0].addScaledVector(startDirection, CITIZENS.fortressClearance);
    points[points.length - 1].addScaledVector(endDirection, CITIZENS.fortressClearance);
  }

  return new CatmullRomCurve3(points, false, "catmullrom", 0.5);
}

const UP = new Vector3(0, 1, 0);
const scratchTangent = new Vector3();
const scratchSide = new Vector3();

/**
 * World position + heading for a citizen at parameter `t` along its path
 * curve, offset sideways from the centerline so a crowd doesn't all walk the
 * exact same line. `out` is written in place to avoid per-frame allocation.
 */
export function sampleCitizenPose(
  curve: CatmullRomCurve3,
  t: number,
  lateralOffset: number,
  out: { position: Vector3; headingRad: number }
): void {
  const clamped = Math.min(1, Math.max(0, t));
  curve.getPointAt(clamped, out.position);
  curve.getTangentAt(clamped, scratchTangent);

  scratchSide.crossVectors(scratchTangent, UP).normalize();
  const fadeIn = Math.min(1, clamped / CITIZENS.laneFadeRatio);
  const fadeOut = Math.min(1, (1 - clamped) / CITIZENS.laneFadeRatio);
  const laneBlend = fadeIn * fadeIn * (3 - 2 * fadeIn) * fadeOut * fadeOut * (3 - 2 * fadeOut);
  out.position.addScaledVector(scratchSide, lateralOffset * laneBlend);
  out.headingRad = Math.atan2(scratchTangent.x, scratchTangent.z);
}
