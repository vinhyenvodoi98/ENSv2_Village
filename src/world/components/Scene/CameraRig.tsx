"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { CAMERA } from "@/world/config/world.config";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectCameraFocus } from "@/world/state/selectors";

/** Fraction of the remaining distance covered each frame — frame-rate compensated below. */
const FOCUS_EASE_PER_SECOND = 4.5;
/** Under this distance/delta the glide is done; snapping the rest avoids an endless asymptote. */
const FOCUS_ARRIVAL = 0.02;
const FOCUS_DISTANCE_ARRIVAL = 0.05;

/**
 * Fixed-tilt orbital rig — the strategy-game read, not a free-fly camera.
 * Polar angle and zoom are clamped in config.
 *
 * Also services `cameraFocus`: clicking a castle (or any other focusable object on the map, e.g.
 * `RegisterMountainScenery`) re-centers the orbit on it *and* dollies in to `CAMERA.focusDistance`,
 * and selecting a child agent in the detail panel does the same — "who is my child" gets answered
 * on the map, not just in a list. Only the look-at target and the radial distance move; azimuth and
 * polar angle are read straight off the camera's current offset from the target, so a fly-to never
 * fights the user's chosen viewing angle.
 */
export function CameraRig() {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const focus = useWorldStore(selectCameraFocus);
  const desiredTarget = useRef<Vector3 | null>(null);
  const desiredDistance = useRef<number | null>(null);

  useEffect(() => {
    if (!focus) return;
    const [x, z] = focus.position;
    desiredTarget.current = new Vector3(x, 0, z);
    desiredDistance.current = CAMERA.focusDistance;
    // `token` changes even when the same object is re-clicked, so the effect
    // re-runs and the camera glides back to it.
  }, [focus]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const target = desiredTarget.current;
    const distance = desiredDistance.current;
    if (!target && distance === null) return;

    const t = Math.min(1, FOCUS_EASE_PER_SECOND * delta);

    if (target) {
      if (controls.target.distanceTo(target) < FOCUS_ARRIVAL) {
        controls.target.copy(target);
        desiredTarget.current = null;
      } else {
        controls.target.lerp(target, t);
      }
    }

    if (distance !== null) {
      const offset = camera.position.clone().sub(controls.target);
      const currentDistance = offset.length();
      if (Math.abs(currentDistance - distance) < FOCUS_DISTANCE_ARRIVAL) {
        camera.position.copy(controls.target).add(offset.setLength(distance));
        desiredDistance.current = null;
      } else {
        const nextDistance = currentDistance + (distance - currentDistance) * t;
        camera.position.copy(controls.target).add(offset.setLength(nextDistance));
      }
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
