"use client";

import type { MeshStandardMaterial } from "three";
import type { ShapeKit } from "@/world/config/shapeKit";
import { getPartGeometries } from "./geometries";

interface GateProps {
  shapeKit: ShapeKit;
  bodyMaterial: MeshStandardMaterial;
  roofMaterial: MeshStandardMaterial;
  windowMaterial: MeshStandardMaterial;
}

const PORTCULLIS_BAR_COUNT = 5;

/** Gatehouse: two posts with a lintel, and a portcullis of iron bars hanging in the opening. */
export function Gate({ shapeKit, bodyMaterial, roofMaterial, windowMaterial }: GateProps) {
  const geometries = getPartGeometries(shapeKit);
  const { width, height, depth } = shapeKit.gate;
  const postOffset = width / 2 - depth / 2;
  const openingHalfWidth = postOffset - depth / 2;
  const barY = (height * 0.85) / 2;

  return (
    <group>
      <mesh geometry={geometries.gatePost} material={bodyMaterial} position={[-postOffset, height / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geometries.gatePost} material={bodyMaterial} position={[postOffset, height / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geometries.gateLintel} material={roofMaterial} position={[0, height + depth * 0.3, 0]} castShadow />
      {Array.from({ length: PORTCULLIS_BAR_COUNT }, (_, i) => {
        const t = i / (PORTCULLIS_BAR_COUNT - 1);
        const x = -openingHalfWidth * 0.85 + t * openingHalfWidth * 1.7;
        return <mesh key={i} geometry={geometries.portcullisBar} material={windowMaterial} position={[x, barY, 0]} />;
      })}
    </group>
  );
}
