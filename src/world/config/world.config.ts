/**
 * Tuning constants for the world. No component may write a literal size,
 * distance, or rate outside this file — import it instead.
 */

/** Flat-top hex circumradius, in world units. */
export const HEX_SIZE = 2;

/** Extruded height of a single hex tile. */
export const HEX_HEIGHT = 0.35;

/** Max hex ring radius rendered by default (0 = just the center tile). */
export const WORLD_RADIUS = 6;

/** Hexes of empty space required between a fortress and the next one built off it. */
export const FORTRESS_BUILD_DISTANCE = 2;

export const TERRAIN = {
  /** Simplex noise sample frequency; lower = broader hills. */
  noiseFrequency: 0.08,
  /** Peak-to-trough height added on top of HEX_HEIGHT. */
  amplitude: 1.4,
  /** Number of octaves layered for the height field. */
  octaves: 3,
  /** Falloff applied to each successive octave's amplitude. */
  persistence: 0.5,
} as const;

export const CAMERA = {
  /** Initial camera position, looking at the origin. */
  position: [18, 16, 18] as [number, number, number],
  fov: 45,
  near: 0.1,
  far: 500,
  minDistance: 8,
  maxDistance: 48,
  /** Radians. 0 = looking straight down, PI/2 = horizontal. */
  minPolarAngle: Math.PI / 6,
  maxPolarAngle: Math.PI / 2.4,
} as const;

export const RENDER = {
  dpr: [1, 2] as [number, number],
  shadowMapSize: 2048,
} as const;

export const LIGHTING = {
  directionalPosition: [20, 30, 10] as [number, number, number],
  shadowCameraBounds: 25,
  shadowCameraNear: 1,
  shadowCameraFar: 80,
} as const;

/** Ticks per second for world systems (citizens, carts, weather). Movement is simulated on this fixed schedule and interpolated for render, so frame rate never changes walking speed. */
export const TICK_RATE = 10;

export const POPULATION = {
  maxCitizensPerFortress: 8,
  maxCartsPerRoad: 3,
} as const;

/** Hard cap on simultaneously-alive citizens, across every fortress. */
export const POPULATION_CAP = 200;

export const CITIZENS = {
  /** Progress along a walked path is expressed in path-index units (one hex step = 1 unit), not world distance — adjacent hex centers are equidistant on this grid, so this is a fair stand-in for constant walking speed. */
  walkSpeed: 0.4,
  /** Seconds spent idling at a fortress before picking a new destination. */
  idleMinSec: 2,
  idleMaxSec: 6,
  /** New citizens spawned per fortress tier when it's built. */
  citizensPerTier: 3,
  /** Max perpendicular offset from the road centerline, in world units. */
  lateralOffset: 0.32,
  /** Clearance above the road ribbon surface so feet never z-fight it. */
  groundClearance: 0.03,
  /** Walk-cycle leg swing, in cycles per world-unit of path traveled. */
  strideFrequency: 3.2,
  legSwingRad: 0.5,
  bobHeight: 0.045,
} as const;

/** Per-frame work budgets so systems stay off the render-blocking path. */
export const FRAME_BUDGET = {
  maxCitizenStepsPerTick: 32,
  maxPathfindsPerTick: 4,
} as const;

export const WORLD_SEED = 1337;

export const ROADS = {
  /** Ribbon width in world units. */
  width: 0.55,
  /** Lift above the tile top so the ribbon never z-fights with terrain. */
  surfaceOffset: 0.05,
  /** Catmull-Rom samples per hex step along a road's path. */
  samplesPerSegment: 6,
  /** Cost multiplier for an A* edge that reuses an existing road segment — pulls new roads onto trunk routes instead of drawing parallel lines. */
  reuseDiscount: 0.3,
  /** Weight blending neighbor height difference into A* edge cost, so paths skirt hills rather than climb them. */
  heightCostWeight: 1.5,
  /** Ms for a road's ribbon to visibly draw in once built. */
  growDurationMs: 600,
} as const;
