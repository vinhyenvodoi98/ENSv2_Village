/**
 * Fortress part proportions, separated from the components that render them.
 * A part component reads its dimensions from here — it never hardcodes a
 * size. Swapping `medievalShapeKit` for a new kit (different wall thickness,
 * tower taper, roof pitch...) restyles every fortress without touching
 * `Fortress.tsx` or any part component.
 */
export interface ShapeKit {
  id: string;
  keep: {
    width: number;
    depth: number;
    height: number;
    roofHeight: number;
  };
  wall: {
    length: number;
    height: number;
    thickness: number;
  };
  tower: {
    /** Base radius; the top radius is `radius * taper`. */
    radius: number;
    height: number;
    /** 0-1, how much the tower narrows toward the top. 1 = cylinder. */
    taper: number;
    roofHeight: number;
  };
  gate: {
    width: number;
    height: number;
    depth: number;
  };
  banner: {
    width: number;
    height: number;
    poleHeight: number;
  };
  /** Crenellation block lining wall and tower tops. */
  merlon: {
    width: number;
    height: number;
    depth: number;
  };
  /** Shared proportions for the window/finial/brim dressing on keep + tower. */
  detail: {
    windowWidth: number;
    windowHeight: number;
    /** Spike topping every roof. */
    finialRadius: number;
    finialHeight: number;
    /** Overhanging timber-framed collar just under a roofline. */
    brimThickness: number;
    /** Multiplier over the parent body's radius/half-width. */
    brimOverhang: number;
    /** Portcullis bar thickness, in the gate opening. */
    barThickness: number;
  };
}

/**
 * Sized to sit well inside a single hex's apothem (HEX_SIZE * cos(30°))
 * with margin for the tier-3 outer wall and its jitter scale — see
 * `fortress.presets.ts` for the ring radii this feeds.
 */
export const medievalShapeKit: ShapeKit = {
  id: "medieval",
  // Taller than the tier-2 footprint alone would suggest — height never
  // pushes the fortress's radial footprint outside the hex, so the
  // silhouette can go as vertical as the reference castle without
  // threatening `fortress.presets.ts`'s apothem margin.
  keep: { width: 0.9, depth: 0.9, height: 1.3, roofHeight: 0.9 },
  wall: { length: 0.85, height: 0.5, thickness: 0.14 },
  tower: { radius: 0.26, height: 1.1, taper: 0.68, roofHeight: 0.7 },
  gate: { width: 0.65, height: 0.6, depth: 0.18 },
  banner: { width: 0.22, height: 0.32, poleHeight: 0.7 },
  merlon: { width: 0.13, height: 0.14, depth: 0.13 },
  detail: {
    windowWidth: 0.1,
    windowHeight: 0.18,
    finialRadius: 0.03,
    finialHeight: 0.16,
    brimThickness: 0.035,
    brimOverhang: 1.4,
    barThickness: 0.02,
  },
};

export const shapeKits: Record<string, ShapeKit> = {
  medieval: medievalShapeKit,
};

export function getShapeKit(id: string): ShapeKit {
  return shapeKits[id] ?? medievalShapeKit;
}
