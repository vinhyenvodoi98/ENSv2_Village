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

const WINDOW_ANGLES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];

/**
 * Corner/wall tower: a tapered cylinder body with a conical roof, a ring of
 * arrow-slit windows, a jutting timber brim under the eaves, and a spike
 * finial on the tip.
 */
export function Tower({ shapeKit, bodyMaterial, roofMaterial, windowMaterial }: TowerProps) {
  const geometries = getPartGeometries(shapeKit);
  const { radius, height, roofHeight, taper } = shapeKit.tower;
  const { finialHeight, brimThickness } = shapeKit.detail;
  const windowHeightFraction = 0.6;
  const windowY = height * windowHeightFraction;
  // The body tapers linearly from `radius` at the base to `radius * taper`
  // at the top, so the window ring must sit on the interpolated surface —
  // pinning it to the base radius would float it outside a narrowed tower.
  const windowRadius = radius - windowHeightFraction * (radius - radius * taper) + 0.005;

  return (
    <group>
      <mesh geometry={geometries.towerBody} material={bodyMaterial} position={[0, height / 2, 0]} castShadow receiveShadow />
      {WINDOW_ANGLES.map((angle) => (
        <mesh
          key={angle}
          geometry={geometries.window}
          material={windowMaterial}
          position={[windowRadius * Math.sin(angle), windowY, windowRadius * Math.cos(angle)]}
          rotation={[0, angle, 0]}
        />
      ))}
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
