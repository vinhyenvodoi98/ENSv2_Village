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

/**
 * `ensKey` of the synthetic castle for the fleet's own ENS name (e.g. `agentvillage.eth`),
 * seeded at the origin by `ensWorldSource.ts` — not a `NamespaceNode` (nothing was ever
 * `spawn`ed to create it), but every depth-0 agent roads into it. Lives here rather than in
 * the adapter so render-loop components (`FortressLayer`) can reference it without importing
 * `src/world/adapters/ensWorldSource.ts`, which pulls in `@/lib/ens` (wagmi) at module scope.
 */
export const ROOT_ENS_KEY = "root";

/**
 * Rules for projecting the ENS namespace onto the hex field (task 29). Every
 * value here feeds a *deterministic* placement keyed by labelhash — nothing in
 * the layout may depend on array order, event order, or wall-clock time, or a
 * castle would move between reloads.
 */
export const LAYOUT = {
  /** Ring radius (in hexes) the depth-0 agents are seeded on, around the origin. */
  rootRingRadius: 4,
  /** Ring radius a Sovereign's children are seeded on, around the parent castle. */
  childRingRadius: FORTRESS_BUILD_DISTANCE,
  /** How far the collision probe may spiral out from a node's preferred ring before giving up. */
  maxProbeRings: 24,
  /** Empty hexes kept between the outermost castle and the edge of the terrain. */
  edgeMargin: 3,
} as const;

export const TERRAIN = {
  /** Simplex noise sample frequency; lower = broader hills. */
  noiseFrequency: 0.08,
  /** Peak-to-trough height added on top of HEX_HEIGHT. */
  amplitude: 0.9,
  /** Number of octaves layered for the height field. */
  octaves: 3,
  /** Falloff applied to each successive octave's amplitude. */
  persistence: 0.5,
} as const;

/** Decorative landscape outside the playable hex field. */
export const SCENERY = {
  groundSize: WORLD_RADIUS * HEX_SIZE * 6,
  groundY: -0.16,
  forestTreeCount: 280,
  forestInnerRadiusTiles: WORLD_RADIUS + 0.7,
  forestOuterRadiusTiles: WORLD_RADIUS + 4.4,
  treeMinHeight: 1.5,
  treeMaxHeight: 3.8,
  treeMinWidth: 0.72,
  treeMaxWidth: 1.18,
  trunkRadius: 0.12,
  trunkHeight: 0.9,
  foliageRadius: 0.72,
  foliageHeight: 1.65,
  upperFoliageScale: 0.7,
  streamPoints: [
    [38, -22],
    [34, -21],
    [23, -18],
    [14, -22],
    [5, -19],
    [-5, -22],
    [-14, -18],
    [-23, -20],
    [-27, -10],
    [-25, 0],
    [-24, 10],
    [-20, 20],
    [-12, 29],
    [-10, 38],
  ] as readonly (readonly [number, number])[],
  streamWidth: 1.5,
  streamBankWidth: 2.4,
  streamSegments: 96,
  streamSurfaceOffset: 0.035,
  streamTreeClearance: 1.65,
  streamFlowSpeed: 0.28,
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
  /** Caps framebuffer memory on Retina displays; AdaptiveDpr can still scale down under load. */
  dpr: [1, 1.5] as [number, number],
  /** 1024 is sufficient for the isometric diorama and uses 75% less shadow texture memory than 2048. */
  shadowMapSize: 1024,
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
  /** Target walking speed in world units per second. */
  walkSpeed: 0.9,
  acceleration: 2.2,
  brakingAcceleration: 2.8,
  /** Remaining route distance treated as arrival, preventing sub-pixel stop/start jitter. */
  arrivalThreshold: 0.012,
  /** Seconds spent idling at a fortress before picking a new destination. */
  idleMinSec: 2,
  idleMaxSec: 6,
  /** New citizens spawned per fortress tier when it's built. */
  citizensPerTier: 3,
  /** Per-citizen lane offset range, kept within the road ribbon. */
  lateralOffsetMin: 0.07,
  lateralOffsetMax: 0.17,
  /** Fraction of a route used to blend into/out of its lane near fortress gates. */
  laneFadeRatio: 0.08,
  /** Trims road curves away from fortress centers so walkers emerge at the gate rather than through the keep. */
  fortressClearance: 0.72,
  /** Clearance above the road ribbon surface so feet never z-fight it. */
  groundClearance: 0.03,
  /** Walk animation is driven by distance, so feet slow down with the body. */
  strideCyclesPerUnit: 1.9,
  legSwingRad: 0.56,
  armSwingMultiplier: 0.68,
  bodyLeanRad: 0.045,
  bobHeight: 0.014,
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

export const WEATHER = {
  /** Auto-cycle order. "dusk" is debug-only — the auto system never picks it. */
  cycle: ["clear", "cloudy", "rain"] as const,
  /** [min, max] seconds a state auto-holds before advancing to the next in `cycle`. */
  dwellSeconds: {
    clear: [25, 45] as [number, number],
    cloudy: [18, 32] as [number, number],
    rain: [12, 22] as [number, number],
    dusk: [18, 32] as [number, number],
  },
  /** Time constant (seconds) for easing sky/fog/light/cloud/rain toward their targets — bigger is slower, never instant. */
  transitionEaseSeconds: 4,
  /** Cloud volume count and base haze — first knobs to turn down on weak hardware. */
  cloudCount: 12,
  /** Low-poly puffs clustered per volume — no texture/network dependency, matches the fortress/citizen flat-shaded look. */
  cloudPuffsPerVolume: 9,
  cloudPuffRadius: 2.05,
  /** Half-length of each linked cloud bank, in world units. */
  cloudClusterSpread: 5.2,
  cloudPuffScaleMin: 0.78,
  cloudPuffScaleMax: 1.34,
  cloudWidthScale: 1.16,
  cloudVerticalScale: 0.64,
  cloudHeight: 7.5,
  cloudBaseOpacity: 0.12,
  /** Prevents overlapping puffs from becoming an opaque screen over the playable map. */
  cloudMaxOpacity: 0.26,
  /** World units/second the cloud volumes drift, wrapping at the map bounds. */
  windVector: [0.5, 0, 0.2] as [number, number, number],
  /** Horizontal +/- bound clouds wrap at — kept inside every theme's fog-far so the teleport is hidden in haze rather than popping in view. */
  cloudWrapBound: 38,
  rainDropCount: 3000,
  /** Width/height/depth of the box rain streaks fall and recycle within, centered on the camera target. */
  rainBoxSize: [40, 24, 40] as [number, number, number],
  rainFallSpeed: 16,
} as const;
