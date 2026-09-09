import { hexToWorld, spiral } from "../core/hex";
import { createBiomeField, createHeightField } from "../core/noise";
import { TERRAIN, WORLD_RADIUS, WORLD_SEED } from "../config/world.config";
import type { Tile } from "../core/types";
import type { WorldSource } from "./types";

const ROCK_THRESHOLD_RATIO = 0.28;
const SAND_THRESHOLD_RATIO = -0.22;
const BIOME_JITTER_RATIO = 0.15;

/** Height + a secondary noise lookup decide grass vs. rock vs. sand. */
function classifyBiome(height: number, biomeNoise: number, amplitude: number): Tile["kind"] {
  if (height > amplitude * ROCK_THRESHOLD_RATIO) return "stone";
  if (height < amplitude * SAND_THRESHOLD_RATIO + biomeNoise * amplitude * BIOME_JITTER_RATIO) return "dirt";
  return "grass";
}

/** Default source: a seeded, local hex field, no network. */
export function createLocalWorldSource(
  seed: number = WORLD_SEED,
  radius: number = WORLD_RADIUS,
  amplitude: number = TERRAIN.amplitude
): WorldSource {
  return {
    loadTiles(): Tile[] {
      const heightAt = createHeightField(seed, amplitude);
      const biomeAt = createBiomeField(seed);

      return spiral({ q: 0, r: 0 }, radius).map((coord) => {
        // Sampled at the hex center in world space, so the tile's top face
        // is flat and every point on it shares one height.
        const [x, z] = hexToWorld(coord);
        const height = heightAt(x, z);
        return {
          coord,
          height,
          kind: classifyBiome(height, biomeAt(x, z), amplitude),
        };
      });
    },
  };
}
