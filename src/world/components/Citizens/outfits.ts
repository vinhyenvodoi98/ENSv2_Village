import { medievalTheme, type MaterialSpec } from "@/world/config/theme";

export interface Outfit {
  primary: MaterialSpec;
  secondary: MaterialSpec;
}

/** Named outfit palettes, sourced from theme. Populated in task 26. */
export const outfits: Record<string, Outfit> = {
  default: {
    primary: medievalTheme.citizens.outfitPrimary,
    secondary: medievalTheme.citizens.outfitSecondary,
  },
};
