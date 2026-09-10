"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { AmbientLight, DirectionalLight } from "three";
import { medievalTheme } from "@/world/config/theme";
import { LIGHTING, RENDER } from "@/world/config/world.config";
import { useWorldStore } from "@/world/state/useWorldStore";
import { blendWeatherSky } from "@/world/systems/weatherSystem";

interface LightingProps {
  theme?: typeof medievalTheme;
}

const SUN_RADIUS = Math.hypot(LIGHTING.directionalPosition[0], LIGHTING.directionalPosition[2]);
const SUN_HEIGHT = LIGHTING.directionalPosition[1];

/** Sun angle (degrees, around the world's vertical axis) -> light position. */
function sunPositionFromAngle(deg: number): [number, number, number] {
  const rad = (deg * Math.PI) / 180;
  return [Math.cos(rad) * SUN_RADIUS, SUN_HEIGHT, Math.sin(rad) * SUN_RADIUS];
}

/**
 * Ambient/directional intensity are eased toward `theme.sky.rain`'s
 * multipliers imperatively in `useFrame` (reading `weatherRender` via
 * `useWorldStore.getState()`), not through a reactive selector — see the note
 * on `WorldCanvas` for why a component re-rendering on every weather tick is
 * a real cost here (it retriggers react-three-fiber's renderer setup, which
 * spams the `PCFSoftShadowMap` deprecation warning).
 */
export function Lighting({ theme = medievalTheme }: LightingProps) {
  const { lighting } = theme;
  const sunAngleDeg = useWorldStore((state) => state.debug.sunAngleDeg);
  const sunPosition = sunPositionFromAngle(sunAngleDeg);

  const ambientRef = useRef<AmbientLight>(null);
  const directionalRef = useRef<DirectionalLight>(null);

  useFrame(() => {
    const stormBlend = useWorldStore.getState().weatherRender.stormBlend;
    const skyBlend = blendWeatherSky(theme, stormBlend);
    if (ambientRef.current) {
      ambientRef.current.intensity = lighting.ambientIntensity * skyBlend.ambientMultiplier;
    }
    if (directionalRef.current) {
      directionalRef.current.intensity = lighting.directionalIntensity * skyBlend.directionalMultiplier;
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} color={lighting.ambientColor} intensity={lighting.ambientIntensity} />
      <hemisphereLight
        color={lighting.hemisphereSkyColor}
        groundColor={lighting.hemisphereGroundColor}
        intensity={lighting.hemisphereIntensity}
      />
      <directionalLight
        ref={directionalRef}
        color={lighting.directionalColor}
        intensity={lighting.directionalIntensity}
        position={sunPosition}
        castShadow
        shadow-mapSize={[RENDER.shadowMapSize, RENDER.shadowMapSize]}
        shadow-camera-left={-LIGHTING.shadowCameraBounds}
        shadow-camera-right={LIGHTING.shadowCameraBounds}
        shadow-camera-top={LIGHTING.shadowCameraBounds}
        shadow-camera-bottom={-LIGHTING.shadowCameraBounds}
        shadow-camera-near={LIGHTING.shadowCameraNear}
        shadow-camera-far={LIGHTING.shadowCameraFar}
      />
    </>
  );
}
