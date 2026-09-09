"use client";

import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei";
import { medievalTheme } from "@/world/config/theme";
import { CAMERA, RENDER } from "@/world/config/world.config";
import { Lighting } from "./Lighting";
import { CameraRig } from "./CameraRig";
import { Ground } from "../Terrain/Ground";
import { HexGrid } from "../Terrain/HexGrid";

/**
 * Root of the 3D world. The only place a `<Canvas>` is created — everything
 * else in `src/world/components/` renders inside it.
 */
export function WorldCanvas() {
  const theme = medievalTheme;

  return (
    <Canvas
      shadows
      dpr={RENDER.dpr}
      camera={{
        position: CAMERA.position,
        fov: CAMERA.fov,
        near: CAMERA.near,
        far: CAMERA.far,
      }}
      style={{ background: theme.sky.bottom }}
    >
      <color attach="background" args={[theme.sky.bottom]} />
      <fog attach="fog" args={[theme.sky.fogColor, theme.sky.fogNear, theme.sky.fogFar]} />
      <AdaptiveDpr pixelated />
      <Lighting theme={theme} />
      <CameraRig />
      <Ground theme={theme} />
      <HexGrid />
    </Canvas>
  );
}
