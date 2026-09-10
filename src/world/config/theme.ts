/**
 * Single source of truth for every color, roughness, and metalness used in the
 * 3D world. No component under `src/world/` may write a literal color, roughness,
 * or metalness value — import it from here instead.
 */

export interface MaterialSpec {
  color: string;
  roughness: number;
  metalness: number;
  /** Facet look for low-poly parts (fortress/citizens). Defaults to false. */
  flatShading?: boolean;
}

export interface WorldTheme {
  name: string;
  sky: {
    /** Background / clear color and fog color. */
    top: string;
    bottom: string;
    fogColor: string;
    fogNear: number;
    fogFar: number;
    /**
     * Target palette `weatherSystem` blends the sky/fog/light toward as
     * `stormBlend` rises — the only place rain's darkening lives, so a storm
     * always reads as this theme's colors, never a parallel palette.
     */
    rain: {
      top: string;
      bottom: string;
      fogColor: string;
      fogNear: number;
      fogFar: number;
      /** Multiplies `lighting.ambientIntensity` at full storm. */
      ambientMultiplier: number;
      /** Multiplies `lighting.directionalIntensity` at full storm. */
      directionalMultiplier: number;
    };
  };
  lighting: {
    ambientColor: string;
    ambientIntensity: number;
    hemisphereSkyColor: string;
    hemisphereGroundColor: string;
    hemisphereIntensity: number;
    directionalColor: string;
    directionalIntensity: number;
  };
  terrain: {
    grass: MaterialSpec;
    dirt: MaterialSpec;
    stone: MaterialSpec;
    water: MaterialSpec;
    highlight: MaterialSpec;
    ground: MaterialSpec;
    treeTrunk: MaterialSpec;
    pineLower: MaterialSpec;
    pineUpper: MaterialSpec;
  };
  fortress: {
    keep: MaterialSpec;
    wall: MaterialSpec;
    roof: MaterialSpec;
    banner: MaterialSpec;
    /** Windows, portcullis bars — dark ironwork/glass detail. */
    window: MaterialSpec;
    /** Small fixed set of banner cloth colors; a fortress picks one by seeded RNG. */
    bannerVariantColors: string[];
  };
  roads: {
    path: MaterialSpec;
  };
  citizens: {
    skin: MaterialSpec;
    outfitPrimary: MaterialSpec;
    outfitSecondary: MaterialSpec;
  };
  /** Named cloth colors outfits.ts resolves its tunic/trouser/accent slots against. */
  cloth: {
    undyed: MaterialSpec;
    brown: MaterialSpec;
    slate: MaterialSpec;
    forest: MaterialSpec;
    rust: MaterialSpec;
    charcoal: MaterialSpec;
    burgundy: MaterialSpec;
    gold: MaterialSpec;
    navy: MaterialSpec;
    cream: MaterialSpec;
  };
  weather: {
    cloudColor: string;
    rainColor: string;
  };
}

export const medievalTheme: WorldTheme = {
  name: "medieval",
  sky: {
    top: "#7ec4e8",
    bottom: "#cfe9f7",
    fogColor: "#cfe9f7",
    fogNear: 40,
    fogFar: 140,
    rain: {
      top: "#4d5a63",
      bottom: "#7c8a92",
      fogColor: "#7c8a92",
      fogNear: 20,
      fogFar: 85,
      ambientMultiplier: 0.55,
      directionalMultiplier: 0.45,
    },
  },
  lighting: {
    ambientColor: "#ffffff",
    ambientIntensity: 0.35,
    hemisphereSkyColor: "#bfe0f0",
    hemisphereGroundColor: "#4a5d3a",
    hemisphereIntensity: 0.6,
    directionalColor: "#fff4d6",
    directionalIntensity: 1.4,
  },
  terrain: {
    grass: { color: "#5f9a4c", roughness: 0.95, metalness: 0 },
    dirt: { color: "#8f7652", roughness: 1, metalness: 0 },
    stone: { color: "#8f9184", roughness: 0.92, metalness: 0.03 },
    water: { color: "#285d68", roughness: 0.2, metalness: 0.06 },
    highlight: { color: "#ffd966", roughness: 0.6, metalness: 0 },
    ground: { color: "#456f3d", roughness: 1, metalness: 0 },
    treeTrunk: { color: "#5b402c", roughness: 1, metalness: 0, flatShading: true },
    pineLower: { color: "#244f39", roughness: 0.96, metalness: 0, flatShading: true },
    pineUpper: { color: "#397052", roughness: 0.94, metalness: 0, flatShading: true },
  },
  fortress: {
    keep: { color: "#c7c1b4", roughness: 0.9, metalness: 0.02, flatShading: true },
    wall: { color: "#aaa69c", roughness: 0.94, metalness: 0.01, flatShading: true },
    roof: { color: "#555966", roughness: 0.78, metalness: 0.08, flatShading: true },
    banner: { color: "#8e1f2b", roughness: 0.6, metalness: 0, flatShading: true },
    window: { color: "#1d2730", roughness: 0.32, metalness: 0.48, flatShading: true },
    bannerVariantColors: ["#8e1f2b", "#1f3f8e", "#1f7a3b", "#8e6f1f"],
  },
  roads: {
    path: { color: "#b09b73", roughness: 1, metalness: 0 },
  },
  citizens: {
    skin: { color: "#e0b593", roughness: 0.8, metalness: 0 },
    outfitPrimary: { color: "#4a6f8a", roughness: 0.85, metalness: 0 },
    outfitSecondary: { color: "#c9a15a", roughness: 0.85, metalness: 0 },
  },
  cloth: {
    undyed: { color: "#d8cdb8", roughness: 0.9, metalness: 0 },
    brown: { color: "#7a5a3a", roughness: 0.9, metalness: 0 },
    slate: { color: "#5a6a76", roughness: 0.85, metalness: 0 },
    forest: { color: "#3e6b47", roughness: 0.85, metalness: 0 },
    rust: { color: "#9a5230", roughness: 0.85, metalness: 0 },
    charcoal: { color: "#3a3a3e", roughness: 0.8, metalness: 0 },
    burgundy: { color: "#6e2333", roughness: 0.8, metalness: 0 },
    gold: { color: "#c9a15a", roughness: 0.7, metalness: 0.05 },
    navy: { color: "#2e3f5c", roughness: 0.85, metalness: 0 },
    cream: { color: "#e8dcc4", roughness: 0.85, metalness: 0 },
  },
  weather: {
    cloudColor: "#ffffff",
    rainColor: "#9fb8c9",
  },
};

export const winterTheme: WorldTheme = {
  ...medievalTheme,
  name: "winter",
  sky: {
    top: "#a9c4d8",
    bottom: "#e6eef2",
    fogColor: "#e6eef2",
    fogNear: 35,
    fogFar: 130,
    rain: {
      top: "#5a6670",
      bottom: "#8b96a0",
      fogColor: "#8b96a0",
      fogNear: 18,
      fogFar: 78,
      ambientMultiplier: 0.6,
      directionalMultiplier: 0.5,
    },
  },
  terrain: {
    ...medievalTheme.terrain,
    grass: { color: "#e8edf0", roughness: 0.9, metalness: 0 },
    dirt: { color: "#b7bfc4", roughness: 1, metalness: 0 },
    water: { color: "#4f7782", roughness: 0.16, metalness: 0.09 },
    ground: { color: "#cbd6d9", roughness: 1, metalness: 0 },
    pineLower: { color: "#38574f", roughness: 0.96, metalness: 0, flatShading: true },
    pineUpper: { color: "#b9ccca", roughness: 0.94, metalness: 0, flatShading: true },
  },
};

export const themes = {
  medieval: medievalTheme,
  winter: winterTheme,
} as const;

export type ThemeName = keyof typeof themes;
