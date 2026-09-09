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
    /** Tiny offset that keeps inset planes from z-fighting with masonry. */
    windowInset: number;
    /** Spike topping every roof. */
    finialRadius: number;
    finialHeight: number;
    /** Overhanging timber-framed collar just under a roofline. */
    brimThickness: number;
    /** Multiplier over the parent body's radius/half-width. */
    brimOverhang: number;
    /** Portcullis bar thickness, in the gate opening. */
    barThickness: number;
    /** Portion of the gate opening occupied by the hanging grille. */
    portcullisHeightRatio: number;
    portcullisBarCount: number;
    portcullisCrossbarCount: number;
    portcullisSpikeHeight: number;
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
  keep: { width: 0.76, depth: 0.68, height: 1.34, roofHeight: 0.58 },
  wall: { length: 0.92, height: 0.57, thickness: 0.16 },
  tower: { radius: 0.27, height: 0.98, taper: 0.9, roofHeight: 0.48 },
  gate: { width: 0.58, height: 0.62, depth: 0.2 },
  banner: { width: 0.24, height: 0.3, poleHeight: 0.62 },
  merlon: { width: 0.11, height: 0.15, depth: 0.14 },
  detail: {
    windowWidth: 0.085,
    windowHeight: 0.17,
    windowInset: 0.006,
    finialRadius: 0.025,
    finialHeight: 0.14,
    brimThickness: 0.055,
    brimOverhang: 1.18,
    barThickness: 0.018,
    portcullisHeightRatio: 0.78,
    portcullisBarCount: 5,
    portcullisCrossbarCount: 2,
    portcullisSpikeHeight: 0.055,
  },
};

export const shapeKits: Record<string, ShapeKit> = {
  medieval: medievalShapeKit,
};

export function getShapeKit(id: string): ShapeKit {
  return shapeKits[id] ?? medievalShapeKit;
}
