import { createRng, hashString } from "../core/rng";
import type { AxialCoord } from "../core/types";

const PREFIXES = ["Ash", "Dawn", "Dragon", "High", "Iron", "Moon", "Raven", "Stone"] as const;
const SUFFIXES = ["crest", "fall", "guard", "haven", "hold", "keep", "spire", "watch"] as const;

/**
 * Seeded fantasy name for a castle placed by hand in the `/threejs` terrain
 * sandbox. Deliberately quarantined here and never reachable from `/`: on the
 * real map every nameplate is an ENS label read off Sepolia, and a generated
 * name there would be a hard-coded entity wearing a disguise (board invariant
 * #1). `Fortress.tsx` has no fallback — a castle with no name has no name.
 */
export function getGeneratedFortressName(coord: AxialCoord): string {
  const rng = createRng(hashString(`${coord.q},${coord.r}`) ^ 0x9e3779b9);
  return `${PREFIXES[rng.int(PREFIXES.length)]}${SUFFIXES[rng.int(SUFFIXES.length)]}`;
}
