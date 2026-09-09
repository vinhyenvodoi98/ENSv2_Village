"use client";

import { hexToWorld } from "@/world/core/hex";
import { HEX_HEIGHT, HEX_SIZE } from "@/world/config/world.config";
import { medievalTheme } from "@/world/config/theme";
import type { AxialCoord } from "@/world/core/types";

interface TileHighlightProps {
  coord: AxialCoord;
  /** The tile's terrain height, so the rim sits on raised tiles, not at y=0. */
  height?: number;
  theme?: typeof medievalTheme;
}

/** Rim drawn over the hovered (or selected) hex. */
export function TileHighlight({ coord, height = 0, theme = medievalTheme }: TileHighlightProps) {
  const [x, z] = hexToWorld(coord);
  const { highlight } = theme.terrain;

  return (
    <mesh position={[x, HEX_HEIGHT + height + 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[HEX_SIZE * 0.8, HEX_SIZE, 6]} />
      <meshBasicMaterial color={highlight.color} transparent opacity={0.6} />
    </mesh>
  );
}
