"use client";

import { OrbitControls } from "@react-three/drei";
import { CAMERA } from "@/world/config/world.config";

/**
 * Fixed-tilt orbital rig looking at the origin — the strategy-game read, not a
 * free-fly camera. Polar angle and zoom are clamped in config.
 */
export function CameraRig() {
  return (
    <OrbitControls
      target={[0, 0, 0]}
      enablePan={false}
      minDistance={CAMERA.minDistance}
      maxDistance={CAMERA.maxDistance}
      minPolarAngle={CAMERA.minPolarAngle}
      maxPolarAngle={CAMERA.maxPolarAngle}
      makeDefault
    />
  );
}
