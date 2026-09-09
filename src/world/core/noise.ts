import { createNoise2D, type NoiseFunction2D } from "simplex-noise";
import { createRng } from "./rng";
import { TERRAIN, WORLD_SEED } from "../config/world.config";

/** Seeded simplex wrapper producing the hill height field, heightAt(x, z). */
export function createHeightField(seed: number = WORLD_SEED): (x: number, z: number) => number {
  const rng = createRng(seed);
  const noise2D: NoiseFunction2D = createNoise2D(rng.next);

  return function heightAt(x: number, z: number): number {
    let amplitude = 1;
    let frequency = TERRAIN.noiseFrequency;
    let value = 0;
    let amplitudeSum = 0;

    for (let octave = 0; octave < TERRAIN.octaves; octave++) {
      value += noise2D(x * frequency, z * frequency) * amplitude;
      amplitudeSum += amplitude;
      amplitude *= TERRAIN.persistence;
      frequency *= 2;
    }

    const normalized = value / amplitudeSum;
    return normalized * TERRAIN.amplitude;
  };
}
