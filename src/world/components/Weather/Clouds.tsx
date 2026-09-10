"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { IcosahedronGeometry, MeshStandardMaterial, Object3D, type InstancedMesh } from "three";
import { useWorldStore } from "@/world/state/useWorldStore";
import { medievalTheme } from "@/world/config/theme";
import { WEATHER } from "@/world/config/world.config";
import { createRng, hashString } from "@/world/core/rng";

interface CloudsProps {
  theme?: typeof medievalTheme;
}

interface CloudPuff {
  /** Index into the shared per-volume base position this puff drifts with. */
  volume: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  scale: number;
}

interface CloudVolumeBase {
  x: number;
  y: number;
  z: number;
}

function seedCloudVolumes(count: number): CloudVolumeBase[] {
  const rng = createRng(hashString("weather-cloud-volumes"));
  return Array.from({ length: count }, () => ({
    x: (rng.next() * 2 - 1) * WEATHER.cloudWrapBound,
    y: WEATHER.cloudHeight + rng.next() * 4,
    z: (rng.next() * 2 - 1) * WEATHER.cloudWrapBound,
  }));
}

function seedCloudPuffs(volumeCount: number, puffsPerVolume: number): CloudPuff[] {
  const rng = createRng(hashString("weather-cloud-puffs"));
  const puffs: CloudPuff[] = [];
  for (let volume = 0; volume < volumeCount; volume++) {
    const heading = rng.next() * Math.PI * 2;
    const alongX = Math.cos(heading);
    const alongZ = Math.sin(heading);
    const acrossX = -alongZ;
    const acrossZ = alongX;

    for (let p = 0; p < puffsPerVolume; p++) {
      const spread = WEATHER.cloudClusterSpread;
      const normalized = puffsPerVolume === 1 ? 0 : p / (puffsPerVolume - 1) - 0.5;
      const along = normalized * spread * 2;
      // A narrow perpendicular jitter keeps every puff overlapping the next,
      // while avoiding an obviously straight row of identical primitives.
      const across = (rng.next() * 2 - 1) * WEATHER.cloudPuffRadius * 0.52;
      puffs.push({
        volume,
        offsetX: alongX * along + acrossX * across,
        offsetY:
          (rng.next() * 2 - 1) * WEATHER.cloudPuffRadius * 0.22
          + (1 - Math.abs(normalized) * 2) * WEATHER.cloudPuffRadius * 0.18,
        offsetZ: alongZ * along + acrossZ * across,
        scale:
          WEATHER.cloudPuffScaleMin
          + rng.next() * (WEATHER.cloudPuffScaleMax - WEATHER.cloudPuffScaleMin),
      });
    }
  }
  return puffs;
}

/** Wraps `value` into `[-bound, bound]` without a discontinuous jump inside the visible range — see `WEATHER.cloudWrapBound`. */
function wrapSigned(value: number, bound: number): number {
  const range = bound * 2;
  let wrapped = (value + bound) % range;
  if (wrapped < 0) wrapped += range;
  return wrapped - bound;
}

/**
 * A handful of cloud volumes, each a small cluster of low-poly puffs
 * (faceted icosahedrons, flat-shaded — the same look as the fortress and
 * citizens) drifting on `WEATHER.windVector` and wrapping at the map bounds.
 *
 * Deliberately doesn't use drei's `<Cloud>` — its default texture is fetched
 * from an external CDN via Suspense, and this canvas has no Suspense
 * boundary around it, so a slow/blocked fetch can tear down the whole scene
 * instead of just the clouds. Procedural geometry has no such dependency.
 */
export function Clouds({ theme = medievalTheme }: CloudsProps) {
  const volumes = useMemo(() => seedCloudVolumes(WEATHER.cloudCount), []);
  const puffs = useMemo(
    () => seedCloudPuffs(WEATHER.cloudCount, WEATHER.cloudPuffsPerVolume),
    []
  );
  const geometry = useMemo(() => new IcosahedronGeometry(WEATHER.cloudPuffRadius, 1), []);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: theme.weather.cloudColor,
        roughness: 1,
        metalness: 0,
        flatShading: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [theme]
  );

  const meshRef = useRef<InstancedMesh>(null);
  const windTimeRef = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    windTimeRef.current += delta;
    const t = windTimeRef.current;
    const [windX, , windZ] = WEATHER.windVector;

    const meshMaterial = mesh.material as MeshStandardMaterial;
    meshMaterial.opacity = useWorldStore.getState().weatherRender.cloudOpacity;

    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i];
      const base = volumes[puff.volume];
      const x = wrapSigned(base.x + windX * t, WEATHER.cloudWrapBound) + puff.offsetX;
      const z = wrapSigned(base.z + windZ * t, WEATHER.cloudWrapBound) + puff.offsetZ;
      dummy.position.set(x, base.y + puff.offsetY, z);
      dummy.scale.set(
        puff.scale * WEATHER.cloudWidthScale,
        puff.scale * WEATHER.cloudVerticalScale,
        puff.scale
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, puffs.length]}
      frustumCulled={false}
    />
  );
}
