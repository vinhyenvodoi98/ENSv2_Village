"use client";

import type { MeshStandardMaterial } from "three";
import type { ShapeKit } from "@/world/config/shapeKit";
import { getPartGeometries } from "./geometries";

interface KeepProps {
  shapeKit: ShapeKit;
  bodyMaterial: MeshStandardMaterial;
  roofMaterial: MeshStandardMaterial;
  windowMaterial: MeshStandardMaterial;
}

/**
 * Fortress keep: a box body with a pyramidal roof, an overhanging
 * timber-framed brim under the eaves, arched-window insets on all four
 * faces, and a spike finial — the small-scale echo of a grand medieval
 * great hall.
 */
export function Keep({ shapeKit, bodyMaterial, roofMaterial, windowMaterial }: KeepProps) {
  const geometries = getPartGeometries(shapeKit);
  const { width, depth, height, roofHeight } = shapeKit.keep;
  const { finialHeight, brimThickness } = shapeKit.detail;
  const windowY = height * 0.42;
  const windowEpsilon = 0.005;

  const faces: { offset: [number, number, number]; rotationY: number }[] = [
    { offset: [0, 0, depth / 2 + windowEpsilon], rotationY: 0 },
    { offset: [0, 0, -depth / 2 - windowEpsilon], rotationY: Math.PI },
    { offset: [width / 2 + windowEpsilon, 0, 0], rotationY: Math.PI / 2 },
    { offset: [-width / 2 - windowEpsilon, 0, 0], rotationY: -Math.PI / 2 },
  ];

  return (
    <group>
      <mesh geometry={geometries.keepBody} material={bodyMaterial} position={[0, height / 2, 0]} castShadow receiveShadow />
      {faces.map((face, i) => (
        <mesh
          key={i}
          geometry={geometries.window}
          material={windowMaterial}
          position={[face.offset[0], windowY, face.offset[2]]}
          rotation={[0, face.rotationY, 0]}
        />
      ))}
      <mesh
        geometry={geometries.keepBrim}
        material={roofMaterial}
        position={[0, height - brimThickness / 2, 0]}
        castShadow
      />
      <mesh
        geometry={geometries.keepRoof}
        material={roofMaterial}
        position={[0, height + roofHeight / 2, 0]}
        rotation={[0, Math.PI / 4, 0]}
        castShadow
      />
      <mesh
        geometry={geometries.finial}
        material={roofMaterial}
        position={[0, height + roofHeight + finialHeight / 2, 0]}
        castShadow
      />
    </group>
  );
}
