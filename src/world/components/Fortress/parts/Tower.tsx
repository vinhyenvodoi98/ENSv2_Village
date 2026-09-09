"use client";

import type { MeshStandardMaterial } from "three";
import type { ShapeKit } from "@/world/config/shapeKit";
import { getPartGeometries } from "./geometries";

interface TowerProps {
  shapeKit: ShapeKit;
  bodyMaterial: MeshStandardMaterial;
  roofMaterial: MeshStandardMaterial;
  windowMaterial: MeshStandardMaterial;
}

const WINDOW_ANGLES = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
const WINDOW_RINGS = [
  { heightFraction: 0.44, angleOffset: Math.PI / 4 },
  { heightFraction: 0.7, angleOffset: 0 },
] as const;

/**
 * Corner/wall tower: a tapered cylinder body with a conical roof, a ring of
 * arrow-slit windows, a jutting timber brim under the eaves, and a spike
 * finial on the tip.
 */
export function Tower({ shapeKit, bodyMaterial, roofMaterial, windowMaterial }: TowerProps) {
  const geometries = getPartGeometries(shapeKit);
  const { radius, height, roofHeight, taper } = shapeKit.tower;
  const { finialHeight, brimThickness, windowInset } = shapeKit.detail;

  return (
    <group>
      <mesh geometry={geometries.towerBody} material={bodyMaterial} position={[0, height / 2, 0]} castShadow receiveShadow />
      {WINDOW_RINGS.flatMap(({ heightFraction, angleOffset }) => {
        // The body tapers linearly, so each window ring hugs the masonry
        // instead of floating at the base radius.
        const windowRadius = radius - heightFraction * (radius - radius * taper) + windowInset;
        return WINDOW_ANGLES.map((baseAngle) => {
          const angle = baseAngle + angleOffset;
          return (
            <mesh
              key={`${heightFraction}-${angle}`}
              geometry={geometries.window}
              material={windowMaterial}
              position={[windowRadius * Math.sin(angle), height * heightFraction, windowRadius * Math.cos(angle)]}
              rotation={[0, angle, 0]}
            />
          );
        });
      })}
      <mesh
        geometry={geometries.towerBrim}
        material={roofMaterial}
        position={[0, height - brimThickness / 2, 0]}
        castShadow
      />
      <mesh
        geometry={geometries.towerRoof}
        material={roofMaterial}
        position={[0, height + roofHeight / 2, 0]}
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
