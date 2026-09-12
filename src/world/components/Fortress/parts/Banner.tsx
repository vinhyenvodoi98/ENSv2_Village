"use client";

import type { MeshStandardMaterial } from "three";
import type { ShapeKit } from "@/world/config/shapeKit";
import { FortressAvatarFlag } from "../FortressAvatarFlag";
import { getPartGeometries } from "./geometries";

interface BannerProps {
  shapeKit: ShapeKit;
  /** One of the theme's cached banner-color variants, picked by seeded RNG. */
  bodyMaterial: MeshStandardMaterial;
  poleMaterial: MeshStandardMaterial;
  avatar?: string;
  avatarName?: string;
}

/** A cloth banner near the top of a pole. */
export function Banner({ shapeKit, bodyMaterial, poleMaterial, avatar, avatarName }: BannerProps) {
  const geometries = getPartGeometries(shapeKit);
  const {
    height: clothHeight,
    poleHeight,
    avatarPoleHeightScale,
    avatarPoleRadiusScale,
    avatarPoleSocketDepth,
    avatarPoleBaseHeight,
    avatarPoleCapHeight,
  } = shapeKit.banner;
  const hasAvatarFlag = Boolean(avatar && avatarName);
  const mastHeight = hasAvatarFlag ? poleHeight * avatarPoleHeightScale : poleHeight;
  const socketDepth = hasAvatarFlag ? avatarPoleSocketDepth : 0;
  const poleLengthScale = (mastHeight + socketDepth) / poleHeight;

  return (
    <group>
      <mesh
        geometry={geometries.bannerPole}
        material={poleMaterial}
        position={[0, (mastHeight - socketDepth) / 2, 0]}
        scale={hasAvatarFlag ? [avatarPoleRadiusScale, poleLengthScale, avatarPoleRadiusScale] : undefined}
        castShadow
      />
      {hasAvatarFlag ? (
        <>
          <mesh
            geometry={geometries.bannerPoleBase}
            material={poleMaterial}
            position={[0, avatarPoleBaseHeight / 2, 0]}
            castShadow
          />
          <mesh
            geometry={geometries.bannerPoleCap}
            material={poleMaterial}
            position={[0, mastHeight + avatarPoleCapHeight / 2, 0]}
            castShadow
          />
        </>
      ) : null}
      {avatar && avatarName ? (
        <FortressAvatarFlag
          key={avatar}
          avatar={avatar}
          name={avatarName}
          shapeKit={shapeKit}
          clothMaterial={bodyMaterial}
          frameMaterial={poleMaterial}
        />
      ) : (
        <mesh
          geometry={geometries.bannerCloth}
          material={bodyMaterial}
          position={[0, poleHeight - clothHeight / 2, 0]}
          castShadow
        />
      )}
    </group>
  );
}
