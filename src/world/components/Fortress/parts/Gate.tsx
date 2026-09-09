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

/** Gatehouse with a pointed, cross-braced iron portcullis in the opening. */
export function Gate({ shapeKit, bodyMaterial, roofMaterial, windowMaterial }: GateProps) {
  const geometries = getPartGeometries(shapeKit);
  const { width, height, depth } = shapeKit.gate;
  const postOffset = width / 2 - depth / 2;
  const openingWidth = width - depth * 2;
  const openingHalfWidth = openingWidth / 2;
  const portcullisHeight = height * shapeKit.detail.portcullisHeightRatio;
  const spikeHeight = shapeKit.detail.portcullisSpikeHeight;
  const barY = (portcullisHeight + spikeHeight) / 2;

  return (
    <group>
      <mesh geometry={geometries.gatePost} material={bodyMaterial} position={[-postOffset, height / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geometries.gatePost} material={bodyMaterial} position={[postOffset, height / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geometries.gateLintel} material={roofMaterial} position={[0, height + depth * 0.3, 0]} castShadow />
      {Array.from({ length: shapeKit.detail.portcullisBarCount }, (_, i) => {
        const t = i / (shapeKit.detail.portcullisBarCount - 1);
        const x = -openingHalfWidth * 0.82 + t * openingHalfWidth * 1.64;
        return (
          <group key={i} position={[x, 0, depth / 2 + shapeKit.detail.windowInset]}>
            <mesh geometry={geometries.portcullisBar} material={windowMaterial} position={[0, barY, 0]} castShadow />
            <mesh
              geometry={geometries.portcullisSpike}
              material={windowMaterial}
              position={[0, spikeHeight / 2, 0]}
              rotation={[0, 0, Math.PI]}
              castShadow
            />
          </group>
        );
      })}
      {Array.from({ length: shapeKit.detail.portcullisCrossbarCount }, (_, i) => (
        <mesh
          key={`crossbar-${i}`}
          geometry={geometries.portcullisCrossbar}
          material={windowMaterial}
          position={[
            0,
            portcullisHeight * ((i + 1) / (shapeKit.detail.portcullisCrossbarCount + 1)),
            depth / 2 + shapeKit.detail.windowInset,
          ]}
          castShadow
        />
      ))}
    </group>
  );
}
