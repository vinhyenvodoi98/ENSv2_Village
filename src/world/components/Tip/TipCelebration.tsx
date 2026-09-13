"use client";

/* eslint-disable react-hooks/refs -- The R3F rig passes stable ref objects to JSX `ref` props;
   `.current` is only read and mutated inside `useFrame`, never during React render. */

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils, Mesh, PointLight, Quaternion, Vector3 } from "three";
import { coordKey, hexToWorld, worldToHex } from "@/world/core/hex";
import { HEX_HEIGHT, SCENERY, TIP_ANIMATION } from "@/world/config/world.config";
import { useWorldStore, type TipDeliveryTier, type TipUnitCounts } from "@/world/state/useWorldStore";
import type { WorldTheme } from "@/world/config/theme";
import type { Tile } from "@/world/core/types";

const UP = new Vector3(0, 1, 0);
const BEAM_DELTA = new Vector3();
const BEAM_MIDPOINT = new Vector3();
const BEAM_QUATERNION = new Quaternion();
const ARCHER_STRING_TOP = new Vector3(0.11, 1.52, 0.31);
const ARCHER_STRING_BOTTOM = new Vector3(0.11, 0.7, 0.31);
const ARCHER_NOCK = new Vector3();
const BALLISTA_STRING_LEFT = new Vector3(-0.88, 1.01, 0.2);
const BALLISTA_STRING_RIGHT = new Vector3(0.88, 1.01, 0.2);
const BALLISTA_NOCK = new Vector3();

interface DeliveryRig {
  archerBody: RefObject<Group | null>;
  archerLeftLeg: RefObject<Group | null>;
  archerRightLeg: RefObject<Group | null>;
  archerBowArm: RefObject<Group | null>;
  archerDrawArm: RefObject<Group | null>;
  archerBow: RefObject<Group | null>;
  archerStringTop: RefObject<Mesh | null>;
  archerStringBottom: RefObject<Mesh | null>;
  archerLoadedArrow: RefObject<Group | null>;
  siegeBody: RefObject<Group | null>;
  wheelFrontLeft: RefObject<Group | null>;
  wheelFrontRight: RefObject<Group | null>;
  wheelRearLeft: RefObject<Group | null>;
  wheelRearRight: RefObject<Group | null>;
  ballistaBow: RefObject<Group | null>;
  ballistaStringLeft: RefObject<Mesh | null>;
  ballistaStringRight: RefObject<Mesh | null>;
  ballistaLoadedBolt: RefObject<Group | null>;
  catapultArm: RefObject<Group | null>;
  catapultPayload: RefObject<Mesh | null>;
}

export function TipCelebrationLayer({ theme }: { theme: WorldTheme }) {
  const tip = useWorldStore((state) => state.tipCelebration);
  const fortressList = useWorldStore((state) => state.fortressList);
  const tiles = useWorldStore((state) => state.tiles);
  const finish = useWorldStore((state) => state.finishTipCelebration);

  if (!tip) return null;
  const fortress = fortressList.find((entry) => entry.ensKey === tip.targetFortressId);
  if (!fortress) return null;
  const tile = tiles.get(coordKey(fortress.coord));
  const [x, z] = hexToWorld(fortress.coord);
  const y = HEX_HEIGHT + (tile?.height ?? 0);

  return (
    <TipFormation
      key={tip.id}
      id={tip.id}
      unitCounts={tip.units}
      formationSeed={tip.formationSeed}
      target={[x, y, z]}
      tiles={tiles}
      theme={theme}
      onFinish={finish}
    />
  );
}

function TipFormation({ id, unitCounts, formationSeed, target, tiles, theme, onFinish }: {
  id: number;
  unitCounts: TipUnitCounts;
  formationSeed: number;
  target: [number, number, number];
  tiles: Map<string, Tile>;
  theme: WorldTheme;
  onFinish: (id: number) => void;
}) {
  // Defence against stale/local callers: the UI caps these too, but the renderer owns the final
  // GPU-safety boundary. Even the largest formation remains deliberately small and short-lived.
  const units = useMemo(() => {
    const roster = (["messenger", "ballista", "catapult"] as const).flatMap((tier) =>
      Array.from({ length: Math.max(0, Math.round(unitCounts[tier])) }, () => tier)
    ).slice(0, 12);
    // Shuffle the purchased unit types before assigning angular sectors, so a mixed army is
    // distributed around the whole castle instead of forming three obvious type clusters.
    const shuffled = roster
      .map((tier, index) => ({ tier, order: seededNoise(formationSeed, 100 + index) }))
      .sort((a, b) => a.order - b.order);

    return shuffled.map(({ tier }, index) => {
      const count = shuffled.length;
      const columns = Math.min(4, count);
      const row = Math.floor(index / columns);
      const rowStart = row * columns;
      const rowCount = Math.min(columns, count - rowStart);
      const column = index - rowStart;
      return {
        tier,
        directionAngle: formationSeed * Math.PI * 2,
        lateralOffset: (column - (rowCount - 1) / 2) * TIP_ANIMATION.formationColumnSpacing,
        depthOffset: row * TIP_ANIMATION.formationRowSpacing,
        impactOffset: [
          (seededNoise(formationSeed, index * 2) - 0.5) * 0.9,
          (seededNoise(formationSeed, index * 2 + 1) - 0.5) * 0.9,
        ] as [number, number],
      };
    });
  }, [formationSeed, unitCounts]);

  if (units.length === 0) return null;
  const finaleIndex = units.length - 1;

  return (
    <group>
      {units.map((unit, index) => (
        <TipDelivery
          key={index}
          id={id}
          tier={unit.tier}
          target={target}
          tiles={tiles}
          directionAngle={unit.directionAngle}
          lateralOffset={unit.lateralOffset}
          depthOffset={unit.depthOffset}
          impactOffset={unit.impactOffset}
          showFinale={index === finaleIndex}
          onFinish={index === finaleIndex ? onFinish : undefined}
          theme={theme}
        />
      ))}
    </group>
  );
}

function TipDelivery({ id, tier, target, tiles, directionAngle, lateralOffset, depthOffset, impactOffset, showFinale, theme, onFinish }: {
  id: number;
  tier: TipDeliveryTier;
  target: [number, number, number];
  tiles: Map<string, Tile>;
  directionAngle: number;
  lateralOffset: number;
  depthOffset: number;
  impactOffset: [number, number];
  showFinale: boolean;
  theme: WorldTheme;
  onFinish?: (id: number) => void;
}) {
  const carrier = useRef<Group>(null);
  const projectile = useRef<Group>(null);
  const coins = useRef<Group>(null);
  const impactGlow = useRef<Mesh>(null);
  const impactRing = useRef<Mesh>(null);
  const impactLight = useRef<PointLight>(null);
  const startedAt = useRef<number | null>(null);
  const finished = useRef(false);
  const groundY = useRef<number | null>(null);
  const scratchPosition = useRef(new Vector3());
  const scratchTangent = useRef(new Vector3());
  const scratchQuaternion = useRef(new Quaternion());

  const rig: DeliveryRig = {
    archerBody: useRef<Group>(null),
    archerLeftLeg: useRef<Group>(null),
    archerRightLeg: useRef<Group>(null),
    archerBowArm: useRef<Group>(null),
    archerDrawArm: useRef<Group>(null),
    archerBow: useRef<Group>(null),
    archerStringTop: useRef<Mesh>(null),
    archerStringBottom: useRef<Mesh>(null),
    archerLoadedArrow: useRef<Group>(null),
    siegeBody: useRef<Group>(null),
    wheelFrontLeft: useRef<Group>(null),
    wheelFrontRight: useRef<Group>(null),
    wheelRearLeft: useRef<Group>(null),
    wheelRearRight: useRef<Group>(null),
    ballistaBow: useRef<Group>(null),
    ballistaStringLeft: useRef<Mesh>(null),
    ballistaStringRight: useRef<Mesh>(null),
    ballistaLoadedBolt: useRef<Group>(null),
    catapultArm: useRef<Group>(null),
    catapultPayload: useRef<Mesh>(null),
  };

  const targetVector = useMemo(() => new Vector3(...target), [target]);
  const outward = useMemo(() => new Vector3(Math.cos(directionAngle), 0, Math.sin(directionAngle)), [directionAngle]);
  const right = useMemo(() => new Vector3(-outward.z, 0, outward.x), [outward]);
  const source = useMemo(
    () => {
      const position = targetVector.clone()
      .addScaledVector(outward, TIP_ANIMATION.sourceDistance + depthOffset)
      .addScaledVector(right, lateralOffset);
      position.y = terrainSurfaceAt(position.x, position.z, tiles);
      return position;
    },
    [depthOffset, lateralOffset, outward, right, targetVector, tiles]
  );
  const launch = useMemo(
    () => {
      const position = targetVector.clone()
      .addScaledVector(outward, TIP_ANIMATION.launchDistance + depthOffset)
      .addScaledVector(right, lateralOffset);
      position.y = terrainSurfaceAt(position.x, position.z, tiles);
      return position;
    },
    [depthOffset, lateralOffset, outward, right, targetVector, tiles]
  );
  const exit = useMemo(
    () => source.clone().addScaledVector(outward, TIP_ANIMATION.formationExitDistance),
    [outward, source]
  );
  const projectileStart = useMemo(
    () => {
      if (tier === "catapult") {
        return launch.clone().addScaledVector(outward, -0.62).setY(launch.y + 1.08);
      }
      return launch.clone().setY(launch.y + (tier === "ballista" ? 0.65 : 0.46));
    },
    [launch, outward, tier]
  );
  const impact = useMemo(
    () => targetVector.clone().add(new Vector3(impactOffset[0], 1.25, impactOffset[1])),
    [targetVector, impactOffset]
  );
  const approachDuration = TIP_ANIMATION.formationApproachSec;
  const aimDuration = TIP_ANIMATION.aimSeconds[tier];
  const flightDuration = TIP_ANIMATION.flightSeconds[tier];
  const arcHeight = TIP_ANIMATION.projectileArcHeights[tier];
  // One shared finale per formation avoids multiplying coin meshes and dynamic lights by every
  // attacker. Every unit still has its own projectile and local impact flash.
  const coinCount = showFinale ? TIP_ANIMATION.coinCounts[tier] : 0;
  const travelDistance = source.distanceTo(launch);
  const coinPhysics = useMemo(() => Array.from({ length: coinCount }, (_, index) => {
    const angle = index * 2.39996;
    const speed = 1.4 + ((index * 37) % 11) * 0.11;
    return {
      x: Math.cos(angle) * speed,
      z: Math.sin(angle) * speed,
      vy: 3.4 + ((index * 17) % 9) * 0.25,
      spin: 2.5 + (index % 7) * 0.7,
    };
  }), [coinCount]);

  useFrame((frame, delta) => {
    if (startedAt.current === null) startedAt.current = frame.clock.elapsedTime;
    const elapsed = frame.clock.elapsedTime - startedAt.current;
    const actionAt = TIP_ANIMATION.formationVolleyAtSec;
    // A catapult payload stays in its cup through most of the arm swing, then separates near the
    // vertical. Bow strings and ballista cords release their projectile immediately.
    const projectileLaunchAt = actionAt + (tier === "catapult" ? 0.24 : 0);
    const impactAt = projectileLaunchAt + flightDuration;
    const exitAt = TIP_ANIMATION.formationExitAtSec;
    const endAt = exitAt + TIP_ANIMATION.formationExitSec;
    const walk = clamp01(elapsed / approachDuration);
    const aim = smootherStep(clamp01((elapsed - (actionAt - aimDuration)) / aimDuration));
    const exitWalk = easeInOutCubic(clamp01((elapsed - exitAt - 0.22) / (TIP_ANIMATION.formationExitSec - 0.22)));
    const releaseTime = elapsed - actionAt;
    const release = easeOutCubic(clamp01(releaseTime / (tier === "catapult" ? 0.34 : 0.14)));

    if (carrier.current) {
      if (elapsed < exitAt) {
        carrier.current.position.lerpVectors(source, launch, easeInOutCubic(walk));
      } else {
        carrier.current.position.lerpVectors(launch, exit, exitWalk);
      }
      const sampledGround = terrainSurfaceAt(carrier.current.position.x, carrier.current.position.z, tiles);
      // Step up immediately at a raised hex edge so wheels and feet can never enter its side wall;
      // ease downward when leaving a tile so the convoy does not visibly snap toward the ground.
      if (groundY.current === null || sampledGround > groundY.current) {
        groundY.current = sampledGround;
      } else {
        groundY.current = MathUtils.lerp(groundY.current, sampledGround, Math.min(1, delta * 10));
      }
      carrier.current.position.y = groundY.current;
      const stride = tier === "messenger" ? Math.sin(elapsed * 10.5) : Math.sin(elapsed * 7.2);
      const isMoving = elapsed < approachDuration || (elapsed >= exitAt + 0.22 && elapsed < endAt);
      carrier.current.position.y += Math.abs(stride) * (tier === "messenger" ? 0.026 : 0.012) * Number(isMoving);
      if (releaseTime >= 0) {
        const recoil = Math.sin(clamp01(releaseTime / 0.32) * Math.PI) * (tier === "messenger" ? 0.035 : tier === "ballista" ? 0.12 : 0.08);
        carrier.current.position.addScaledVector(outward, recoil);
      }
      const inwardHeading = Math.atan2(target[0] - source.x, target[2] - source.z);
      const exitTurn = smootherStep(clamp01((elapsed - exitAt) / 0.35));
      carrier.current.rotation.y = inwardHeading + exitTurn * Math.PI;
      carrier.current.visible = elapsed >= 0 && elapsed < endAt;
      animateRig(rig, tier, elapsed, walk, exitWalk, aim, release, releaseTime, travelDistance, launch.distanceTo(exit));
    }

    if (projectile.current) {
      const progress = clamp01((elapsed - projectileLaunchAt) / flightDuration);
      projectile.current.visible = elapsed >= projectileLaunchAt && elapsed <= impactAt;
      if (projectile.current.visible) {
        const position = scratchPosition.current.lerpVectors(projectileStart, impact, progress);
        position.y += Math.sin(progress * Math.PI) * arcHeight;
        projectile.current.position.copy(position);
        if (tier === "catapult") {
          projectile.current.rotation.set(releaseTime * 7.5, releaseTime * 4.2, releaseTime * 2.8);
        } else {
          const tangent = scratchTangent.current.subVectors(impact, projectileStart);
          tangent.y += Math.cos(progress * Math.PI) * Math.PI * arcHeight;
          projectile.current.quaternion.copy(scratchQuaternion.current.setFromUnitVectors(UP, tangent.normalize()));
        }
      }
    }

    const burstTime = elapsed - impactAt;
    if (coins.current) {
      coins.current.visible = burstTime >= 0;
      if (burstTime >= 0) {
        coins.current.children.forEach((coin, index) => {
          const physics = coinPhysics[index];
          coin.position.set(
            impact.x + physics.x * burstTime,
            impact.y + 0.1 + physics.vy * 0.72 * burstTime - 4.9 * burstTime * burstTime,
            impact.z + physics.z * burstTime
          );
          coin.rotation.x = burstTime * physics.spin;
          coin.rotation.z = burstTime * physics.spin * 0.7;
          const scale = Math.max(0, Math.min(1, burstTime * 7) * (1 - Math.max(0, burstTime - 1.45) / 0.65));
          coin.scale.setScalar(scale);
        });
      }
    }
    if (impactGlow.current) {
      impactGlow.current.visible = burstTime >= 0 && burstTime < 0.8;
      impactGlow.current.scale.setScalar(0.45 + Math.max(0, burstTime) * 3.2);
      const material = impactGlow.current.material;
      if (!Array.isArray(material)) material.opacity = Math.max(0, 0.58 - Math.max(0, burstTime) * 0.76);
    }
    if (impactRing.current) {
      impactRing.current.visible = burstTime >= 0 && burstTime < 0.75;
      impactRing.current.scale.setScalar(0.4 + Math.max(0, burstTime) * 5.5);
      const material = impactRing.current.material;
      if (!Array.isArray(material)) material.opacity = Math.max(0, 0.7 - Math.max(0, burstTime) * 0.92);
    }
    if (impactLight.current) {
      impactLight.current.intensity = showFinale && burstTime >= 0 && burstTime < 0.9 ? Math.max(0, 2.4 - burstTime * 2.65) : 0;
    }
    if (onFinish && elapsed >= endAt && !finished.current) {
      finished.current = true;
      onFinish(id);
    }
  });

  return (
    <group>
      <group ref={carrier} visible={false}>
        {tier === "messenger" ? <Messenger theme={theme} rig={rig} /> : tier === "ballista" ? <Ballista theme={theme} rig={rig} /> : <Catapult theme={theme} rig={rig} />}
      </group>
      <group ref={projectile} visible={false}>
        {tier === "catapult" ? (
          <group scale={TIP_ANIMATION.projectileScales.catapult}>
            <mesh castShadow><dodecahedronGeometry args={[0.38, 0]} /><meshStandardMaterial {...theme.tip.gold} /></mesh>
            <mesh position={[0.16, 0.12, -0.12]} scale={0.38}><dodecahedronGeometry args={[0.38, 0]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
          </group>
        ) : <Arrow theme={theme} scale={TIP_ANIMATION.projectileScales[tier]} />}
      </group>
      <group ref={coins} visible={false}>
        {coinPhysics.map((_, index) => (
          <mesh key={index} castShadow><cylinderGeometry args={[0.12, 0.12, 0.045, 10]} /><meshStandardMaterial {...theme.tip.gold} /></mesh>
        ))}
      </group>
      <mesh ref={impactGlow} position={[impact.x, impact.y, impact.z]} visible={false}>
        <sphereGeometry args={[0.32, 14, 10]} /><meshBasicMaterial color={theme.tip.glowColor} transparent opacity={0.58} depthWrite={false} />
      </mesh>
      <mesh ref={impactRing} position={[impact.x, target[1] + 0.08, impact.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.42, 0.57, 24]} /><meshBasicMaterial color={theme.tip.glowColor} transparent opacity={0.7} depthWrite={false} side={2} />
      </mesh>
      {showFinale ? (
        <pointLight ref={impactLight} position={[impact.x, impact.y + 0.55, impact.z]} color={theme.tip.glowColor} intensity={0} distance={6} />
      ) : null}
    </group>
  );
}

function animateRig(
  rig: DeliveryRig,
  tier: TipDeliveryTier,
  elapsed: number,
  walk: number,
  exitWalk: number,
  aim: number,
  release: number,
  releaseTime: number,
  travelDistance: number,
  exitDistance: number
) {
  const approaching = 1 - smootherStep(walk);
  const exiting = exitWalk > 0 && exitWalk < 1 ? 1 : 0;
  const moving = Math.max(approaching, exiting);
  const stride = Math.sin(elapsed * 10.5) * moving;
  if (tier === "messenger") {
    if (rig.archerBody.current) rig.archerBody.current.rotation.x = -0.09 * moving + Math.sin(Math.max(0, releaseTime) * 15) * 0.05 * (1 - release);
    if (rig.archerLeftLeg.current) rig.archerLeftLeg.current.rotation.x = stride * 0.48;
    if (rig.archerRightLeg.current) rig.archerRightLeg.current.rotation.x = -stride * 0.48;
    if (rig.archerBowArm.current) rig.archerBowArm.current.rotation.x = -stride * 0.22 - aim * 1.28 + release * 0.12;
    if (rig.archerDrawArm.current) {
      rig.archerDrawArm.current.rotation.x = stride * 0.22 - aim * 1.2 + release * 0.42;
      rig.archerDrawArm.current.rotation.z = -aim * 1.05 + release * 0.2;
    }
    if (rig.archerBow.current) {
      rig.archerBow.current.scale.y = 1 - aim * 0.075 + release * 0.075;
      rig.archerBow.current.rotation.z = -0.08 * aim;
    }
    const draw = aim * (1 - release);
    const nockZ = 0.28 - draw * 0.58;
    ARCHER_NOCK.set(0.34, 1.1, nockZ);
    if (rig.archerStringTop.current) setBeamBetween(rig.archerStringTop.current, ARCHER_STRING_TOP, ARCHER_NOCK);
    if (rig.archerStringBottom.current) setBeamBetween(rig.archerStringBottom.current, ARCHER_STRING_BOTTOM, ARCHER_NOCK);
    if (rig.archerLoadedArrow.current) {
      rig.archerLoadedArrow.current.visible = releaseTime < 0;
      rig.archerLoadedArrow.current.position.z = nockZ + 0.61;
    }
    return;
  }

  const wheelRadius = (tier === "ballista" ? 0.34 : 0.42) * TIP_ANIMATION.visualScales[tier];
  const wheelAngle = -(travelDistance * easeInOutCubic(walk) + exitDistance * exitWalk) / wheelRadius;
  rotateWheel(rig.wheelFrontLeft, wheelAngle);
  rotateWheel(rig.wheelFrontRight, wheelAngle);
  rotateWheel(rig.wheelRearLeft, wheelAngle);
  rotateWheel(rig.wheelRearRight, wheelAngle);
  if (rig.siegeBody.current) {
    const shake = releaseTime >= 0 && releaseTime < 0.45 ? Math.sin(releaseTime * 44) * (1 - releaseTime / 0.45) : 0;
    rig.siegeBody.current.rotation.z = shake * (tier === "catapult" ? 0.025 : 0.014);
    rig.siegeBody.current.position.y = TIP_ANIMATION.groundOffsets[tier] + Math.abs(shake) * 0.014;
  }
  if (tier === "ballista") {
    const draw = aim * (1 - release);
    const nockZ = MathUtils.lerp(-0.35, -1.02, draw);
    BALLISTA_NOCK.set(0, 1.01, nockZ);
    if (rig.ballistaStringLeft.current) setBeamBetween(rig.ballistaStringLeft.current, BALLISTA_STRING_LEFT, BALLISTA_NOCK);
    if (rig.ballistaStringRight.current) setBeamBetween(rig.ballistaStringRight.current, BALLISTA_STRING_RIGHT, BALLISTA_NOCK);
    if (rig.ballistaBow.current) rig.ballistaBow.current.scale.x = 1 - draw * 0.09;
    if (rig.ballistaLoadedBolt.current) {
      rig.ballistaLoadedBolt.current.visible = releaseTime < 0;
      rig.ballistaLoadedBolt.current.position.z = nockZ + 0.88;
    }
    return;
  }
  if (rig.catapultArm.current) {
    const cockedAngle = MathUtils.lerp(-0.22, -1.08, aim);
    let armAngle = cockedAngle;
    if (releaseTime >= 0) {
      armAngle = MathUtils.lerp(-1.08, 1.02, release);
      if (release >= 1) {
        const settleTime = Math.max(0, releaseTime - 0.34);
        armAngle = 0.72 + Math.cos(settleTime * 13) * Math.exp(-settleTime * 5.5) * 0.3;
      }
    }
    rig.catapultArm.current.rotation.x = armAngle;
  }
  if (rig.catapultPayload.current) rig.catapultPayload.current.visible = releaseTime < 0.24;
}

function Messenger({ theme, rig }: { theme: WorldTheme; rig: DeliveryRig }) {
  return (
    <group position={[0, TIP_ANIMATION.groundOffsets.messenger, 0]} scale={TIP_ANIMATION.visualScales.messenger}>
      <group ref={rig.archerBody}>
        <mesh castShadow position={[0, 0.9, 0]}><capsuleGeometry args={[0.19, 0.5, 4, 8]} /><meshStandardMaterial {...theme.tip.messenger} /></mesh>
        <mesh castShadow position={[0, 1.47, 0]}><sphereGeometry args={[0.2, 10, 8]} /><meshStandardMaterial {...theme.citizens.skin} /></mesh>
        <mesh castShadow position={[0, 1.66, -0.02]} rotation={[0, 0, Math.PI]}><coneGeometry args={[0.23, 0.34, 7]} /><meshStandardMaterial {...theme.tip.messenger} /></mesh>
        <mesh position={[0, 1.43, 0.19]}><sphereGeometry args={[0.035, 6, 5]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      </group>
      <Limb limbRef={rig.archerLeftLeg} position={[-0.1, 0.55, 0]} theme={theme} />
      <Limb limbRef={rig.archerRightLeg} position={[0.1, 0.55, 0]} theme={theme} />
      <Arm armRef={rig.archerBowArm} position={[0.19, 1.25, 0]} theme={theme} />
      <Arm armRef={rig.archerDrawArm} position={[-0.19, 1.25, 0]} theme={theme} />
      <group ref={rig.archerBow}>
        <mesh position={[0.22, 1.31, 0.31]} rotation={[0, 0, 0.47]}><cylinderGeometry args={[0.025, 0.032, 0.48, 7]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
        <mesh position={[0.22, 0.91, 0.31]} rotation={[0, 0, -0.47]}><cylinderGeometry args={[0.032, 0.025, 0.48, 7]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      </group>
      <mesh ref={rig.archerStringTop}><cylinderGeometry args={[0.008, 0.008, 1, 5]} /><meshStandardMaterial {...theme.tip.arrow} /></mesh>
      <mesh ref={rig.archerStringBottom}><cylinderGeometry args={[0.008, 0.008, 1, 5]} /><meshStandardMaterial {...theme.tip.arrow} /></mesh>
      <group ref={rig.archerLoadedArrow} rotation={[Math.PI / 2, 0, 0]}><Arrow theme={theme} scale={0.92} /></group>
      <group position={[-0.24, 1.03, -0.18]} rotation={[0.08, 0, 0.12]}>
        <mesh castShadow><cylinderGeometry args={[0.105, 0.08, 0.72, 7]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
        <mesh position={[0, 0.16, 0.04]} rotation={[0.16, 0, 0]}><cylinderGeometry args={[0.018, 0.018, 0.76, 5]} /><meshStandardMaterial {...theme.tip.arrow} /></mesh>
      </group>
    </group>
  );
}

function Limb({ limbRef, position, theme }: { limbRef: RefObject<Group | null>; position: [number, number, number]; theme: WorldTheme }) {
  return <group ref={limbRef} position={position}><mesh castShadow position={[0, -0.29, 0]}><capsuleGeometry args={[0.065, 0.45, 3, 6]} /><meshStandardMaterial {...theme.tip.metal} /></mesh></group>;
}

function Arm({ armRef, position, theme }: { armRef: RefObject<Group | null>; position: [number, number, number]; theme: WorldTheme }) {
  return <group ref={armRef} position={position}><mesh castShadow position={[0, -0.26, 0]}><capsuleGeometry args={[0.055, 0.38, 3, 6]} /><meshStandardMaterial {...theme.tip.messenger} /></mesh></group>;
}

function Wheel({ x, z, wheelRef, theme, radius }: { x: number; z: number; wheelRef: RefObject<Group | null>; theme: WorldTheme; radius: number }) {
  return (
    <group ref={wheelRef} position={[x, radius, z]}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[radius, radius, 0.13, 12]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[radius * 0.22, radius * 0.22, 0.16, 8]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      {[0, Math.PI / 3, (Math.PI * 2) / 3].map((angle) => (
        <mesh key={angle} rotation={[angle, 0, Math.PI / 2]}><boxGeometry args={[0.045, radius * 1.75, 0.045]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      ))}
    </group>
  );
}

function Ballista({ theme, rig }: { theme: WorldTheme; rig: DeliveryRig }) {
  return (
    <group ref={rig.siegeBody} position={[0, TIP_ANIMATION.groundOffsets.ballista, 0]} scale={TIP_ANIMATION.visualScales.ballista}>
      <mesh castShadow position={[0, 0.42, -0.03]}><boxGeometry args={[0.94, 0.18, 1.55]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <mesh castShadow position={[0, 0.66, 0.08]}><boxGeometry args={[0.18, 0.18, 1.72]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      <WheelSet rig={rig} theme={theme} radius={0.34} x={0.53} z={0.45} />
      <group ref={rig.ballistaBow}>
        <mesh position={[-0.45, 1.01, 0.08]} rotation={[0, 0.38, Math.PI / 2]}><cylinderGeometry args={[0.055, 0.075, 0.94, 8]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
        <mesh position={[0.45, 1.01, 0.08]} rotation={[0, -0.38, Math.PI / 2]}><cylinderGeometry args={[0.075, 0.055, 0.94, 8]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      </group>
      <mesh ref={rig.ballistaStringLeft}><cylinderGeometry args={[0.012, 0.012, 1, 5]} /><meshStandardMaterial {...theme.tip.arrow} /></mesh>
      <mesh ref={rig.ballistaStringRight}><cylinderGeometry args={[0.012, 0.012, 1, 5]} /><meshStandardMaterial {...theme.tip.arrow} /></mesh>
      <group ref={rig.ballistaLoadedBolt} rotation={[Math.PI / 2, 0, 0]}><Arrow theme={theme} scale={1.42} /></group>
      <mesh position={[0, 0.86, -0.62]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.17, 0.17, 0.42, 10]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
    </group>
  );
}

function Catapult({ theme, rig }: { theme: WorldTheme; rig: DeliveryRig }) {
  return (
    <group ref={rig.siegeBody} position={[0, TIP_ANIMATION.groundOffsets.catapult, 0]} scale={TIP_ANIMATION.visualScales.catapult}>
      <mesh castShadow position={[0, 0.43, 0]}><boxGeometry args={[1.25, 0.22, 1.7]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <WheelSet rig={rig} theme={theme} radius={0.42} x={0.7} z={0.5} />
      <mesh position={[-0.5, 1.05, 0]}><boxGeometry args={[0.13, 1.45, 0.13]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <mesh position={[0.5, 1.05, 0]}><boxGeometry args={[0.13, 1.45, 0.13]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <mesh position={[0, 1.47, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.1, 0.1, 1.18, 8]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      <mesh position={[-0.5, 0.9, 0]} rotation={[0.72, 0, -0.52]}><boxGeometry args={[0.1, 1.35, 0.1]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <mesh position={[0.5, 0.9, 0]} rotation={[0.72, 0, 0.52]}><boxGeometry args={[0.1, 1.35, 0.1]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <group ref={rig.catapultArm} position={[0, 1.47, 0]}>
        <mesh castShadow position={[0, 0.88, 0]}><boxGeometry args={[0.15, 1.82, 0.15]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
        <mesh castShadow position={[0, -0.32, 0]}><boxGeometry args={[0.52, 0.48, 0.42]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
        <mesh position={[0, 1.83, 0]}><torusGeometry args={[0.3, 0.045, 6, 12, Math.PI]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
        <mesh ref={rig.catapultPayload} castShadow position={[0, 1.9, 0]}><dodecahedronGeometry args={[0.3, 0]} /><meshStandardMaterial {...theme.tip.gold} /></mesh>
      </group>
      <mesh position={[0, 0.84, -0.69]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.18, 0.18, 0.62, 10]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
    </group>
  );
}

function WheelSet({ rig, theme, radius, x, z }: { rig: DeliveryRig; theme: WorldTheme; radius: number; x: number; z: number }) {
  return <>
    <Wheel x={-x} z={z} wheelRef={rig.wheelFrontLeft} theme={theme} radius={radius} />
    <Wheel x={x} z={z} wheelRef={rig.wheelFrontRight} theme={theme} radius={radius} />
    <Wheel x={-x} z={-z} wheelRef={rig.wheelRearLeft} theme={theme} radius={radius} />
    <Wheel x={x} z={-z} wheelRef={rig.wheelRearRight} theme={theme} radius={radius} />
  </>;
}

function Arrow({ theme, scale = 1 }: { theme: WorldTheme; scale?: number }) {
  return <group scale={scale}>
    <mesh castShadow><cylinderGeometry args={[0.035, 0.035, 1.25, 7]} /><meshStandardMaterial {...theme.tip.arrow} /></mesh>
    <mesh castShadow position={[0, 0.72, 0]}><coneGeometry args={[0.1, 0.2, 7]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
    <mesh position={[0, -0.67, 0]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.2, 0.16, 0.025]} /><meshStandardMaterial {...theme.tip.messenger} /></mesh>
  </group>;
}

function setBeamBetween(mesh: Mesh, start: Vector3, end: Vector3) {
  BEAM_DELTA.subVectors(end, start);
  BEAM_MIDPOINT.addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(BEAM_MIDPOINT);
  mesh.scale.set(1, BEAM_DELTA.length(), 1);
  mesh.quaternion.copy(BEAM_QUATERNION.setFromUnitVectors(UP, BEAM_DELTA.normalize()));
}

function rotateWheel(wheel: RefObject<Group | null>, angle: number) {
  if (wheel.current) wheel.current.rotation.x = angle;
}

function seededNoise(seed: number, index: number) {
  const value = Math.sin(seed * 91_973.17 + index * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function terrainSurfaceAt(x: number, z: number, tiles: Map<string, Tile>) {
  const tile = tiles.get(coordKey(worldToHex(x, z)));
  return tile ? HEX_HEIGHT + tile.height : SCENERY.groundY;
}

function clamp01(value: number) { return Math.min(1, Math.max(0, value)); }
function smootherStep(value: number) { return value * value * value * (value * (value * 6 - 15) + 10); }
function easeOutCubic(value: number) { return 1 - Math.pow(1 - value, 3); }
function easeInOutCubic(value: number) { return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2; }
