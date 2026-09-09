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

export interface FortressEntity {
  id: string;
  coord: AxialCoord;
  /** Optional persisted name; the renderer supplies a stable generated fallback. */
  name?: string;
  tier: number;
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
  /** Seconds remaining before an idling citizen picks a new destination. */
  idleRemaining: number;
  outfitId: string;
  /** Deterministic left/right bias for the walk's lateral road offset. */
  lateralSign: 1 | -1;
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
