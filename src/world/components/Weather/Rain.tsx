"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, type LineSegments } from "three";
import { useWorldStore } from "@/world/state/useWorldStore";
import { medievalTheme } from "@/world/config/theme";
import { WEATHER } from "@/world/config/world.config";
import { createRng, hashString } from "@/world/core/rng";

interface RainProps {
  theme?: typeof medievalTheme;
}

const [BOX_WIDTH, BOX_HEIGHT, BOX_DEPTH] = WEATHER.rainBoxSize;
/** World units above the ground the rain box's local origin sits at. */
const BOX_BASE_Y = 3;
const STREAK_LENGTH = 0.6;

/** Each streak's two endpoints (top, bottom), one per row — seeded once and read back from the geometry's own attribute at fall-time, so no separate bookkeeping array is needed. */
function buildRainGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 6);
  const rng = createRng(hashString("weather-rain"));

  for (let i = 0; i < count; i++) {
    const x = (rng.next() * 2 - 1) * (BOX_WIDTH / 2);
    const y = rng.next() * BOX_HEIGHT;
    const z = (rng.next() * 2 - 1) * (BOX_DEPTH / 2);
    const base = i * 6;
    positions[base] = x;
    positions[base + 1] = y;
    positions[base + 2] = z;
    positions[base + 3] = x;
    positions[base + 4] = y - STREAK_LENGTH;
    positions[base + 5] = z;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return geometry;
}

/**
 * A single `LineSegments` of `WEATHER.rainDropCount` streaks falling within a
 * box centered on the camera target (fixed at the world origin — `CameraRig`
 * never pans), recycled at the top when they pass the bottom. `useFrame`
 * mutates the mounted mesh's own geometry/material (reached through its
 * `ref`, never a closed-over build-time variable) in place — nothing is
 * reallocated per frame, so a storm's cost stays flat regardless of length.
 */
export function Rain({ theme = medievalTheme }: RainProps) {
  const geometry = useMemo(() => buildRainGeometry(WEATHER.rainDropCount), []);
  const material = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color(theme.weather.rainColor),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [theme]
  );

  const meshRef = useRef<LineSegments>(null);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const meshMaterial = mesh.material as LineBasicMaterial;
    const density = useWorldStore.getState().weatherRender.rainDensity;
    meshMaterial.opacity = density * 0.55;
    if (density <= 0.005) return;

    const attr = mesh.geometry.getAttribute("position") as BufferAttribute;
    const array = attr.array as Float32Array;
    const fall = WEATHER.rainFallSpeed * delta;
    const streakCount = array.length / 6;

    for (let i = 0; i < streakCount; i++) {
      const base = i * 6;
      let y = array[base + 1] - fall;
      if (y < -STREAK_LENGTH) y += BOX_HEIGHT;
      array[base + 1] = y;
      array[base + 4] = y - STREAK_LENGTH;
    }
    attr.needsUpdate = true;
  });

  return (
    <lineSegments
      ref={meshRef}
      args={[geometry, material]}
      position={[0, BOX_BASE_Y, 0]}
      frustumCulled={false}
      renderOrder={10}
    />
  );
}
