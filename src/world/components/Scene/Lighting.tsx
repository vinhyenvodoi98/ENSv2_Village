"use client";

import { medievalTheme } from "@/world/config/theme";
import { LIGHTING, RENDER } from "@/world/config/world.config";
import { useWorldStore } from "@/world/state/useWorldStore";

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

export function Lighting({ theme = medievalTheme }: LightingProps) {
  const { lighting } = theme;
  const sunAngleDeg = useWorldStore((state) => state.debug.sunAngleDeg);
  const sunPosition = sunPositionFromAngle(sunAngleDeg);

  return (
    <>
      <ambientLight color={lighting.ambientColor} intensity={lighting.ambientIntensity} />
      <hemisphereLight
        color={lighting.hemisphereSkyColor}
        groundColor={lighting.hemisphereGroundColor}
        intensity={lighting.hemisphereIntensity}
      />
      <directionalLight
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
