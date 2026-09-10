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
  /** 0 hides the shared headwear mesh; other values scale its height. */
  headwearScale: number;
}

export interface ResolvedOutfit {
  tunic: string;
  trouser: string;
  accent: string;
  headwearScale: number;
}

/**
 * Named outfits combine a theme-driven cloth palette, spawn weight and cap
 * silhouette. Colors are resolved against the active theme so switching
 * presets re-skins the crowd along with everything else.
 */
export const outfits: Record<string, OutfitSpec> = {
  peasant: { tunic: "undyed", trouser: "brown", accent: "rust", weight: 40, headwearScale: 0.65 },
  farmhand: { tunic: "brown", trouser: "undyed", accent: "forest", weight: 25, headwearScale: 0.8 },
  guard: { tunic: "slate", trouser: "charcoal", accent: "burgundy", weight: 12, headwearScale: 0.42 },
  merchant: { tunic: "burgundy", trouser: "charcoal", accent: "gold", weight: 10, headwearScale: 0.9 },
  smith: { tunic: "charcoal", trouser: "brown", accent: "rust", weight: 8, headwearScale: 0 },
  monk: { tunic: "undyed", trouser: "undyed", accent: "charcoal", weight: 6, headwearScale: 0.38 },
  noble: { tunic: "navy", trouser: "cream", accent: "gold", weight: 3, headwearScale: 1.15 },
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
    headwearScale: spec.headwearScale,
  };
}
