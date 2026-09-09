"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { Road as RoadData, Tile } from "@/world/core/types";
import { ROADS } from "@/world/config/world.config";
import { medievalTheme } from "@/world/config/theme";
import { getThemeMaterials } from "@/world/config/materials";
import { buildRoadRibbonGeometry } from "./roadGeometry";

/** Round up to the nearest whole quad (2 triangles / 6 indices) so the reveal never cuts a quad in half. */
function quadAlignedDrawCount(totalIndices: number, t: number): number {
  const quadCount = Math.ceil((totalIndices / 6) * t);
  return quadCount * 6;
}

interface RoadProps {
  road: RoadData;
  tiles: Map<string, Tile>;
  theme?: typeof medievalTheme;
  /** Fired once, when this road's draw-in animation finishes. */
  onSettled?: () => void;
}

/**
 * A single road's ribbon, mid-growth: its `drawRange` widens over
 * `ROADS.growDurationMs` so it draws itself in as the fortress at its end
 * rises. Once settled it hands off to `RoadNetwork`'s merged static mesh —
 * the drawRange is mutated through the mounted mesh's own `geometry`
 * (a ref access), never through the `useMemo`'d `geometry` variable itself,
 * per this repo's react-hooks/immutability rule (see BuildMarkers.tsx).
 */
export function Road({ road, tiles, theme = medievalTheme, onSettled }: RoadProps) {
  const geometry = useMemo(() => buildRoadRibbonGeometry(road.path, tiles), [road.path, tiles]);
  const material = getThemeMaterials(theme).roads.path;
  const meshRef = useRef<Mesh>(null);
  const startedAtRef = useRef<number | null>(null);
  const settledRef = useRef(false);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settledRef.current) return;

    if (startedAtRef.current === null) startedAtRef.current = performance.now();
    const elapsed = performance.now() - startedAtRef.current;
    const t = Math.min(1, elapsed / ROADS.growDurationMs);

    const totalIndices = mesh.geometry.index?.count ?? 0;
    mesh.geometry.setDrawRange(0, quadAlignedDrawCount(totalIndices, t));

    if (t >= 1) {
      settledRef.current = true;
      onSettled?.();
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}
