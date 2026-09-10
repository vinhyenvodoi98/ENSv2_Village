/**
 * Citizen figure proportions, in world units. Deliberately chunky, low-poly
 * primitives — legible as a silhouette at zoomed-out camera distances rather
 * than anatomically correct. A part component reads its size from here, the
 * same rule `shapeKit.ts` applies to fortress parts.
 */
export const citizenKit = {
  head: { radius: 0.06 },
  torso: {
    radius: 0.06,
    /** Cylindrical length of the capsule, excluding its hemispherical caps. */
    length: 0.11,
  },
  leg: {
    width: 0.04,
    height: 0.16,
    depth: 0.045,
    /** Half-distance between the two legs' centerlines. */
    spacing: 0.033,
  },
  arm: {
    width: 0.034,
    height: 0.15,
    depth: 0.038,
    /** Horizontal distance from the centerline to each shoulder joint. */
    spacing: 0.074,
  },
  waistband: {
    radius: 0.068,
    height: 0.026,
  },
  mantle: {
    topRadius: 0.072,
    bottomRadius: 0.082,
    height: 0.04,
  },
  headwear: {
    radius: 0.073,
    height: 0.055,
  },
} as const;

/** Total standing height, feet to crown — used to size instanced-mesh bounding volumes. */
export const CITIZEN_HEIGHT =
  citizenKit.leg.height +
  citizenKit.torso.length +
  citizenKit.torso.radius * 2 +
  citizenKit.head.radius * 2 +
  citizenKit.headwear.height;
