"use client";

import { toWorld } from "@/world/core/hex";
import { HEX_HEIGHT, HEX_SIZE } from "@/world/config/world.config";
import { medievalTheme } from "@/world/config/theme";
import type { AxialCoord } from "@/world/core/types";

interface TileHighlightProps {
  coord: AxialCoord;
}

/** Hover/selection ring over a tile. Stub for task 20 — wired up in task 22. */
export function TileHighlight({ coord }: TileHighlightProps) {
  const [x, z] = toWorld(coord);
  const { highlight } = medievalTheme.terrain;

  return (
    <mesh position={[x, HEX_HEIGHT + 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[HEX_SIZE * 0.8, HEX_SIZE, 6]} />
      <meshBasicMaterial color={highlight.color} transparent opacity={0.6} />
    </mesh>
  );
}
