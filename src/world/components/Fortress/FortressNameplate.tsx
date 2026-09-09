"use client";

import { Html } from "@react-three/drei";
import styles from "./FortressNameplate.module.css";

interface FortressNameplateProps {
  name: string;
  positionY: number;
}

/** Camera-facing DOM label anchored to a point above the fortress roof. */
export function FortressNameplate({ name, positionY }: FortressNameplateProps) {
  return (
    <Html
      position={[0, positionY, 0]}
      center
      distanceFactor={18}
      zIndexRange={[20, 0]}
      className={styles.anchor}
    >
      <div className={styles.plate} role="note" aria-label={`Fortress ${name}`}>
        {name}
      </div>
    </Html>
  );
}
