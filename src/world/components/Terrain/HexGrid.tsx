"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Instance, Instances } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { Color } from "three";
import { coordKey, distance, hexToWorld, worldToHex } from "@/world/core/hex";
import { FORTRESS_BUILD_DISTANCE, HEX_HEIGHT, WORLD_SEED } from "@/world/config/world.config";
import { medievalTheme } from "@/world/config/theme";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectAllTiles, selectHoveredTile, selectWorldRadius } from "@/world/state/selectors";
import { createLocalWorldSource } from "@/world/adapters/localWorldSource";
import type { Tile } from "@/world/core/types";
import { TileHighlight } from "./TileHighlight";
import { hexGeometry } from "./hexGeometry";
import { hashString } from "@/world/core/rng";

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
  const worldRadius = useWorldStore(selectWorldRadius);

  useEffect(() => {
    let cancelled = false;
    // Terrain stays locally generated — height and biome are pure decoration,
    // the one thing the map is allowed to invent. Its *extent* is not: the
    // radius grows with the namespace (`syncFortressesFromEns`) so a large
    // tree is never quietly clipped at the old `WORLD_RADIUS`.
    const source = createLocalWorldSource(WORLD_SEED, worldRadius, terrainAmplitude);
    Promise.resolve(source.loadTiles()).then((loaded) => {
      if (cancelled) return;
      setTiles(loaded);
      // The sandbox needs a seed castle so there's always a valid build
      // target. The root map must not: castles there come from chain only.
      const store = useWorldStore.getState();
      if (store.mode === "sandbox" && store.fortressList.length === 0) {
        store.placeFortress({ q: 0, r: 0 });
      }
    });
    return () => {
      cancelled = true;
    };
    // Regenerates on mount, when the namespace outgrows the map, and whenever
    // the debug panel's amplitude slider moves — cheap enough (a few hundred
    // tiles) to redo synchronously.
  }, [terrainAmplitude, worldRadius, setTiles]);

  if (tiles.length === 0) return null;

  return (
    <>
      {/* Keyed by count: drei's `Instances` sizes its instance buffers once,
          from `limit`, and doesn't resize them if the tile count changes on a
          later render (the radius grows once the namespace loads) — writing
          more instances than that first buffer allocated corrupts the draw
          silently (a `bufferSubData` GL error, no thrown exception) and the
          whole hex field vanishes. Forcing a remount on count change throws
          the stale buffer away instead of writing past its end. */}
      <TileInstances key={tiles.length} tiles={tiles} theme={theme} />
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
  const placeFortress = useWorldStore((state) => state.placeFortress);
  const selectFortress = useWorldStore((state) => state.selectFortress);
  const setBuildMessage = useWorldStore((state) => state.setBuildMessage);
  const setSpawnFormOpen = useWorldStore((state) => state.setSpawnFormOpen);
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

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      // Raycast lands on the tile-top instances themselves, not a ground
      // plane, so this reads correctly even over raised terrain.
      const coord = worldToHex(event.point.x, event.point.z);
      const key = coordKey(coord);

      const { tiles: tileMap, fortressList, mode } = useWorldStore.getState();
      if (!tileMap.has(key)) {
        setBuildMessage("There's no tile there.");
        return;
      }

      const occupyingFortress = fortressList.find((fortress) => coordKey(fortress.coord) === key);
      if (occupyingFortress) {
        selectFortress(occupyingFortress.ensKey);
        return;
      }

      // On the root map, empty ground is just empty ground: a castle is an ENS
      // node, and the only way to get one is a `spawn` tx. Clicking here opens
      // the spawn form instead of conjuring a building.
      if (mode === "ens") {
        setSpawnFormOpen(true);
        return;
      }

      const isAtBuildDistance = fortressList.some(
        (fortress) => distance(fortress.coord, coord) === FORTRESS_BUILD_DISTANCE
      );
      if (!isAtBuildDistance) {
        setBuildMessage(`Build only on a hex ${FORTRESS_BUILD_DISTANCE} tiles from an existing fortress.`);
        return;
      }

      placeFortress(coord);
    },
    [placeFortress, selectFortress, setBuildMessage, setSpawnFormOpen]
  );

  return (
    <Instances
      limit={tiles.length}
      castShadow
      receiveShadow
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
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
  const color = useMemo(() => {
    const base = new Color(theme.terrain[tile.kind].color);
    // Pull neighboring biomes toward the grass family so the board reads as
    // one landscape rather than four unrelated color blocks.
    if (tile.kind !== "grass" && tile.kind !== "water") {
      base.lerp(new Color(theme.terrain.grass.color), 0.24);
    }
    const variation = hashString(`${WORLD_SEED}:tile:${coordKey(tile.coord)}`) / 0xffffffff;
    base.offsetHSL(0, (variation - 0.5) * 0.035, (variation - 0.5) * 0.075);
    return `#${base.getHexString()}`;
  }, [theme, tile.coord, tile.kind]);
  return <Instance position={[x, HEX_HEIGHT / 2 + tile.height, z]} color={color} />;
}

function HoveredTileHighlight({ theme }: { theme: typeof medievalTheme }) {
  const hoveredCoord = useWorldStore((state) => state.hoveredCoord);
  const hoveredTile = useWorldStore(selectHoveredTile);

  if (!hoveredCoord || !hoveredTile) return null;

  return <TileHighlight coord={hoveredCoord} height={hoveredTile.height} theme={theme} />;
}
