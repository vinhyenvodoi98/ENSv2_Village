"use client";

import { medievalTheme } from "@/world/config/theme";
import { LIGHTING, RENDER } from "@/world/config/world.config";

interface LightingProps {
  theme?: typeof medievalTheme;
}

export function Lighting({ theme = medievalTheme }: LightingProps) {
  const { lighting } = theme;

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
        position={LIGHTING.directionalPosition}
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
