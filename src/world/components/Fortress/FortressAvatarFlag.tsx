"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  DoubleSide,
  MeshBasicMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Group,
  type MeshStandardMaterial,
} from "three";
import { avatarImageUrl } from "@/lib/ens/avatar";
import type { ShapeKit } from "@/world/config/shapeKit";
import { getPartGeometries } from "./parts/geometries";

interface FortressAvatarFlagProps {
  avatar: string;
  name: string;
  shapeKit: ShapeKit;
  clothMaterial: MeshStandardMaterial;
  frameMaterial: MeshStandardMaterial;
}

interface LoadedAvatar {
  texture: Texture;
  aspect: number;
}

function configureTexture(texture: Texture): number {
  const image = texture.image as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  } | undefined;
  const width = image?.naturalWidth || image?.width || 1;
  const height = image?.naturalHeight || image?.height || 1;
  const imageAspect = width / height;

  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return imageAspect;
}

/**
 * A true 3D avatar flag. Its geometry begins at x=0, the exact centerline of
 * the mast, so cloth and pole remain physically joined at every camera angle.
 */
export function FortressAvatarFlag({
  avatar,
  name,
  shapeKit,
  clothMaterial,
  frameMaterial,
}: FortressAvatarFlagProps) {
  const groupRef = useRef<Group>(null);
  const [loadedAvatar, setLoadedAvatar] = useState<LoadedAvatar | null>(null);
  const geometries = getPartGeometries(shapeKit);
  const src = avatarImageUrl(avatar);
  const {
    poleHeight,
    avatarPoleHeightScale,
    avatarFlagWidth,
    avatarFlagHeight,
    avatarFlagPadding,
  } = shapeKit.banner;
  const mastHeight = poleHeight * avatarPoleHeightScale;
  const availableWidth = avatarFlagWidth - avatarFlagPadding * 2;
  const availableHeight = avatarFlagHeight - avatarFlagPadding * 2;
  const availableAspect = availableWidth / availableHeight;
  const imageAspect = loadedAvatar?.aspect ?? 1;
  const imageWidth = imageAspect > availableAspect
    ? availableWidth
    : availableHeight * imageAspect;
  const imageHeight = imageAspect > availableAspect
    ? availableWidth / imageAspect
    : availableHeight;
  const avatarMaterial = useMemo(
    () => loadedAvatar
      ? new MeshBasicMaterial({ map: loadedAvatar.texture, side: DoubleSide, toneMapped: true, transparent: true })
      : null,
    [loadedAvatar]
  );

  useEffect(() => {
    if (!src) return;
    let active = true;
    let loadedTexture: Texture | null = null;
    const loader = new TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      src,
      (nextTexture) => {
        if (!active) {
          nextTexture.dispose();
          return;
        }
        loadedTexture = nextTexture;
        setLoadedAvatar({ texture: nextTexture, aspect: configureTexture(nextTexture) });
      },
      undefined,
      () => {
        // Keep the themed cloth fallback when a remote avatar rejects CORS or fails to load.
      }
    );

    return () => {
      active = false;
      loadedTexture?.dispose();
    };
  }, [src]);

  useEffect(() => () => avatarMaterial?.dispose(), [avatarMaterial]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(clock.elapsedTime * 1.65) * 0.075;
    groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 1.1 + 0.7) * 0.012;
  });

  return (
    <Billboard follow lockX lockZ position={[0, mastHeight - avatarFlagHeight / 2, 0]}>
      <group ref={groupRef} name={`${name} ENS avatar flag`}>
        <mesh geometry={geometries.avatarFlagFrame} material={frameMaterial} castShadow />
        <mesh
          geometry={geometries.avatarFlagFace}
          material={clothMaterial}
          position={[0, 0, 0.008]}
          castShadow
        />
        <mesh
          geometry={geometries.avatarFlagFace}
          material={clothMaterial}
          position={[0, 0, -0.008]}
          castShadow
        />
        {avatarMaterial ? (
          <>
            <mesh
              geometry={geometries.avatarImagePlane}
              material={avatarMaterial}
              position={[avatarFlagWidth / 2, 0, 0.016]}
              scale={[imageWidth, imageHeight, 1]}
            />
            <mesh
              geometry={geometries.avatarImagePlane}
              material={avatarMaterial}
              position={[avatarFlagWidth / 2, 0, -0.016]}
              scale={[imageWidth, imageHeight, 1]}
            />
          </>
        ) : null}
      </group>
    </Billboard>
  );
}
