/**
 * Seeded PRNG (mulberry32). The same seed always produces the same sequence,
 * so a world built from a fixed seed is reproducible.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a — deterministic, so the same string always hashes the same. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface SeededRng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): SeededRng {
  const next = mulberry32(seed);
  return {
    next,
    int(maxExclusive: number) {
      return Math.floor(next() * maxExclusive);
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)];
    },
  };
}
