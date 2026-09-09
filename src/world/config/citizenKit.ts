/**
 * Citizen figure proportions, in world units. Deliberately chunky, low-poly
 * primitives — legible as a silhouette at zoomed-out camera distances rather
 * than anatomically correct. A part component reads its size from here, the
 * same rule `shapeKit.ts` applies to fortress parts.
 */
export const citizenKit = {
  head: { radius: 0.15 },
  torso: {
    radius: 0.16,
    /** Cylindrical length of the capsule, excluding its hemispherical caps. */
    length: 0.32,
  },
  leg: {
    width: 0.1,
    height: 0.32,
    depth: 0.1,
    /** Half-distance between the two legs' centerlines. */
    spacing: 0.08,
  },
  waistband: {
    width: 0.36,
    height: 0.06,
    depth: 0.22,
  },
} as const;

/** Total standing height, feet to crown — used to size instanced-mesh bounding volumes. */
export const CITIZEN_HEIGHT =
  citizenKit.leg.height + citizenKit.torso.length + citizenKit.torso.radius * 2 + citizenKit.head.radius * 2;
