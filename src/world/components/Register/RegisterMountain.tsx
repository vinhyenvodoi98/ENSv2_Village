"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group, MeshStandardMaterial } from "three";
import { getThemeMaterials } from "@/world/config/materials";
import { REGISTER_MOUNTAIN as M } from "@/world/config/mountain";
import { medievalTheme } from "@/world/config/theme";
import { hexGeometry } from "@/world/components/Terrain/hexGeometry";
import { mountainGeometries as G } from "./registerMountain.geometries";

export interface RegisterMountainProps {
  theme?: typeof medievalTheme;
  hovered: boolean;
  pressed: boolean;
  /** Có pledge commit-reveal đang treo trong localStorage → chóp tuyết nhấp nháy. */
  pending: boolean;
  /** Ví chưa kết nối / sai mạng → bệ núi chuyển sang đất khô thay vì cỏ. */
  dormant: boolean;
  /** `prefers-reduced-motion: reduce` → không lift; giữ press scale. */
  reducedMotion?: boolean;
}

const CONVERGE_EPSILON = 1e-3;
const TWO_PI = Math.PI * 2;

function ease(current: number, target: number, deltaSeconds: number, timeConstantSeconds: number): number {
  const t = 1 - Math.exp(-deltaSeconds / timeConstantSeconds);
  return current + (target - current) * t;
}

/**
 * Pure r3f mesh — knows nothing about ENS, wagmi, or the wizard. Receives
 * state flags and renders a small low-poly mountain, animated entirely inside
 * one `useFrame` (no per-frame `useState`, matching `Fortress.tsx`).
 */
export function RegisterMountain({
  theme = medievalTheme,
  hovered,
  pressed,
  pending,
  dormant,
  reducedMotion = false,
}: RegisterMountainProps) {
  const groupRef = useRef<Group>(null);
  const snowMaterialRef = useRef<MeshStandardMaterial>(null);
  const liftRef = useRef(0);
  const scaleRef = useRef(1);
  const clockRef = useRef(0);
  const invalidate = useThree((state) => state.invalidate);

  const materials = useMemo(() => getThemeMaterials(theme), [theme]);
  const { terrain } = materials;
  // A pending pledge's flicker is per-instance state, so the snow cap needs its own material
  // instance rather than the shared `terrain.snow` every mountain would otherwise reuse (mutating
  // that shared reference would flicker the snow on every other themed surface too).
  // React-three-fiber owns creating/disposing it from this JSX element; only its live properties
  // are read off the shared material below.
  const snowSource = terrain.snow;

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    clockRef.current += delta;

    const targetLift = reducedMotion ? 0 : hovered ? M.hoverLiftY : 0;
    const targetScale = pressed ? M.pressScale : 1;

    liftRef.current = ease(liftRef.current, targetLift, delta, M.easeSeconds);
    scaleRef.current = ease(scaleRef.current, targetScale, delta, M.easeSeconds);

    group.position.y = liftRef.current;
    group.scale.setScalar(scaleRef.current);

    const snowMaterial = snowMaterialRef.current;
    if (snowMaterial) {
      if (pending) {
        const phase = (clockRef.current * TWO_PI) / M.pendingPulseSeconds;
        snowMaterial.emissiveIntensity = (Math.sin(phase) + 1) / 2;
      } else if (snowMaterial.emissiveIntensity !== 0) {
        snowMaterial.emissiveIntensity = 0;
      }
    }

    const converged =
      Math.abs(liftRef.current - targetLift) < CONVERGE_EPSILON
      && Math.abs(scaleRef.current - targetScale) < CONVERGE_EPSILON;

    if (!converged || pending) invalidate();
  });

  const plinthMaterial = dormant ? terrain.dirt : terrain.grass;
  const snowStartY = M.peak.height * M.snow.snowStartRatio;

  return (
    <group ref={groupRef}>
      <mesh
        geometry={hexGeometry}
        material={plinthMaterial}
        scale={M.plinth.scale}
        position={[0, M.plinth.y, 0]}
        receiveShadow
      />
      <mesh geometry={G.peak} material={terrain.rock} position={[0, M.peak.height / 2, 0]} castShadow receiveShadow />
      <mesh geometry={G.snowCap} position={[0, snowStartY, 0]} castShadow>
        <meshStandardMaterial
          ref={snowMaterialRef}
          color={snowSource.color}
          roughness={snowSource.roughness}
          metalness={snowSource.metalness}
          flatShading={snowSource.flatShading}
          emissive={terrain.highlight.color}
          emissiveIntensity={0}
        />
      </mesh>
      {M.foothills.map((hill, index) => (
        <mesh
          key={index}
          geometry={G.peak}
          material={terrain.rock}
          position={[hill.offset[0], (M.peak.height * hill.scale) / 2, hill.offset[2]]}
          rotation={[0, hill.rotationY, 0]}
          scale={hill.scale}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
