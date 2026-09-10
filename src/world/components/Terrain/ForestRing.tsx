"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { ConeGeometry, CylinderGeometry, Object3D, type InstancedMesh } from "three";
import { getThemeMaterials } from "@/world/config/materials";
import { medievalTheme } from "@/world/config/theme";
import { SCENERY, WORLD_SEED } from "@/world/config/world.config";
import { distance, worldToHex } from "@/world/core/hex";
import { createRng, hashString } from "@/world/core/rng";

interface ForestRingProps {
  theme?: typeof medievalTheme;
}

interface TreePlacement {
  x: number;
  z: number;
  height: number;
  width: number;
  rotation: number;
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function clearsStream(x: number, z: number): boolean {
  for (let i = 1; i < SCENERY.streamPoints.length; i++) {
    const [ax, az] = SCENERY.streamPoints[i - 1];
    const [bx, bz] = SCENERY.streamPoints[i];
    if (distanceToSegment(x, z, ax, az, bx, bz) < SCENERY.streamTreeClearance) return false;
  }
  return true;
}

function createTreePlacements(): TreePlacement[] {
  const rng = createRng(hashString(`${WORLD_SEED}:forest-ring`));
  const placements: TreePlacement[] = [];
  const bound = SCENERY.groundSize / 2 - SCENERY.treeMaxHeight;
  const maxAttempts = SCENERY.forestTreeCount * 30;

  for (let attempt = 0; attempt < maxAttempts && placements.length < SCENERY.forestTreeCount; attempt++) {
    const x = (rng.next() * 2 - 1) * bound;
    const z = (rng.next() * 2 - 1) * bound;
    const ringDistance = distance({ q: 0, r: 0 }, worldToHex(x, z));
    if (ringDistance < SCENERY.forestInnerRadiusTiles || ringDistance > SCENERY.forestOuterRadiusTiles) continue;
    if (!clearsStream(x, z)) continue;

    placements.push({
      x,
      z,
      height: SCENERY.treeMinHeight + rng.next() * (SCENERY.treeMaxHeight - SCENERY.treeMinHeight),
      width: SCENERY.treeMinWidth + rng.next() * (SCENERY.treeMaxWidth - SCENERY.treeMinWidth),
      rotation: rng.next() * Math.PI * 2,
    });
  }
  return placements;
}

/** Deterministic low-poly pines rendered in three instanced draw calls. */
export function ForestRing({ theme = medievalTheme }: ForestRingProps) {
  const trees = useMemo(() => createTreePlacements(), []);
  const trunkRef = useRef<InstancedMesh>(null);
  const lowerRef = useRef<InstancedMesh>(null);
  const upperRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const geometries = useMemo(
    () => ({
      trunk: new CylinderGeometry(SCENERY.trunkRadius * 0.75, SCENERY.trunkRadius, SCENERY.trunkHeight, 6),
      foliage: new ConeGeometry(SCENERY.foliageRadius, SCENERY.foliageHeight, 7),
    }),
    []
  );
  const materials = getThemeMaterials(theme).terrain;

  useLayoutEffect(() => {
    const trunk = trunkRef.current;
    const lower = lowerRef.current;
    const upper = upperRef.current;
    if (!trunk || !lower || !upper) return;

    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      const heightScale = tree.height / SCENERY.treeMaxHeight;
      const trunkHeight = SCENERY.trunkHeight * (0.75 + heightScale * 0.55);
      const foliageScaleY = tree.height / (SCENERY.foliageHeight * (1 + SCENERY.upperFoliageScale * 0.72));

      dummy.rotation.set(0, tree.rotation, 0);
      dummy.position.set(tree.x, SCENERY.groundY + trunkHeight / 2, tree.z);
      dummy.scale.set(tree.width, trunkHeight / SCENERY.trunkHeight, tree.width);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tree.x, SCENERY.groundY + trunkHeight + SCENERY.foliageHeight * foliageScaleY * 0.34, tree.z);
      dummy.scale.set(tree.width, foliageScaleY, tree.width);
      dummy.updateMatrix();
      lower.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tree.x, SCENERY.groundY + trunkHeight + SCENERY.foliageHeight * foliageScaleY * 0.88, tree.z);
      dummy.scale.set(
        tree.width * SCENERY.upperFoliageScale,
        foliageScaleY * SCENERY.upperFoliageScale,
        tree.width * SCENERY.upperFoliageScale
      );
      dummy.updateMatrix();
      upper.setMatrixAt(i, dummy.matrix);
    }

    trunk.instanceMatrix.needsUpdate = true;
    lower.instanceMatrix.needsUpdate = true;
    upper.instanceMatrix.needsUpdate = true;
    trunk.computeBoundingSphere();
    lower.computeBoundingSphere();
    upper.computeBoundingSphere();
  }, [dummy, trees]);

  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[undefined, undefined, trees.length]}
        geometry={geometries.trunk}
        material={materials.treeTrunk}
      />
      <instancedMesh
        ref={lowerRef}
        args={[undefined, undefined, trees.length]}
        geometry={geometries.foliage}
        material={materials.pineLower}
        castShadow
      />
      <instancedMesh
        ref={upperRef}
        args={[undefined, undefined, trees.length]}
        geometry={geometries.foliage}
        material={materials.pineUpper}
        castShadow
      />
    </group>
  );
}
