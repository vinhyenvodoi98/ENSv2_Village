import { createNoise2D, type NoiseFunction2D } from "simplex-noise";
import { createRng } from "./rng";
import { TERRAIN, WORLD_SEED } from "../config/world.config";

/**
 * Seeded simplex wrapper producing the hill height field, heightAt(x, z).
 * `amplitude` defaults to the tuned config value but can be overridden — the
 * debug panel's terrain-amplitude slider regenerates tiles through this.
 */
export function createHeightField(
  seed: number = WORLD_SEED,
  amplitude: number = TERRAIN.amplitude
): (x: number, z: number) => number {
  const rng = createRng(seed);
  const noise2D: NoiseFunction2D = createNoise2D(rng.next);

  return function heightAt(x: number, z: number): number {
    let octaveAmplitude = 1;
    let frequency = TERRAIN.noiseFrequency;
    let value = 0;
    let amplitudeSum = 0;

    for (let octave = 0; octave < TERRAIN.octaves; octave++) {
      value += noise2D(x * frequency, z * frequency) * octaveAmplitude;
      amplitudeSum += octaveAmplitude;
      octaveAmplitude *= TERRAIN.persistence;
      frequency *= 2;
    }

    const normalized = value / amplitudeSum;
    return normalized * amplitude;
  };
}

/**
 * Seeded, single-octave simplex field independent of `heightAt`'s noise
 * sequence (offset seed), used to jitter biome boundaries so grass/sand
 * transitions don't read as a perfect contour line. Returns roughly -1..1.
 */
export function createBiomeField(seed: number = WORLD_SEED): (x: number, z: number) => number {
  const rng = createRng(seed + 1);
  const noise2D: NoiseFunction2D = createNoise2D(rng.next);
  const frequency = TERRAIN.noiseFrequency * 2.3;

  return function biomeAt(x: number, z: number): number {
    return noise2D(x * frequency, z * frequency);
  };
}
