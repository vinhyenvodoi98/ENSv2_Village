"use client";

import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei";
import { resolvePreset } from "@/world/config/presets";
import { CAMERA, RENDER } from "@/world/config/world.config";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectPresetName } from "@/world/state/selectors";
import { Lighting } from "./Lighting";
import { CameraRig } from "./CameraRig";
import { Ground } from "../Terrain/Ground";
import { HexGrid } from "../Terrain/HexGrid";
import { FortressLayer } from "../Fortress/FortressLayer";

/**
 * Root of the 3D world. The only place a `<Canvas>` is created — everything
 * else in `src/world/components/` renders inside it. The active preset lives
 * in the store, so switching it re-renders this tree with a new `theme`
 * reference — never a remount of the `<Canvas>` itself.
 */
export function WorldCanvas() {
  const presetName = useWorldStore(selectPresetName);
  const fogDensity = useWorldStore((state) => state.debug.fogDensity);
  const { preset, theme } = resolvePreset(presetName);

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
      <fog
        attach="fog"
        args={[theme.sky.fogColor, theme.sky.fogNear / fogDensity, theme.sky.fogFar / fogDensity]}
      />
      <AdaptiveDpr pixelated />
      <Lighting theme={theme} />
      <CameraRig />
      <Ground theme={theme} />
      <HexGrid theme={theme} />
      <FortressLayer theme={theme} kitId={preset.fortressKit} />
    </Canvas>
  );
}
