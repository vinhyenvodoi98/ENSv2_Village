"use client";

import { medievalTheme } from "@/world/config/theme";
import { getThemeMaterials } from "@/world/config/materials";
import { SCENERY } from "@/world/config/world.config";

interface GroundProps {
  theme?: typeof medievalTheme;
}

/** Flat ground plane beneath the hex grid. Receives shadows. */
export function Ground({ theme = medievalTheme }: GroundProps) {
  const material = getThemeMaterials(theme).terrain.ground;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SCENERY.groundY, 0]}
      material={material}
      receiveShadow
    >
      <planeGeometry args={[SCENERY.groundSize, SCENERY.groundSize]} />
    </mesh>
  );
}
