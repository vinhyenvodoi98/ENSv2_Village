import type { WorldTheme } from "@/world/config/theme";
import type { SeededRng } from "@/world/core/rng";

/** A cloth-color key into `theme.cloth`, resolved to an actual color at render time. */
type ClothKey = keyof WorldTheme["cloth"];

export interface OutfitSpec {
  tunic: ClothKey;
  trouser: ClothKey;
  accent: ClothKey;
  /** Relative spawn weight — peasants should vastly outnumber nobles. */
  weight: number;
}

export interface ResolvedOutfit {
  tunic: string;
  trouser: string;
  accent: string;
}

/**
 * Named outfits, each a `{ tunic, trouser, accent }` triple of `theme.cloth`
 * keys plus a spawn weight. Colors are resolved against the active theme so
 * switching presets re-skins the crowd along with everything else.
 */
export const outfits: Record<string, OutfitSpec> = {
  peasant: { tunic: "undyed", trouser: "brown", accent: "rust", weight: 40 },
  farmhand: { tunic: "brown", trouser: "undyed", accent: "forest", weight: 25 },
  guard: { tunic: "slate", trouser: "charcoal", accent: "burgundy", weight: 12 },
  merchant: { tunic: "burgundy", trouser: "charcoal", accent: "gold", weight: 10 },
  smith: { tunic: "charcoal", trouser: "brown", accent: "rust", weight: 8 },
  monk: { tunic: "undyed", trouser: "undyed", accent: "charcoal", weight: 6 },
  noble: { tunic: "navy", trouser: "cream", accent: "gold", weight: 3 },
};

const outfitIds = Object.keys(outfits);
const totalWeight = outfitIds.reduce((sum, id) => sum + outfits[id].weight, 0);

/** Weighted-random outfit id — peasants and farmhands dominate, nobles are rare. */
export function pickOutfitId(rng: SeededRng): string {
  let roll = rng.next() * totalWeight;
  for (const id of outfitIds) {
    roll -= outfits[id].weight;
    if (roll <= 0) return id;
  }
  return outfitIds[outfitIds.length - 1];
}

export function resolveOutfit(theme: WorldTheme, outfitId: string): ResolvedOutfit {
  const spec = outfits[outfitId] ?? outfits.peasant;
  return {
    tunic: theme.cloth[spec.tunic].color,
    trouser: theme.cloth[spec.trouser].color,
    accent: theme.cloth[spec.accent].color,
  };
}
