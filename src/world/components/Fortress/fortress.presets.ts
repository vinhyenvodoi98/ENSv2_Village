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
  scale: [0.55, 0.55, 0.55],
};

// Ring radii are kept well inside a hex's apothem (HEX_SIZE * cos(30°) ≈
// 1.73 at the default HEX_SIZE) so the whole silhouette — including tier-3's
// outer wall and jitter scale — sits snugly on its own tile.
const INNER_RADIUS = 1.05;
const OUTER_RADIUS = 1.35;

const PALISADE = ring("wall", INNER_RADIUS, 6);
const PALISADE_MERLONS = ring("merlon", INNER_RADIUS, 12, Math.PI / 6, medievalShapeKit.wall.height);

const TIER_1_PARTS: FortressPartPlacement[] = [KEEP, KEEP_FLAG, ...PALISADE, ...PALISADE_MERLONS];

const CORNER_TOWERS = ring("tower", INNER_RADIUS, 6, Math.PI / 6).filter((_, i) => i % 2 === 0);
const TOWER_MERLONS = CORNER_TOWERS.flatMap((tower) =>
  [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((offset) => ({
    part: "merlon" as const,
    position: [
      tower.position[0] + medievalShapeKit.tower.radius * 0.7 * Math.sin(tower.rotation[1] + offset),
      medievalShapeKit.tower.height,
      tower.position[2] + medievalShapeKit.tower.radius * 0.7 * Math.cos(tower.rotation[1] + offset),
    ] as [number, number, number],
    rotation: [0, tower.rotation[1] + offset, 0] as [number, number, number],
    scale: IDENTITY_SCALE,
  }))
);
const GATE: FortressPartPlacement = {
  part: "gate",
  position: [0, 0, INNER_RADIUS],
  rotation: [0, 0, 0],
  scale: IDENTITY_SCALE,
};

const TIER_2_PARTS: FortressPartPlacement[] = [
  ...TIER_1_PARTS,
  ...CORNER_TOWERS,
  ...TOWER_MERLONS,
  GATE,
];

const OUTER_WALL = ring("wall", OUTER_RADIUS, 10);
const OUTER_WALL_MERLONS = ring("merlon", OUTER_RADIUS, 20, Math.PI / 10, medievalShapeKit.wall.height);
const BANNERS = ring("banner", 0.85, 4, Math.PI / 4);

const TIER_3_PARTS: FortressPartPlacement[] = [
  ...TIER_2_PARTS,
  ...OUTER_WALL,
  ...OUTER_WALL_MERLONS,
  ...BANNERS,
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
