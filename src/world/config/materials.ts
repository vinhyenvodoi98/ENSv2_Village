import { DoubleSide, MeshStandardMaterial } from "three";
import type { MaterialSpec, WorldTheme } from "./theme";

type MaterialGroup<T extends Record<string, MaterialSpec>> = {
  [K in keyof T]: MeshStandardMaterial;
};

type FortressSpecs = Omit<WorldTheme["fortress"], "bannerVariantColors">;

export interface FortressMaterials extends MaterialGroup<FortressSpecs> {
  /** Cached once per theme, shared by every fortress — never per-instance. */
  bannerVariants: MeshStandardMaterial[];
  /** Shared translucent material for the build-target preview fortress. */
  ghost: MeshStandardMaterial;
}

export interface ThemeMaterials {
  terrain: MaterialGroup<WorldTheme["terrain"]>;
  fortress: FortressMaterials;
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

function buildFortressMaterials(fortress: WorldTheme["fortress"]): FortressMaterials {
  const { bannerVariantColors, ...specs } = fortress;
  const base = buildGroup(specs) as MaterialGroup<FortressSpecs>;

  const bannerVariants = bannerVariantColors.map(
    (color) =>
      new MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0,
        flatShading: true,
        side: DoubleSide,
      })
  );

  const ghost = new MeshStandardMaterial({
    color: fortress.keep.color,
    roughness: fortress.keep.roughness,
    metalness: fortress.keep.metalness,
    flatShading: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });

  return { ...base, bannerVariants, ghost };
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
    fortress: buildFortressMaterials(theme.fortress),
    roads: buildGroup(theme.roads),
    citizens: buildGroup(theme.citizens),
  };
  cache.set(theme.name, built);
  return built;
}
