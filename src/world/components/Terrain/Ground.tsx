"use client";

import { medievalTheme } from "@/world/config/theme";
import { WORLD_RADIUS, HEX_SIZE } from "@/world/config/world.config";

interface GroundProps {
  theme?: typeof medievalTheme;
}

/** Flat ground plane beneath the (future) hex grid. Receives shadows. */
export function Ground({ theme = medievalTheme }: GroundProps) {
  const size = WORLD_RADIUS * HEX_SIZE * 4;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        color={theme.terrain.grass.color}
        roughness={theme.terrain.grass.roughness}
        metalness={theme.terrain.grass.metalness}
      />
    </mesh>
  );
}
