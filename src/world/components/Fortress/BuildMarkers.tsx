"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MeshBasicMaterial } from "three";
import { RingGeometry } from "three";
import { coordKey, hexToWorld } from "@/world/core/hex";
import { HEX_HEIGHT, HEX_SIZE } from "@/world/config/world.config";
import { medievalTheme } from "@/world/config/theme";
import type { AxialCoord, Tile } from "@/world/core/types";

const markerGeometry = new RingGeometry(HEX_SIZE * 0.55, HEX_SIZE * 0.72, 6);

interface BuildMarkersProps {
  coords: AxialCoord[];
  tiles: Map<string, Tile>;
  theme?: typeof medievalTheme;
}

/**
 * Subtle pulsing rings over every valid build target. One `useFrame` drives
 * every marker's opacity in lockstep via ref callbacks, so the pulse cost is
 * a single sine evaluation per frame regardless of how many markers exist.
 */
export function BuildMarkers({ coords, tiles, theme = medievalTheme }: BuildMarkersProps) {
  const materials = useRef(new Map<string, MeshBasicMaterial>());

  useFrame(({ clock }) => {
    const opacity = 0.25 + Math.sin(clock.elapsedTime * 2.4) * 0.2;
    materials.current.forEach((material) => {
      material.opacity = opacity;
    });
  });

  return (
    <>
      {coords.map((coord) => {
        const key = coordKey(coord);
        const tile = tiles.get(key);
        const [x, z] = hexToWorld(coord);
        const y = HEX_HEIGHT + (tile?.height ?? 0) + 0.02;
        return (
          <mesh key={key} geometry={markerGeometry} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <meshBasicMaterial
              ref={(material) => {
                if (material) materials.current.set(key, material);
                else materials.current.delete(key);
              }}
              color={theme.terrain.highlight.color}
              transparent
              opacity={0.4}
            />
          </mesh>
        );
      })}
    </>
  );
}
