import { spiral } from "../core/hex";
import { createHeightField } from "../core/noise";
import { WORLD_RADIUS, WORLD_SEED } from "../config/world.config";
import type { Tile } from "../core/types";
import type { WorldSource } from "./types";

/** Default source: a seeded, local hex field, no network. */
export function createLocalWorldSource(
  seed: number = WORLD_SEED,
  radius: number = WORLD_RADIUS
): WorldSource {
  return {
    loadTiles(): Tile[] {
      const heightAt = createHeightField(seed);
      return spiral({ q: 0, r: 0 }, radius).map((coord) => ({
        coord,
        height: heightAt(coord.q, coord.r),
        kind: "grass",
      }));
    },
  };
}
