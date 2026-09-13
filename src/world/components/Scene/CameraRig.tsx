"use client";

import { useEffect, useRef, useState, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { hexToWorld } from "@/world/core/hex";
import { CAMERA, HEX_SIZE, TIP_ANIMATION } from "@/world/config/world.config";
import { REGISTER_MOUNTAIN } from "@/world/config/mountain";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectCameraFocus, selectWorldRadius } from "@/world/state/selectors";

/** Fraction of the remaining distance covered each frame — frame-rate compensated below. */
const FOCUS_EASE_PER_SECOND = 4.5;
/** Under this distance/delta the glide is done; snapping the rest avoids an endless asymptote. */
const FOCUS_ARRIVAL = 0.02;
const FOCUS_DISTANCE_ARRIVAL = 0.05;

/** How long the wide establishing shot holds before easing into the default play framing. */
const INTRO_HOLD_SECONDS = 1.1;
const INTRO_EASE_SECONDS = 2.1;
/** Margin (world units) added around the framed content so nothing sits flush against the frustum edge. */
const INTRO_FRAME_MARGIN = 5;

interface CameraRigProps {
  /**
   * Only `/` renders `RegisterMountainScenery` — pass this so the first-load establishing shot
   * widens to frame the register mountain alongside the castles instead of leaving it just off
   * the edge of the default centered view (it sits well outside `WORLD_RADIUS`, at
   * `REGISTER_MOUNTAIN.placement`'s angle, precisely so it never crowds a castle).
   */
  includeRegisterMountain?: boolean;
}

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
export function CameraRig({ includeRegisterMountain = false }: CameraRigProps) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const focus = useWorldStore(selectCameraFocus);
  const tip = useWorldStore((state) => state.tipCelebration);
  const fortressList = useWorldStore((state) => state.fortressList);
  const worldRadius = useWorldStore(selectWorldRadius);
  const [introActive, setIntroActive] = useState(false);
  const intro = useRef<{ startCameraPos: Vector3; startTarget: Vector3; startedAt: number | null } | null>(null);
  const introRan = useRef(false);
  const desiredTarget = useRef<Vector3 | null>(null);
  const desiredDistance = useRef<number | null>(null);
  const offsetScratch = useRef(new Vector3());
  const targetScratch = useRef(new Vector3());
  const cameraGoalScratch = useRef(new Vector3());
  const cinematicSnapshot = useRef<{ target: Vector3; distance: number } | null>(null);
  const cinematicPath = useRef<{
    fortress: Vector3;
    source: Vector3;
    launch: Vector3;
    exit: Vector3;
    outward: Vector3;
    right: Vector3;
  } | null>(null);
  const cinematicStartedAt = useRef<number | null>(null);
  const activeTipId = useRef<number | null>(null);

  // First-load establishing shot (task: register mountain gets lost in the default centered
  // framing). On `/` (`includeRegisterMountain`) the mountain's position never depends on the
  // wallet's scan — it's placed off `worldRadius`, known from the store's very first render — so
  // it's the *new* user with zero names yet who most needs this shot, and the effect must not
  // wait on `fortressList` to fire. Off `/`, there's nothing to frame until names resolve, so it
  // does wait there — an empty list mid-scan would just be an establishing shot over bare
  // terrain, then a jump-cut once castles arrive. Waits for `controlsRef` too since it sets the
  // controls' target directly, ahead of the OrbitControls default of the origin.
  useEffect(() => {
    if (introRan.current) return;
    const controls = controlsRef.current;
    if (!controls) return;
    if (fortressList.length === 0 && !includeRegisterMountain) return;
    introRan.current = true;

    const points = [new Vector3(0, 0, 0)];
    for (const fortress of fortressList) {
      const [x, z] = hexToWorld(fortress.coord);
      points.push(new Vector3(x, 0, z));
    }
    if (includeRegisterMountain) {
      const ringRadiusHexes = worldRadius + REGISTER_MOUNTAIN.placement.edgeMarginHexes;
      const radiusWorldUnits = ringRadiusHexes * HEX_SIZE * REGISTER_MOUNTAIN.placement.ringSpacingWorldUnits;
      points.push(
        new Vector3(
          radiusWorldUnits * Math.cos(REGISTER_MOUNTAIN.placement.angleRad),
          0,
          radiusWorldUnits * Math.sin(REGISTER_MOUNTAIN.placement.angleRad)
        )
      );
    }

    const center = new Vector3();
    for (const point of points) center.add(point);
    center.divideScalar(points.length);
    let maxRadius = 0;
    for (const point of points) maxRadius = Math.max(maxRadius, point.distanceTo(center));

    // Nothing beyond the origin to widen for (e.g. still-empty portfolio, no mountain on this
    // route) — the default centered framing already covers it.
    if (maxRadius < 1) return;

    const fovRad = (CAMERA.fov * Math.PI) / 180;
    const fitDistance = (maxRadius + INTRO_FRAME_MARGIN) / Math.sin(fovRad / 2);
    const distance = Math.max(CAMERA.maxDistance * 1.15, fitDistance);

    // Same viewing angle as the default framing, just pulled back and centered on the wider
    // scene — the establishing shot should read as "the same camera, zoomed out," not a
    // different perspective the player then has to reconcile.
    const direction = new Vector3(...CAMERA.position).normalize();
    const introCameraPos = center.clone().addScaledVector(direction, distance);

    // Widen the live controls' clamp directly — the `maxDistance` prop below stays pinned at
    // `CAMERA.maxDistance`, so drei never re-syncs it away from this override; the `useFrame`
    // handler below sets it back once the establishing shot hands off to gameplay.
    controls.maxDistance = distance;
    camera.position.copy(introCameraPos);
    controls.target.copy(center);
    controls.update();

    intro.current = { startCameraPos: introCameraPos.clone(), startTarget: center.clone(), startedAt: null };
    // One-shot kickoff guarded by `introRan`, mirrors the imperative camera/controls writes above — it cannot cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntroActive(true);
  }, [camera, fortressList, includeRegisterMountain, worldRadius]);

  useEffect(() => {
    if (!focus || tip) return;
    const [x, z] = focus.position;
    desiredTarget.current = new Vector3(x, 0, z);
    desiredDistance.current = CAMERA.focusDistance;
    // `token` changes even when the same object is re-clicked, so the effect
    // re-runs and the camera glides back to it.
  }, [focus, tip]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (tip) {
      if (activeTipId.current === tip.id) return;
      cinematicSnapshot.current = {
        target: controls.target.clone(),
        distance: camera.position.distanceTo(controls.target),
      };
      activeTipId.current = tip.id;
      cinematicStartedAt.current = null;
      const fortress = fortressList.find((entry) => entry.ensKey === tip.targetFortressId);
      if (fortress) {
        const [x, z] = hexToWorld(fortress.coord);
        const center = new Vector3(x, 0, z);
        const outward = new Vector3(
          Math.cos(tip.formationSeed * Math.PI * 2),
          0,
          Math.sin(tip.formationSeed * Math.PI * 2)
        );
        const totalUnits = tip.units.messenger + tip.units.ballista + tip.units.catapult;
        const rows = Math.ceil(Math.min(12, totalUnits) / 4);
        const centerDepth = Math.max(0, rows - 1) * TIP_ANIMATION.formationRowSpacing * 0.5;
        const source = center.clone().addScaledVector(outward, TIP_ANIMATION.sourceDistance + centerDepth);
        const launch = center.clone().addScaledVector(outward, TIP_ANIMATION.launchDistance + centerDepth);
        cinematicPath.current = {
          fortress: center,
          source,
          launch,
          exit: source.clone().addScaledVector(outward, TIP_ANIMATION.formationExitDistance),
          outward,
          right: new Vector3(-outward.z, 0, outward.x),
        };
        desiredTarget.current = null;
        desiredDistance.current = null;
      }
      return;
    }

    if (activeTipId.current === null) return;
    const snapshot = cinematicSnapshot.current;
    if (snapshot) {
      desiredTarget.current = snapshot.target;
      desiredDistance.current = Math.min(CAMERA.maxDistance, Math.max(CAMERA.minDistance, snapshot.distance));
    }
    cinematicSnapshot.current = null;
    cinematicPath.current = null;
    cinematicStartedAt.current = null;
    activeTipId.current = null;
  }, [camera, fortressList, tip]);

  useFrame((frame, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const t = Math.min(1, FOCUS_EASE_PER_SECOND * delta);

    const introShot = intro.current;
    if (introShot) {
      if (introShot.startedAt === null) introShot.startedAt = frame.clock.elapsedTime;
      const elapsed = frame.clock.elapsedTime - introShot.startedAt;
      if (elapsed < INTRO_HOLD_SECONDS) {
        controls.update();
        return;
      }
      const progress = clamp01((elapsed - INTRO_HOLD_SECONDS) / INTRO_EASE_SECONDS);
      const eased = easeInOutCubic(progress);
      camera.position.lerpVectors(introShot.startCameraPos, targetScratch.current.set(...CAMERA.position), eased);
      controls.target.lerpVectors(introShot.startTarget, cameraGoalScratch.current.set(0, 0, 0), eased);
      controls.update();
      if (progress >= 1) {
        controls.maxDistance = CAMERA.maxDistance;
        intro.current = null;
        setIntroActive(false);
      }
      return;
    }

    const path = cinematicPath.current;
    if (tip && path) {
      if (cinematicStartedAt.current === null) cinematicStartedAt.current = frame.clock.elapsedTime;
      const elapsed = frame.clock.elapsedTime - cinematicStartedAt.current;
      const followTarget = targetScratch.current;

      if (elapsed < TIP_ANIMATION.formationApproachSec) {
        const progress = easeInOutCubic(clamp01(elapsed / TIP_ANIMATION.formationApproachSec));
        followTarget.lerpVectors(path.source, path.launch, progress);
      } else if (elapsed < TIP_ANIMATION.formationExitAtSec) {
        // Bias toward the castle during the volley so both the firing line and impact remain in shot.
        followTarget.lerpVectors(path.launch, path.fortress, 0.28);
      } else {
        const progress = easeInOutCubic(clamp01(
          (elapsed - TIP_ANIMATION.formationExitAtSec - 0.22) / (TIP_ANIMATION.formationExitSec - 0.22)
        ));
        followTarget.lerpVectors(path.launch, path.exit, progress);
      }

      const cameraGoal = cameraGoalScratch.current.copy(followTarget);
      if (elapsed < TIP_ANIMATION.formationApproachSec) {
        // Rear three-quarter tracking shot: readable silhouettes and visible travel direction.
        cameraGoal
          .addScaledVector(path.outward, 9.5)
          .addScaledVector(path.right, 10.5);
        cameraGoal.y += 8.5;
      } else if (elapsed < TIP_ANIMATION.formationExitAtSec) {
        // Broadside hero shot holds the firing line and the fortress in the same composition.
        cameraGoal
          .addScaledVector(path.outward, 6.5)
          .addScaledVector(path.right, 14.5);
        cameraGoal.y += 10.5;
      } else {
        // Follow from inside the battlefield as the company marches back beyond the map edge.
        cameraGoal
          .addScaledVector(path.outward, -8)
          .addScaledVector(path.right, 8.5);
        cameraGoal.y += 8;
      }

      controls.target.lerp(followTarget, t);
      camera.position.lerp(cameraGoal, Math.min(1, TIP_ANIMATION.cameraShotEasePerSecond * delta));
      controls.update();
      return;
    }

    const target = desiredTarget.current;
    const distance = desiredDistance.current;
    if (!target && distance === null) return;

    if (target) {
      if (controls.target.distanceTo(target) < FOCUS_ARRIVAL) {
        controls.target.copy(target);
        desiredTarget.current = null;
      } else {
        controls.target.lerp(target, t);
      }
    }

    if (distance !== null) {
      const offset = offsetScratch.current.copy(camera.position).sub(controls.target);
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
      enableRotate={!tip && !introActive}
      enableZoom={!tip && !introActive}
      minDistance={CAMERA.minDistance}
      maxDistance={CAMERA.maxDistance}
      minPolarAngle={CAMERA.minPolarAngle}
      maxPolarAngle={CAMERA.maxPolarAngle}
      makeDefault
    />
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}
