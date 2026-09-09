"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Instance, Instances } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { coordKey, hexToWorld, worldToHex } from "@/world/core/hex";
import { HEX_HEIGHT, WORLD_RADIUS, WORLD_SEED } from "@/world/config/world.config";
import { medievalTheme } from "@/world/config/theme";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectAllTiles, selectHoveredTile } from "@/world/state/selectors";
import { createLocalWorldSource } from "@/world/adapters/localWorldSource";
import type { Tile } from "@/world/core/types";
import { TileHighlight } from "./TileHighlight";
import { hexGeometry } from "./hexGeometry";

/** Skip hover updates faster than this — pointer events, never a per-frame raycast. */
const HOVER_THROTTLE_MS = 32;

interface HexGridProps {
  theme?: typeof medievalTheme;
}

/**
 * Instanced hex field, driven by `useWorldStore`'s tiles. One geometry, one
 * material, per-instance position/color — the difference between hundreds of
 * tiles at 60 fps and hundreds of draw calls.
 */
export function HexGrid({ theme = medievalTheme }: HexGridProps) {
  const tiles = useWorldStore(selectAllTiles);
  const setTiles = useWorldStore((state) => state.setTiles);
  const terrainAmplitude = useWorldStore((state) => state.debug.terrainAmplitude);

  useEffect(() => {
    let cancelled = false;
    const source = createLocalWorldSource(WORLD_SEED, WORLD_RADIUS, terrainAmplitude);
    Promise.resolve(source.loadTiles()).then((loaded) => {
      if (!cancelled) setTiles(loaded);
    });
    return () => {
      cancelled = true;
    };
    // Regenerates on mount and whenever the debug panel's amplitude slider
    // moves — cheap enough (a few hundred tiles) to redo synchronously.
  }, [terrainAmplitude, setTiles]);

  if (tiles.length === 0) return null;

  return (
    <>
      <TileInstances tiles={tiles} theme={theme} />
      <HoveredTileHighlight theme={theme} />
    </>
  );
}

interface TileInstancesProps {
  tiles: Tile[];
  theme: typeof medievalTheme;
}

/**
 * Memoized so hover state (a separate store slice, read only by
 * `HoveredTileHighlight`) never re-renders — and never re-batches — this
 * layer.
 */
const TileInstances = memo(function TileInstances({ tiles, theme }: TileInstancesProps) {
  const setHoveredCoord = useWorldStore((state) => state.setHoveredCoord);
  const lastMoveAt = useRef(0);
  const base = theme.terrain.grass;

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const now = performance.now();
      if (now - lastMoveAt.current < HOVER_THROTTLE_MS) return;
      lastMoveAt.current = now;
      setHoveredCoord(worldToHex(event.point.x, event.point.z));
    },
    [setHoveredCoord]
  );

  const handlePointerOut = useCallback(() => setHoveredCoord(null), [setHoveredCoord]);

  return (
    <Instances
      limit={tiles.length}
      castShadow
      receiveShadow
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
    >
      <primitive object={hexGeometry} attach="geometry" />
      <meshStandardMaterial roughness={base.roughness} metalness={base.metalness} />
      {tiles.map((tile) => (
        <TileInstance key={coordKey(tile.coord)} tile={tile} theme={theme} />
      ))}
    </Instances>
  );
});

function TileInstance({ tile, theme }: { tile: Tile; theme: typeof medievalTheme }) {
  const [x, z] = useMemo(() => hexToWorld(tile.coord), [tile.coord]);
  const color = theme.terrain[tile.kind].color;
  return <Instance position={[x, HEX_HEIGHT / 2 + tile.height, z]} color={color} />;
}

function HoveredTileHighlight({ theme }: { theme: typeof medievalTheme }) {
  const hoveredCoord = useWorldStore((state) => state.hoveredCoord);
  const hoveredTile = useWorldStore(selectHoveredTile);

  if (!hoveredCoord || !hoveredTile) return null;

  return <TileHighlight coord={hoveredCoord} height={hoveredTile.height} theme={theme} />;
}
