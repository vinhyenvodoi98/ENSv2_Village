"use client";

import { useMemo } from "react";
import { coordKey, ring } from "@/world/core/hex";
import { FORTRESS_BUILD_DISTANCE, HEX_HEIGHT } from "@/world/config/world.config";
import { medievalTheme } from "@/world/config/theme";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectFortressList, selectHoveredCoord, selectHoveredTile } from "@/world/state/selectors";
import type { AxialCoord, FortressEntity, Tile } from "@/world/core/types";
import { Fortress } from "./Fortress";
import { BuildMarkers } from "./BuildMarkers";

interface FortressLayerProps {
  theme?: typeof medievalTheme;
  kitId: string;
}

/**
 * Every hex exactly `FORTRESS_BUILD_DISTANCE` steps from an owned fortress,
 * that is on the map and unowned. Fortresses now fill their tile edge to
 * edge, so the next one needs a gap of empty hexes rather than sitting
 * directly beside the last — never a ring-1 neighbor.
 */
export function computeValidBuildCoords(fortressList: FortressEntity[], tiles: Map<string, Tile>): AxialCoord[] {
  const occupied = new Set(fortressList.map((fortress) => coordKey(fortress.coord)));
  const seen = new Set<string>();
  const coords: AxialCoord[] = [];

  for (const fortress of fortressList) {
    for (const target of ring(fortress.coord, FORTRESS_BUILD_DISTANCE)) {
      const key = coordKey(target);
      if (seen.has(key) || occupied.has(key) || !tiles.has(key)) continue;
      seen.add(key);
      coords.push(target);
    }
  }

  return coords;
}

/**
 * Renders every placed fortress plus the build-target markers and hover
 * ghost. Owns none of the click/placement logic — that lives with the tile
 * raycast in `HexGrid`, which is the surface clicks actually land on.
 */
export function FortressLayer({ theme = medievalTheme, kitId }: FortressLayerProps) {
  const fortressList = useWorldStore(selectFortressList);
  const tiles = useWorldStore((state) => state.tiles);
  const hoveredCoord = useWorldStore(selectHoveredCoord);
  const hoveredTile = useWorldStore(selectHoveredTile);

  const validCoords = useMemo(() => computeValidBuildCoords(fortressList, tiles), [fortressList, tiles]);

  const validKeySet = useMemo(() => new Set(validCoords.map(coordKey)), [validCoords]);

  const showGhost = Boolean(hoveredCoord && hoveredTile && validKeySet.has(coordKey(hoveredCoord)));

  return (
    <>
      <BuildMarkers coords={validCoords} tiles={tiles} theme={theme} />
      {fortressList.map((fortress) => {
        const tile = tiles.get(coordKey(fortress.coord));
        return (
          <Fortress
            key={fortress.id}
            coord={fortress.coord}
            name={fortress.name}
            tier={fortress.tier}
            height={HEX_HEIGHT + (tile?.height ?? 0)}
            kitId={kitId}
            theme={theme}
          />
        );
      })}
      {showGhost && hoveredCoord && hoveredTile && (
        <Fortress
          coord={hoveredCoord}
          tier={1}
          height={HEX_HEIGHT + hoveredTile.height}
          kitId={kitId}
          theme={theme}
          ghost
        />
      )}
    </>
  );
}
