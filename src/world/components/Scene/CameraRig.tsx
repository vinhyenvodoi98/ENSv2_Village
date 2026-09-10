"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { CAMERA } from "@/world/config/world.config";
import { hexToWorld } from "@/world/core/hex";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectCameraFocus } from "@/world/state/selectors";

/** Fraction of the remaining distance covered each frame — frame-rate compensated below. */
const FOCUS_EASE_PER_SECOND = 4.5;
/** Under this distance the glide is done; snapping the rest avoids an endless asymptote. */
const FOCUS_ARRIVAL = 0.02;

/**
 * Fixed-tilt orbital rig — the strategy-game read, not a free-fly camera.
 * Polar angle and zoom are clamped in config.
 *
 * Also services `cameraFocus`: selecting a child agent in the detail panel
 * flies the map to that castle rather than only swapping the panel's contents,
 * so "who is my child" is answered on the map, not just in a list. The camera
 * keeps its current orbit offset — only the look-at target moves — so a
 * fly-to never fights the user's chosen angle.
 */
export function CameraRig() {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const focus = useWorldStore(selectCameraFocus);
  const desired = useRef<Vector3 | null>(null);

  useEffect(() => {
    if (!focus) return;
    const [x, z] = hexToWorld(focus.coord);
    desired.current = new Vector3(x, 0, z);
    // `token` changes even when the same castle is re-selected, so the effect
    // re-runs and the camera glides back to it.
  }, [focus]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const target = desired.current;
    if (!controls || !target) return;

    if (controls.target.distanceTo(target) < FOCUS_ARRIVAL) {
      controls.target.copy(target);
      desired.current = null;
    } else {
      controls.target.lerp(target, Math.min(1, FOCUS_EASE_PER_SECOND * delta));
    }
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      // No `target` prop: it defaults to the origin, and passing a fresh array
      // literal each render would let drei snap the target back mid-glide.
      enablePan={false}
      minDistance={CAMERA.minDistance}
      maxDistance={CAMERA.maxDistance}
      minPolarAngle={CAMERA.minPolarAngle}
      maxPolarAngle={CAMERA.maxPolarAngle}
      makeDefault
    />
  );
}
