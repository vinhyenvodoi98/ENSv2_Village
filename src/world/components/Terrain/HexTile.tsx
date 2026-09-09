"use client";

import { HEX_HEIGHT } from "@/world/config/world.config";
import { hexToWorld } from "@/world/core/hex";
import { medievalTheme } from "@/world/config/theme";
import { getThemeMaterials } from "@/world/config/materials";
import type { AxialCoord, Tile } from "@/world/core/types";
import { hexGeometry } from "./hexGeometry";

interface HexTileProps {
  coord: AxialCoord;
  height?: number;
  kind?: Tile["kind"];
  theme?: typeof medievalTheme;
}

/**
 * A single hex tile — used for previews and the selected tile. Shares
 * `hexGeometry` and the cached theme material with `HexGrid`'s instances, so
 * hover and placement previews render identically to what actually gets
 * built.
 */
export function HexTile({ coord, height = 0, kind = "grass", theme = medievalTheme }: HexTileProps) {
  const [x, z] = hexToWorld(coord);
  const material = getThemeMaterials(theme).terrain[kind];

  return (
    <mesh
      position={[x, HEX_HEIGHT / 2 + height, z]}
      geometry={hexGeometry}
      material={material}
      castShadow
      receiveShadow
    />
  );
}
