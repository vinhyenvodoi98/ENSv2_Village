"use client";

import { HEX_HEIGHT, HEX_SIZE } from "@/world/config/world.config";
import { toWorld } from "@/world/core/hex";
import { medievalTheme, type MaterialSpec } from "@/world/config/theme";
import type { AxialCoord } from "@/world/core/types";

interface HexTileProps {
  coord: AxialCoord;
  height?: number;
  material?: MaterialSpec;
}

/**
 * A single extruded hex tile. Stub for task 20 — the real grid is built and
 * instanced in task 21.
 */
export function HexTile({ coord, height = 0, material = medievalTheme.terrain.grass }: HexTileProps) {
  const [x, z] = toWorld(coord);

  return (
    <mesh position={[x, HEX_HEIGHT / 2 + height, z]} castShadow receiveShadow>
      <cylinderGeometry args={[HEX_SIZE, HEX_SIZE, HEX_HEIGHT, 6]} />
      <meshStandardMaterial
        color={material.color}
        roughness={material.roughness}
        metalness={material.metalness}
      />
    </mesh>
  );
}
