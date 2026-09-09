"use client";

import type { MeshStandardMaterial } from "three";
import type { ShapeKit } from "@/world/config/shapeKit";
import { getPartGeometries } from "./geometries";

interface WallProps {
  shapeKit: ShapeKit;
  bodyMaterial: MeshStandardMaterial;
}

/** Fortress wall segment: a single box, placed and rotated by the preset. */
export function Wall({ shapeKit, bodyMaterial }: WallProps) {
  const geometries = getPartGeometries(shapeKit);
  const { height } = shapeKit.wall;

  return (
    <mesh geometry={geometries.wall} material={bodyMaterial} position={[0, height / 2, 0]} castShadow receiveShadow />
  );
}
