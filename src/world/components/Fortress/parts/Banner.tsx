"use client";

import type { MeshStandardMaterial } from "three";
import type { ShapeKit } from "@/world/config/shapeKit";
import { getPartGeometries } from "./geometries";

interface BannerProps {
  shapeKit: ShapeKit;
  /** One of the theme's cached banner-color variants, picked by seeded RNG. */
  bodyMaterial: MeshStandardMaterial;
  poleMaterial: MeshStandardMaterial;
}

/** A cloth banner near the top of a pole. */
export function Banner({ shapeKit, bodyMaterial, poleMaterial }: BannerProps) {
  const geometries = getPartGeometries(shapeKit);
  const { height: clothHeight, poleHeight } = shapeKit.banner;

  return (
    <group>
      <mesh geometry={geometries.bannerPole} material={poleMaterial} position={[0, poleHeight / 2, 0]} castShadow />
      <mesh
        geometry={geometries.bannerCloth}
        material={bodyMaterial}
        position={[0, poleHeight - clothHeight / 2, 0]}
        castShadow
      />
    </group>
  );
}
