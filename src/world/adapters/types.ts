import type { Tile } from "../core/types";

/**
 * Where tiles come from. Local generation today; an ENS-backed adapter later
 * maps "one hex per agent namespace" onto the same interface without touching
 * the render layer.
 */
export interface WorldSource {
  /** Load (or generate) the tiles that make up the world. */
  loadTiles(): Promise<Tile[]> | Tile[];
}
