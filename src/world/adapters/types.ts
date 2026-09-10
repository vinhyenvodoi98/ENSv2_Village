import type { FortressEntity, Tile } from "../core/types";

/**
 * Where tiles come from. Local generation today; an ENS-backed adapter later
 * maps "one hex per agent namespace" onto the same interface without touching
 * the render layer.
 */
export interface WorldSource {
  /** Load (or generate) the tiles that make up the world. */
  loadTiles(): Promise<Tile[]> | Tile[];
}

/**
 * Where *castles* come from — split out from `WorldSource` (task 29) because
 * terrain and entities now have genuinely different origins: terrain is
 * generated noise (pure decoration, safe to invent), while every castle must
 * be the projection of something that actually exists on chain.
 * `createLocalWorldSource` therefore stays a terrain-only `WorldSource`, and
 * `createEnsFortressSource` is the only implementation of this.
 */
export interface FortressSource {
  loadFortresses(): FortressEntity[];
  /** Hex radius the terrain must cover for every castle this source places to fit on the map. */
  requiredWorldRadius(): number;
}
