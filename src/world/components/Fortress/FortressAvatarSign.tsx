"use client";

import { useState } from "react";
import { Html } from "@react-three/drei";
import { avatarImageUrl } from "@/lib/ens/avatar";
import type { ShapeKit } from "@/world/config/shapeKit";
import styles from "./FortressAvatarSign.module.css";

interface FortressAvatarSignProps {
  avatar: string;
  name: string;
  shapeKit: ShapeKit;
  derelict?: boolean;
}

function monogramFor(name: string): string {
  const letters = name
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return letters || "ENS";
}

function AvatarArtwork({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={styles.fallback}>{monogramFor(name)}</span>;

  return (
    // Avatar records are user-controlled remote/data URLs, so Next Image cannot know their hosts at build time.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      className={styles.avatar}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/** ENS avatar rendered as a small heraldic plaque on the central keep. */
export function FortressAvatarSign({ avatar, name, shapeKit, derelict = false }: FortressAvatarSignProps) {
  const src = avatarImageUrl(avatar);
  const { keep, detail } = shapeKit;

  return (
    <Html
      position={[
        0,
        keep.height * detail.avatarSignHeightRatio,
        keep.depth / 2 + detail.avatarSignSurfaceOffset,
      ]}
      center
      distanceFactor={detail.avatarSignDistanceFactor}
      zIndexRange={[12, 0]}
      className={styles.anchor}
    >
      <div
        className={`${styles.plate}${derelict ? ` ${styles.derelict}` : ""}`}
        role="img"
        aria-label={`${name} ENS avatar`}
        title={`${name} — ENS avatar`}
      >
        <AvatarArtwork key={src ?? avatar} src={src} name={name} />
      </div>
    </Html>
  );
}
