import { themes, type ThemeName } from "./theme";

/**
 * Named bundles of theme + shape kit. Tasks 21+ pick a preset by name instead
 * of importing theme/shape pieces individually.
 */
export interface WorldPreset {
  name: string;
  theme: ThemeName;
  /** Fortress silhouette kit key, resolved against fortress.presets.ts (task 24). */
  fortressKit: string;
}

export const presets: Record<string, WorldPreset> = {
  medieval: {
    name: "medieval",
    theme: "medieval",
    fortressKit: "medieval",
  },
  winter: {
    name: "winter",
    theme: "winter",
    fortressKit: "medieval",
  },
};

export const DEFAULT_PRESET: keyof typeof presets = "medieval";

export function resolvePreset(name: keyof typeof presets = DEFAULT_PRESET) {
  const preset = presets[name];
  return { preset, theme: themes[preset.theme] };
}
