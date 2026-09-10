"use client";

import { useMemo } from "react";
import { coordKey, ring } from "@/world/core/hex";
import { FORTRESS_BUILD_DISTANCE, HEX_HEIGHT, ROOT_ENS_KEY } from "@/world/config/world.config";
import { medievalTheme } from "@/world/config/theme";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectFortressList, selectHoveredCoord, selectHoveredTile, selectMode } from "@/world/state/selectors";
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
 * Renders every castle on the map. In `ens` mode each one is a namespace node
 * synced in by the page — clicking it selects that agent, which is what opens
 * the ENS detail panel. Placement itself is never decided here: the store owns
 * it, and in `ens` mode only a confirmed `spawn` can add a castle, so the
 * build markers and hover ghost are sandbox-only.
 */
export function FortressLayer({ theme = medievalTheme, kitId }: FortressLayerProps) {
  const fortressList = useWorldStore(selectFortressList);
  const tiles = useWorldStore((state) => state.tiles);
  const hoveredCoord = useWorldStore(selectHoveredCoord);
  const hoveredTile = useWorldStore(selectHoveredTile);
  const mode = useWorldStore(selectMode);
  const selectFortress = useWorldStore((state) => state.selectFortress);
  const setSpawnFormOpen = useWorldStore((state) => state.setSpawnFormOpen);
  const setFoundKingdomOpen = useWorldStore((state) => state.setFoundKingdomOpen);

  const isSandbox = mode === "sandbox";

  const validCoords = useMemo(
    () => (isSandbox ? computeValidBuildCoords(fortressList, tiles) : []),
    [isSandbox, fortressList, tiles]
  );

  const validKeySet = useMemo(() => new Set(validCoords.map(coordKey)), [validCoords]);

  const showGhost = isSandbox && Boolean(hoveredCoord && hoveredTile && validKeySet.has(coordKey(hoveredCoord)));

  return (
    <>
      <BuildMarkers coords={validCoords} tiles={tiles} theme={theme} />
      {fortressList.map((fortress) => {
        const tile = tiles.get(coordKey(fortress.coord));
        return (
          <Fortress
            key={fortress.ensKey}
            coord={fortress.coord}
            name={fortress.name}
            fullName={fortress.fullName}
            tier={fortress.tier}
            derelict={fortress.derelict}
            // A free wildcard label has no `spawn` tx behind it — showing it
            // solid would claim something the chain doesn't say.
            ghost={fortress.isLocalPreview}
            nameplateNote={
              fortress.isLocalPreview ? "not on-chain" : fortress.unfinished ? "unfinished — found your kingdom" : undefined
            }
            height={HEX_HEIGHT + (tile?.height ?? 0)}
            kitId={kitId}
            theme={theme}
            // The root castle is the fleet's own ENS name, not a namespace
            // node — there's no agent record for it to open a detail panel
            // on. Clicking it still does something, though: it's the root's
            // own hex, so it opens the same root-spawn modal as the HUD
            // button and the sidebar's root chip (all three clear selection
            // first, so none can inherit a stale parent) — unless the
            // kingdom is `unfinished` (task 32: claimed but no `AgentRegistry`
            // wired yet), in which case there's nothing to spawn into and
            // clicking it opens "Found your kingdom" instead.
            onClick={
              fortress.ensKey === ROOT_ENS_KEY
                ? () => {
                    selectFortress(null);
                    if (fortress.unfinished) setFoundKingdomOpen(true);
                    else setSpawnFormOpen(true);
                  }
                : () => selectFortress(fortress.ensKey)
            }
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
