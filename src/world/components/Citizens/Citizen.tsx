"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshStandardMaterial, type Group, type Mesh } from "three";
import type { Citizen as CitizenData } from "@/world/core/types";
import { medievalTheme } from "@/world/config/theme";
import { getThemeMaterials } from "@/world/config/materials";
import { CITIZENS } from "@/world/config/world.config";
import { resolveOutfit } from "./outfits";
import { getCitizenGeometries, CITIZEN_LOCAL_Y, walkPose } from "./citizenGeometry";
import { citizenKit } from "@/world/config/citizenKit";

const clothMaterialCache = new Map<string, MeshStandardMaterial>();

/** One `MeshStandardMaterial` per unique cloth color, shared across every non-instanced citizen using it. */
function getClothMaterial(color: string): MeshStandardMaterial {
  const cached = clothMaterialCache.get(color);
  if (cached) return cached;
  const material = new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true });
  clothMaterialCache.set(color, material);
  return material;
}

interface CitizenProps {
  citizen: CitizenData;
  theme?: typeof medievalTheme;
  /** Overrides the walk-cycle on/off state. Defaults to derived from `citizen.status`. */
  walking?: boolean;
}

/**
 * A single low-poly citizen figure, built from primitives (capsule torso,
 * sphere head, two leg boxes, a waistband accent). The crowd itself renders
 * through instanced meshes in `CitizenCrowd.tsx` for performance — this
 * component is the reference figure those instances mirror, and is cheap
 * enough to use standalone (e.g. a single highlighted citizen).
 */
export function Citizen({ citizen, theme = medievalTheme, walking }: CitizenProps) {
  const bodyRef = useRef<Group>(null);
  const legLRef = useRef<Mesh>(null);
  const legRRef = useRef<Mesh>(null);

  const geometries = getCitizenGeometries();
  const skinMaterial = getThemeMaterials(theme).citizens.skin;
  const outfit = useMemo(() => resolveOutfit(theme, citizen.outfitId), [theme, citizen.outfitId]);

  const tunicMaterial = getClothMaterial(outfit.tunic);
  const trouserMaterial = getClothMaterial(outfit.trouser);
  const accentMaterial = getClothMaterial(outfit.accent);

  const isWalking = walking ?? citizen.status === "walking";
  const legSpacing = citizenKit.leg.spacing;

  useFrame(() => {
    const phase = citizen.animPhase + performance.now() * 0.001 * CITIZENS.strideFrequency;
    const pose = walkPose(phase, isWalking ? 1 : 0);
    if (legLRef.current) legLRef.current.rotation.x = pose.legSwingLeft;
    if (legRRef.current) legRRef.current.rotation.x = pose.legSwingRight;
    if (bodyRef.current) bodyRef.current.position.y = pose.bob * 0.5;
  });

  return (
    <group>
      <group ref={bodyRef}>
        <mesh
          ref={legLRef}
          geometry={geometries.leg}
          material={trouserMaterial}
          position={[-legSpacing, CITIZEN_LOCAL_Y.leg, 0]}
        />
        <mesh
          ref={legRRef}
          geometry={geometries.leg}
          material={trouserMaterial}
          position={[legSpacing, CITIZEN_LOCAL_Y.leg, 0]}
        />
        <mesh geometry={geometries.torso} material={tunicMaterial} position={[0, CITIZEN_LOCAL_Y.torso, 0]} />
        <mesh geometry={geometries.waistband} material={accentMaterial} position={[0, CITIZEN_LOCAL_Y.waistband, 0]} />
        <mesh geometry={geometries.head} material={skinMaterial} position={[0, CITIZEN_LOCAL_Y.head, 0]} />
      </group>
    </group>
  );
}
