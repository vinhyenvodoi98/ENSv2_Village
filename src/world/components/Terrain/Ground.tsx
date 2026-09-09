"use client";

import { medievalTheme } from "@/world/config/theme";
import { getThemeMaterials } from "@/world/config/materials";
import { WORLD_RADIUS, HEX_SIZE } from "@/world/config/world.config";

interface GroundProps {
  theme?: typeof medievalTheme;
}

/** Flat ground plane beneath the hex grid. Receives shadows. */
export function Ground({ theme = medievalTheme }: GroundProps) {
  const size = WORLD_RADIUS * HEX_SIZE * 4;
  const material = getThemeMaterials(theme).terrain.grass;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]}
      material={material}
      receiveShadow
    >
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
