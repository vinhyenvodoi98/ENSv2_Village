/** Axial hex coordinate. */
export interface AxialCoord {
  q: number;
  r: number;
}

export interface Tile {
  coord: AxialCoord;
  height: number;
  kind: "grass" | "dirt" | "stone" | "water";
  occupantId?: string;
}

/**
 * One castle on the map. Since task 29 this is *always* the projection of one
 * ENS namespace node (`ensKey` is `namespaceKey(registry, labelhash)`), never
 * a free-standing map entity — the `/threejs` sandbox is the one exception and
 * synthesizes its own `ensKey` from the hex it was placed on.
 *
 * Deliberately plain data: `src/world/` must never import wagmi/viem, so the
 * page layer reads the chain and hands the result down through
 * `syncFortressesFromEns`.
 */
export interface FortressEntity {
  /** Stable identity. `namespaceKey(registry, labelhash)` for ENS-backed castles. */
  ensKey: string;
  coord: AxialCoord;
  /** Short ENS label shown on the nameplate. */
  name: string;
  /** Dotted ENS name shown in tooltips / the detail panel. */
  fullName: string;
  /** `AGENT_TIERS` index: 0 Wildcard … 3 Sovereign. Drives the castle preset. */
  tier: number;
  /** `ensKey` of the parent namespace node, or null at the root ring. */
  parentEnsKey: string | null;
  /** Free wildcard label that has no on-chain `spawn` yet — rendered as a ghost. */
  isLocalPreview?: boolean;
  /** Revoked on-chain, or an expired `Leased` node — rendered derelict, never removed. */
  derelict: boolean;
  /** Task 32: the root castle only — claimed but no `AgentRegistry` wired to it yet, so there's
   *  nowhere for a real `spawn` to go until "Found your kingdom" runs. */
  unfinished?: boolean;
}

export interface Road {
  id: string;
  path: AxialCoord[];
}

export type CitizenStatus = "idle" | "walking";

export interface Citizen {
  id: string;
  /** Home fortress this citizen was spawned for — fixed for its lifetime. */
  fortressId: string;
  /** Fortress the current leg departed from. */
  originId: string;
  /** Fortress the current leg is walking toward. */
  targetId: string;
  /** Hex the citizen is currently standing at while idle, or departed from while walking. */
  position: AxialCoord;
  status: CitizenStatus;
  /** Hex-by-hex road path for the current leg, from origin to target. Empty while stranded (no route yet). */
  path: AxialCoord[];
  /** 0..1 fraction walked along `path`. Meaningless while idle. */
  progress: number;
  /** Current physical speed in world units/second; accelerates and brakes instead of snapping. */
  speed: number;
  /** Cached physical route length in world units. */
  pathLength: number;
  /** Seconds remaining before an idling citizen picks a new destination. */
  idleRemaining: number;
  outfitId: string;
  /** Deterministic left/right bias for the walk's lateral road offset. */
  lateralSign: 1 | -1;
  /** Stable distance from the road centerline, in world units. */
  lateralOffset: number;
  /** Deterministic phase offset for the walk-cycle animation, so citizens don't move in lockstep. */
  animPhase: number;
}

export interface Cart {
  id: string;
  roadId: string;
  progress: number;
}

export type WeatherKind = "clear" | "cloudy" | "rain" | "dusk";

export interface Weather {
  kind: WeatherKind;
  intensity: number;
}

/**
 * Smoothed render-facing weather values `weatherSystem.tickWeather` eases
 * toward `Weather`'s target every tick, so sky tint, fog, light, cloud
 * opacity and rain density all transition together instead of cutting.
 */
export interface WeatherRenderState {
  /** 0..1 — how far into "dark and wet" the world is; drives sky/fog/light tint via `theme.sky.rain`. */
  stormBlend: number;
  /** 0..1 opacity fed to the drifting cloud volumes. */
  cloudOpacity: number;
  /** 0..1 — how heavy the rain particle system renders. */
  rainDensity: number;
}
