"use client";

import type { MeshStandardMaterial } from "three";
import type { ShapeKit } from "@/world/config/shapeKit";
import { getPartGeometries } from "./geometries";

interface MerlonProps {
  shapeKit: ShapeKit;
  bodyMaterial: MeshStandardMaterial;
}

/** A single raised tooth; gaps between placements form the wall's embrasures. */
export function Merlon({ shapeKit, bodyMaterial }: MerlonProps) {
  const geometries = getPartGeometries(shapeKit);
  const { height } = shapeKit.merlon;

  return (
    <mesh geometry={geometries.merlon} material={bodyMaterial} position={[0, height / 2, 0]} castShadow />
  );
}
