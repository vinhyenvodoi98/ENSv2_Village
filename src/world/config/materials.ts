import { MeshStandardMaterial } from "three";
import type { MaterialSpec, WorldTheme } from "./theme";

type MaterialGroup<T extends Record<string, MaterialSpec>> = {
  [K in keyof T]: MeshStandardMaterial;
};

export interface ThemeMaterials {
  terrain: MaterialGroup<WorldTheme["terrain"]>;
  fortress: MaterialGroup<WorldTheme["fortress"]>;
  roads: MaterialGroup<WorldTheme["roads"]>;
  citizens: MaterialGroup<WorldTheme["citizens"]>;
}

const cache = new Map<string, ThemeMaterials>();

function buildMaterial(spec: MaterialSpec): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    flatShading: spec.flatShading ?? false,
  });
}

function buildGroup<T extends Record<string, MaterialSpec>>(specs: T): MaterialGroup<T> {
  const entries = Object.entries(specs) as [keyof T, MaterialSpec][];
  return Object.fromEntries(entries.map(([key, spec]) => [key, buildMaterial(spec)])) as MaterialGroup<T>;
}

/**
 * Builds every `MeshStandardMaterial` for a theme exactly once and caches
 * the set by theme name. Components read a shared reference from here —
 * never `new MeshStandardMaterial(...)` inside a render path — so switching
 * presets swaps material references instead of rebuilding N materials per
 * frame, and every mesh using the same theme family shares one GPU program.
 */
export function getThemeMaterials(theme: WorldTheme): ThemeMaterials {
  const cached = cache.get(theme.name);
  if (cached) return cached;

  const built: ThemeMaterials = {
    terrain: buildGroup(theme.terrain),
    fortress: buildGroup(theme.fortress),
    roads: buildGroup(theme.roads),
    citizens: buildGroup(theme.citizens),
  };
  cache.set(theme.name, built);
  return built;
}
