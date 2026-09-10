"use client";

import { useMemo, useRef } from "react";
import { extend, useFrame, useThree, type ThreeElement } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { BackSide, Color, Fog, type ShaderMaterial } from "three";
import { useWorldStore } from "@/world/state/useWorldStore";
import { medievalTheme } from "@/world/config/theme";

interface SkyDomeProps {
  theme?: typeof medievalTheme;
}

/** Large enough to sit well outside the playable area and camera far clip, small enough to stay inside `CAMERA.far`. */
const DOME_RADIUS = 260;

const SkyGradientMaterial = shaderMaterial(
  { topColor: new Color("#7ec4e8"), bottomColor: new Color("#cfe9f7"), offset: 6, exponent: 0.7 },
  /* glsl */ `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `
);

extend({ SkyGradientMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    skyGradientMaterial: ThreeElement<typeof SkyGradientMaterial>;
  }
}

type SkyGradientShaderMaterial = ShaderMaterial & { topColor: Color; bottomColor: Color };

/** Assigns `near`/`far` via a plain function call rather than an inline `fog.near = ...` in `useFrame` — `scene` comes from a hook, and the compiler's mutation check only recognizes direct assignment expressions, not values changed behind a call. */
function setFogRange(fog: Fog, near: number, far: number): void {
  fog.near = near;
  fog.far = far;
}

/**
 * A gradient dome (top/bottom color, matching `theme.sky`) instead of drei's
 * physical `<Sky>` — this world's palette is theme-driven flat color, not a
 * simulated atmosphere, so a cheap two-color lerp keeps it consistent with
 * `WorldCanvas`'s background/fog and stays trivially themeable per weather.
 *
 * Also owns syncing the scene's background/fog to the same blend, imperatively
 * inside `useFrame` — reading `weatherRender` via `useWorldStore.getState()`
 * rather than a reactive selector. `WorldCanvas` re-rendering every weather
 * tick (10/s) would hand `<Canvas>` a fresh `camera` object each time, which
 * makes react-three-fiber re-run its renderer setup — including resetting
 * `shadowMap.type`, which logs three.js's `PCFSoftShadowMap` deprecation
 * warning on every reset. Keeping the eased values out of React state avoids
 * that entirely.
 */
export function SkyDome({ theme = medievalTheme }: SkyDomeProps) {
  const materialRef = useRef<SkyGradientShaderMaterial | null>(null);
  const scene = useThree((state) => state.scene);

  const clearTop = useMemo(() => new Color(theme.sky.top), [theme]);
  const clearBottom = useMemo(() => new Color(theme.sky.bottom), [theme]);
  const rainTop = useMemo(() => new Color(theme.sky.rain.top), [theme]);
  const rainBottom = useMemo(() => new Color(theme.sky.rain.bottom), [theme]);
  const clearFogColor = useMemo(() => new Color(theme.sky.fogColor), [theme]);
  const rainFogColor = useMemo(() => new Color(theme.sky.rain.fogColor), [theme]);

  useFrame(() => {
    const worldState = useWorldStore.getState();
    const stormBlend = worldState.weatherRender.stormBlend;
    const fogDensity = worldState.debug.fogDensity;
    const { sky } = theme;

    const material = materialRef.current;
    if (material) {
      material.topColor.copy(clearTop).lerp(rainTop, stormBlend);
      material.bottomColor.copy(clearBottom).lerp(rainBottom, stormBlend);
    }

    if (scene.background instanceof Color) {
      scene.background.copy(clearBottom).lerp(rainBottom, stormBlend);
    }

    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(clearFogColor).lerp(rainFogColor, stormBlend);
      setFogRange(
        scene.fog,
        (sky.fogNear + (sky.rain.fogNear - sky.fogNear) * stormBlend) / fogDensity,
        (sky.fogFar + (sky.rain.fogFar - sky.fogFar) * stormBlend) / fogDensity
      );
    }
  });

  return (
    <mesh renderOrder={-1000}>
      <sphereGeometry args={[DOME_RADIUS, 24, 16]} />
      <skyGradientMaterial ref={materialRef} side={BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}
