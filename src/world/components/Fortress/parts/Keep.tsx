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
  const { finialHeight, brimThickness, windowInset } = shapeKit.detail;
  const windowColumns = [-0.2, 0.2];
  const windowRows = [0.42, 0.68];

  const faces: { position: [number, number, number]; rotationY: number; horizontalAxis: "x" | "z" }[] = [
    { position: [0, 0, depth / 2 + windowInset], rotationY: 0, horizontalAxis: "x" },
    { position: [0, 0, -depth / 2 - windowInset], rotationY: Math.PI, horizontalAxis: "x" },
    { position: [width / 2 + windowInset, 0, 0], rotationY: Math.PI / 2, horizontalAxis: "z" },
    { position: [-width / 2 - windowInset, 0, 0], rotationY: -Math.PI / 2, horizontalAxis: "z" },
  ];

  return (
    <group>
      <mesh geometry={geometries.keepBody} material={bodyMaterial} position={[0, height / 2, 0]} castShadow receiveShadow />
      {faces.flatMap((face, faceIndex) =>
        windowRows.flatMap((row) =>
          windowColumns.map((column) => (
            <mesh
              key={`${faceIndex}-${row}-${column}`}
              geometry={geometries.window}
              material={windowMaterial}
              position={[
                face.position[0] + (face.horizontalAxis === "x" ? width * column : 0),
                height * row,
                face.position[2] + (face.horizontalAxis === "z" ? depth * column : 0),
              ]}
              rotation={[0, face.rotationY, 0]}
            />
          ))
        )
      )}
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
