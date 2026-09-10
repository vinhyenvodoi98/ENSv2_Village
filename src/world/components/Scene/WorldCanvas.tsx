"use client";

import { useMemo } from "react";
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
import { RoadNetwork } from "../Roads/RoadNetwork";
import { CitizenCrowd } from "../Citizens/CitizenCrowd";
import { SkyDome } from "../Weather/SkyDome";
import { Clouds } from "../Weather/Clouds";
import { Rain } from "../Weather/Rain";
import { WebGLContextRecovery } from "./WebGLContextRecovery";
import { ForestRing } from "../Terrain/ForestRing";
import { FlowingStream } from "../Terrain/FlowingStream";

/**
 * Root of the 3D world. The only place a `<Canvas>` is created — everything
 * else in `src/world/components/` renders inside it. The active preset lives
 * in the store, so switching it re-renders this tree with a new `theme`
 * reference — never a remount of the `<Canvas>` itself.
 *
 * Deliberately does *not* subscribe to `weatherRender` here: `<Canvas>` props
 * like `camera` are plain object literals, and re-rendering this component on
 * every weather tick (10/s) would hand react-three-fiber a "new" camera each
 * time, making it re-run renderer setup — including resetting
 * `shadowMap.type`, which spams three.js's `PCFSoftShadowMap` deprecation
 * warning. `SkyDome` owns easing the background/fog toward the storm blend
 * imperatively instead; the `<color>`/`<fog>` below are just the initial
 * (clear-weather) values.
 */
export function WorldCanvas() {
  const presetName = useWorldStore(selectPresetName);
  const fogDensity = useWorldStore((state) => state.debug.fogDensity);
  const { preset, theme } = resolvePreset(presetName);
  const camera = useMemo(
    () => ({ position: CAMERA.position, fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far }),
    []
  );

  return (
    <Canvas shadows dpr={RENDER.dpr} camera={camera} style={{ background: theme.sky.bottom }}>
      <WebGLContextRecovery />
      <color attach="background" args={[theme.sky.bottom]} />
      <fog attach="fog" args={[theme.sky.fogColor, theme.sky.fogNear / fogDensity, theme.sky.fogFar / fogDensity]} />
      <AdaptiveDpr pixelated />
      <SkyDome theme={theme} />
      <Clouds theme={theme} />
      <Rain theme={theme} />
      <Lighting theme={theme} />
      <CameraRig />
      <Ground theme={theme} />
      <FlowingStream theme={theme} />
      <ForestRing theme={theme} />
      <HexGrid theme={theme} />
      <RoadNetwork theme={theme} />
      <FortressLayer theme={theme} kitId={preset.fortressKit} />
      <CitizenCrowd theme={theme} />
    </Canvas>
  );
}
