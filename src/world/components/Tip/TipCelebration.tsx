"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh, PointLight, Quaternion, Vector3 } from "three";
import { coordKey, hexToWorld } from "@/world/core/hex";
import { HEX_HEIGHT, TIP_ANIMATION } from "@/world/config/world.config";
import { useWorldStore, type TipDeliveryTier } from "@/world/state/useWorldStore";
import type { WorldTheme } from "@/world/config/theme";

const UP = new Vector3(0, 1, 0);

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

  return <TipDelivery key={tip.id} id={tip.id} tier={tip.tier} target={[x, y, z]} theme={theme} onFinish={finish} />;
}

function TipDelivery({
  id,
  tier,
  target,
  theme,
  onFinish,
}: {
  id: number;
  tier: TipDeliveryTier;
  target: [number, number, number];
  theme: WorldTheme;
  onFinish: (id: number) => void;
}) {
  const carrier = useRef<Group>(null);
  const projectile = useRef<Group>(null);
  const coins = useRef<Group>(null);
  const impactGlow = useRef<Mesh>(null);
  const impactLight = useRef<PointLight>(null);
  const startedAt = useRef<number | null>(null);
  const finished = useRef(false);
  const scratchPosition = useRef(new Vector3());
  const scratchTangent = useRef(new Vector3());
  const scratchQuaternion = useRef(new Quaternion());
  const targetVector = useMemo(() => new Vector3(...target), [target]);
  const outward = useMemo(() => {
    const vector = new Vector3(target[0], 0, target[2]);
    if (vector.lengthSq() < 0.1) vector.set(1, 0, 1);
    return vector.normalize();
  }, [target]);
  const source = useMemo(() => targetVector.clone().addScaledVector(outward, TIP_ANIMATION.sourceDistance), [targetVector, outward]);
  const launch = useMemo(() => targetVector.clone().addScaledVector(outward, TIP_ANIMATION.launchDistance), [targetVector, outward]);
  const approachDuration = tier === "messenger" ? TIP_ANIMATION.messengerApproachSec : tier === "ballista" ? TIP_ANIMATION.ballistaApproachSec : TIP_ANIMATION.catapultApproachSec;
  const coinCount = TIP_ANIMATION.coinCounts[tier];
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

  useFrame((frame) => {
    if (startedAt.current === null) startedAt.current = frame.clock.elapsedTime;
    const elapsed = frame.clock.elapsedTime - startedAt.current;
    const launchAt = approachDuration + TIP_ANIMATION.aimSec;
    const impactAt = launchAt + TIP_ANIMATION.flightSec;
    const endAt = impactAt + TIP_ANIMATION.coinBurstSec;

    if (carrier.current) {
      const walk = Math.min(1, elapsed / approachDuration);
      carrier.current.position.lerpVectors(source, launch, easeOutCubic(walk));
      carrier.current.position.y += tier === "messenger" ? Math.abs(Math.sin(elapsed * 9)) * 0.08 : Math.abs(Math.sin(elapsed * 6)) * 0.035;
      carrier.current.rotation.y = Math.atan2(target[0] - source.x, target[2] - source.z);
      carrier.current.visible = elapsed < endAt;
    }

    if (projectile.current) {
      const progress = clamp01((elapsed - launchAt) / TIP_ANIMATION.flightSec);
      projectile.current.visible = elapsed >= launchAt && elapsed <= impactAt;
      if (projectile.current.visible) {
        const position = scratchPosition.current.lerpVectors(launch, targetVector, progress);
        position.y += 1.05 + Math.sin(progress * Math.PI) * TIP_ANIMATION.projectileArcHeight * (tier === "catapult" ? 1 : 0.55);
        projectile.current.position.copy(position);
        const tangent = scratchTangent.current.subVectors(targetVector, launch);
        tangent.y += Math.cos(progress * Math.PI) * Math.PI * TIP_ANIMATION.projectileArcHeight * (tier === "catapult" ? 1 : 0.55);
        projectile.current.quaternion.copy(scratchQuaternion.current.setFromUnitVectors(UP, tangent.normalize()));
      }
    }

    const burstTime = elapsed - impactAt;
    if (coins.current) {
      coins.current.visible = burstTime >= 0;
      if (burstTime >= 0) {
        coins.current.children.forEach((coin, index) => {
          const physics = coinPhysics[index];
          coin.position.set(
            target[0] + physics.x * burstTime,
            target[1] + 2.5 + physics.vy * burstTime - 4.9 * burstTime * burstTime,
            target[2] + physics.z * burstTime
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
      const glowScale = 1 + Math.max(0, burstTime) * 4;
      impactGlow.current.scale.setScalar(glowScale);
      const material = impactGlow.current.material;
      if (!Array.isArray(material)) material.opacity = Math.max(0, 0.62 - Math.max(0, burstTime) * 0.78);
    }
    if (impactLight.current) {
      impactLight.current.intensity = burstTime >= 0 && burstTime < 0.9 ? Math.max(0, 2.2 - burstTime * 2.45) : 0;
    }

    if (elapsed >= endAt && !finished.current) {
      finished.current = true;
      onFinish(id);
    }
  });

  return (
    <group>
      <group ref={carrier}>
        {tier === "messenger" ? <Messenger theme={theme} /> : tier === "ballista" ? <Ballista theme={theme} /> : <Catapult theme={theme} />}
      </group>
      <group ref={projectile} visible={false}>
        {tier === "catapult" ? (
          <mesh castShadow>
            <sphereGeometry args={[0.36, 10, 8]} />
            <meshStandardMaterial {...theme.tip.gold} />
          </mesh>
        ) : (
          <Arrow theme={theme} scale={tier === "ballista" ? 1.45 : 1} />
        )}
      </group>
      <group ref={coins} visible={false}>
        {coinPhysics.map((_, index) => (
          <mesh key={index} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.045, 10]} />
            <meshStandardMaterial {...theme.tip.gold} />
          </mesh>
        ))}
      </group>
      <mesh ref={impactGlow} position={[target[0], target[1] + 2.1, target[2]]} visible={false}>
        <sphereGeometry args={[0.5, 14, 10]} />
        <meshBasicMaterial color={theme.tip.glowColor} transparent opacity={0.62} depthWrite={false} />
      </mesh>
      <pointLight ref={impactLight} position={[target[0], target[1] + 3, target[2]]} color={theme.tip.glowColor} intensity={0} distance={8} />
    </group>
  );
}

function Messenger({ theme }: { theme: WorldTheme }) {
  return (
    <group position={[0, 0.5, 0]} scale={0.9}>
      <mesh castShadow position={[0, 0.72, 0]}><capsuleGeometry args={[0.18, 0.48, 4, 8]} /><meshStandardMaterial {...theme.tip.messenger} /></mesh>
      <mesh castShadow position={[0, 1.25, 0]}><sphereGeometry args={[0.2, 10, 8]} /><meshStandardMaterial {...theme.citizens.skin} /></mesh>
      <mesh castShadow position={[-0.12, 0.24, 0]}><capsuleGeometry args={[0.07, 0.38, 3, 6]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      <mesh castShadow position={[0.12, 0.24, 0]}><capsuleGeometry args={[0.07, 0.38, 3, 6]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0.42, 0.85, 0]}><torusGeometry args={[0.36, 0.035, 6, 16, Math.PI]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
    </group>
  );
}

function Wheel({ x, z, theme }: { x: number; z: number; theme: WorldTheme }) {
  return <mesh castShadow position={[x, 0.28, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.3, 0.3, 0.12, 10]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>;
}

function Ballista({ theme }: { theme: WorldTheme }) {
  return (
    <group position={[0, 0.35, 0]} scale={1.15}>
      <mesh castShadow position={[0, 0.35, 0]}><boxGeometry args={[0.85, 0.18, 1.25]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <Wheel x={-0.48} z={0.35} theme={theme} /><Wheel x={0.48} z={0.35} theme={theme} /><Wheel x={-0.48} z={-0.35} theme={theme} /><Wheel x={0.48} z={-0.35} theme={theme} />
      <mesh position={[0, 0.78, 0.12]} rotation={[Math.PI / 2, 0, Math.PI / 2]}><torusGeometry args={[0.58, 0.055, 6, 18, Math.PI]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      <Arrow theme={theme} scale={0.9} position={[0, 0.78, -0.05]} />
    </group>
  );
}

function Catapult({ theme }: { theme: WorldTheme }) {
  return (
    <group position={[0, 0.42, 0]} scale={1.3}>
      <mesh castShadow position={[0, 0.28, 0]}><boxGeometry args={[1.15, 0.2, 1.45]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <Wheel x={-0.65} z={0.45} theme={theme} /><Wheel x={0.65} z={0.45} theme={theme} /><Wheel x={-0.65} z={-0.45} theme={theme} /><Wheel x={0.65} z={-0.45} theme={theme} />
      <mesh castShadow position={[0, 0.95, 0]} rotation={[0.62, 0, 0]}><boxGeometry args={[0.13, 1.75, 0.13]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <mesh castShadow position={[0, 1.62, 0.48]}><sphereGeometry args={[0.25, 8, 7]} /><meshStandardMaterial {...theme.tip.gold} /></mesh>
      <mesh position={[-0.48, 0.8, 0]}><boxGeometry args={[0.12, 1.25, 0.12]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
      <mesh position={[0.48, 0.8, 0]}><boxGeometry args={[0.12, 1.25, 0.12]} /><meshStandardMaterial {...theme.tip.wood} /></mesh>
    </group>
  );
}

function Arrow({ theme, scale = 1, position = [0, 0, 0] }: { theme: WorldTheme; scale?: number; position?: [number, number, number] }) {
  return (
    <group scale={scale} position={position}>
      <mesh castShadow><cylinderGeometry args={[0.035, 0.035, 1.25, 7]} /><meshStandardMaterial {...theme.tip.arrow} /></mesh>
      <mesh castShadow position={[0, 0.72, 0]}><coneGeometry args={[0.1, 0.2, 7]} /><meshStandardMaterial {...theme.tip.metal} /></mesh>
      <mesh position={[0, -0.67, 0]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.2, 0.16, 0.025]} /><meshStandardMaterial {...theme.tip.messenger} /></mesh>
    </group>
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}
