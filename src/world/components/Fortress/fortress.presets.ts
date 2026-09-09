import { medievalShapeKit } from "@/world/config/shapeKit";

export type FortressPart = "keep" | "wall" | "tower" | "gate" | "banner" | "merlon";

export interface FortressPartPlacement {
  part: FortressPart;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface FortressTierPreset {
  tier: number;
  parts: FortressPartPlacement[];
}

const IDENTITY_SCALE: [number, number, number] = [1, 1, 1];

/** Places `count` parts evenly around a ring of `radius` at height `y`, facing outward. */
function ring(part: FortressPart, radius: number, count: number, startAngle = 0, y = 0): FortressPartPlacement[] {
  const placements: FortressPartPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (Math.PI * 2 * i) / count;
    const x = radius * Math.sin(angle);
    const z = radius * Math.cos(angle);
    placements.push({ part, position: [x, y, z], rotation: [0, angle, 0], scale: IDENTITY_SCALE });
  }
  return placements;
}

const KEEP: FortressPartPlacement = {
  part: "keep",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: IDENTITY_SCALE,
};

/** A small flag atop the keep's roof — the fortress's tallest, most visible detail. */
const KEEP_FLAG: FortressPartPlacement = {
  part: "banner",
  position: [0, medievalShapeKit.keep.height + medievalShapeKit.keep.roofHeight, 0],
  rotation: [0, 0, 0],
  scale: [0.62, 0.62, 0.62],
};

// These are wall apothems, not arbitrary ring radii. With six segments the
// inner wall length closely matches `shapeKit.wall.length`, producing a
// closed curtain wall instead of six disconnected radial slabs.
const INNER_WALL_RADIUS = 0.8;
const INNER_CORNER_RADIUS = INNER_WALL_RADIUS / Math.cos(Math.PI / 6);
const OUTER_WALL_RADIUS = 1.18;

const INNER_WALLS = ring("wall", INNER_WALL_RADIUS, 6).filter((_, index) => index !== 0);
const INNER_MERLONS = ring("merlon", INNER_WALL_RADIUS, 18, 0, medievalShapeKit.wall.height);
const ALL_INNER_TOWERS = ring("tower", INNER_CORNER_RADIUS, 6, Math.PI / 6);
const STARTER_TOWERS = ALL_INNER_TOWERS.filter((_, index) => index % 2 === 0);

const GATE: FortressPartPlacement = {
  part: "gate",
  position: [0, 0, INNER_WALL_RADIUS],
  rotation: [0, 0, 0],
  scale: IDENTITY_SCALE,
};

const TIER_1_PARTS: FortressPartPlacement[] = [
  KEEP,
  KEEP_FLAG,
  ...INNER_WALLS,
  ...INNER_MERLONS,
  ...STARTER_TOWERS,
  GATE,
];

const TOWER_BANNERS = ALL_INNER_TOWERS.filter((_, index) => index % 2 === 0).map((tower) => ({
  part: "banner" as const,
  position: [
    tower.position[0],
    medievalShapeKit.tower.height + medievalShapeKit.tower.roofHeight,
    tower.position[2],
  ] as [number, number, number],
  rotation: tower.rotation,
  scale: [0.42, 0.42, 0.42] as [number, number, number],
}));

const TIER_2_PARTS: FortressPartPlacement[] = [
  KEEP,
  KEEP_FLAG,
  ...INNER_WALLS,
  ...INNER_MERLONS,
  ...ALL_INNER_TOWERS,
  GATE,
  ...TOWER_BANNERS,
];

const OUTER_WALL_SCALE = (2 * OUTER_WALL_RADIUS * Math.tan(Math.PI / 12)) / medievalShapeKit.wall.length;
const OUTER_WALL = ring("wall", OUTER_WALL_RADIUS, 12)
  .filter((_, index) => index !== 0)
  .map((placement) => ({ ...placement, scale: [OUTER_WALL_SCALE, 1, 1] as [number, number, number] }));
const OUTER_WALL_MERLONS = ring("merlon", OUTER_WALL_RADIUS, 24, 0, medievalShapeKit.wall.height);
const OUTER_GATE: FortressPartPlacement = {
  ...GATE,
  position: [0, 0, OUTER_WALL_RADIUS],
  scale: [0.92, 0.92, 0.92],
};

const TIER_3_PARTS: FortressPartPlacement[] = [
  ...TIER_2_PARTS,
  ...OUTER_WALL,
  ...OUTER_WALL_MERLONS,
  OUTER_GATE,
];

/**
 * A fortress kit's silhouette per tier, described as data. Adding a tier or
 * restyling one is editing this table — never `Fortress.tsx` or the part
 * components.
 */
export const fortressPresets: Record<string, FortressTierPreset[]> = {
  medieval: [
    { tier: 1, parts: TIER_1_PARTS },
    { tier: 2, parts: TIER_2_PARTS },
    { tier: 3, parts: TIER_3_PARTS },
  ],
};

export function getFortressParts(kitId: string, tier: number): FortressPartPlacement[] {
  const kit = fortressPresets[kitId] ?? fortressPresets.medieval;
  const tierPreset = kit.find((t) => t.tier === tier) ?? kit[kit.length - 1];
  return tierPreset?.parts ?? [];
}
