"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, Quaternion, Vector3, type InstancedMesh } from "three";
import { useWorldStore } from "@/world/state/useWorldStore";
import { medievalTheme } from "@/world/config/theme";
import { getThemeMaterials } from "@/world/config/materials";
import { CITIZENS, HEX_HEIGHT, POPULATION_CAP, TICK_RATE } from "@/world/config/world.config";
import { citizenKit } from "@/world/config/citizenKit";
import { coordKey, hexToWorld } from "@/world/core/hex";
import type { AxialCoord, Citizen as CitizenData } from "@/world/core/types";
import { getCitizenGeometries, CITIZEN_LOCAL_Y, walkPose } from "./citizenGeometry";
import { buildCitizenPathCurve, sampleCitizenPose } from "./citizenPath";
import { resolveOutfit } from "./outfits";

interface CitizenCrowdProps {
  theme?: typeof medievalTheme;
}

interface CitizenSnapshot {
  status: CitizenData["status"];
  progress: number;
  path: AxialCoord[];
}

const UP_AXIS = new Vector3(0, 1, 0);
const RIGHT_AXIS = new Vector3(1, 0, 0);
const MAX_CATCHUP_TICKS = 5;

/**
 * Renders every citizen through four instanced meshes (legs, torso,
 * waistband, head) — a fixed handful of draw calls regardless of population.
 * Also owns the fixed-tick accumulator that drives `citizenSystem.tickCitizens`
 * via the store, interpolating render position between ticks so frame rate
 * never changes walking speed.
 */
export function CitizenCrowd({ theme = medievalTheme }: CitizenCrowdProps) {
  const geometries = getCitizenGeometries();
  const materials = getThemeMaterials(theme).citizens;

  const legMeshRef = useRef<InstancedMesh>(null);
  const torsoMeshRef = useRef<InstancedMesh>(null);
  const waistMeshRef = useRef<InstancedMesh>(null);
  const headMeshRef = useRef<InstancedMesh>(null);

  const accumulatorRef = useRef(0);
  const prevSnapshotRef = useRef<Map<string, CitizenSnapshot>>(new Map());
  const pathCurveCacheRef = useRef<Map<string, { path: AxialCoord[]; curve: ReturnType<typeof buildCitizenPathCurve> }>>(
    new Map()
  );
  const coloredIdsRef = useRef<Set<string>>(new Set());
  const themeRef = useRef(theme);

  const dummy = useMemo(() => new Object3D(), []);
  const qHeading = useMemo(() => new Quaternion(), []);
  const qSwing = useMemo(() => new Quaternion(), []);
  const legOffset = useMemo(() => new Vector3(), []);
  const poseOut = useMemo(() => ({ position: new Vector3(), headingRad: 0 }), []);
  const scratchColor = useMemo(() => new Color(), []);

  useFrame((_, delta) => {
    if (themeRef.current !== theme) {
      themeRef.current = theme;
      coloredIdsRef.current.clear();
    }

    const tickDt = 1 / TICK_RATE;
    // Cap catch-up ticks so a stalled tab (huge `delta` on refocus) can't block the main thread replaying a backlog.
    accumulatorRef.current = Math.min(accumulatorRef.current + delta, tickDt * MAX_CATCHUP_TICKS);

    while (accumulatorRef.current >= tickDt) {
      const state = useWorldStore.getState();
      if (state.citizens.size > 0) {
        const snapshot = new Map<string, CitizenSnapshot>();
        for (const [id, citizen] of state.citizens) {
          snapshot.set(id, { status: citizen.status, progress: citizen.progress, path: citizen.path });
        }
        prevSnapshotRef.current = snapshot;
        state.tickWorld(tickDt);
      }
      accumulatorRef.current -= tickDt;
    }

    const legMesh = legMeshRef.current;
    const torsoMesh = torsoMeshRef.current;
    const waistMesh = waistMeshRef.current;
    const headMesh = headMeshRef.current;
    if (!legMesh || !torsoMesh || !waistMesh || !headMesh) return;

    const state = useWorldStore.getState();
    const { citizenList, tiles } = state;
    const count = Math.min(citizenList.length, POPULATION_CAP);
    const alpha = Math.min(1, accumulatorRef.current / tickDt);

    let colorsChanged = false;
    const elapsed = performance.now() * 0.001;

    for (let i = 0; i < count; i++) {
      const citizen = citizenList[i];

      if (!coloredIdsRef.current.has(citizen.id)) {
        const outfit = resolveOutfit(theme, citizen.outfitId);
        torsoMesh.setColorAt(i, scratchColor.set(outfit.tunic));
        waistMesh.setColorAt(i, scratchColor.set(outfit.accent));
        legMesh.setColorAt(i * 2, scratchColor.set(outfit.trouser));
        legMesh.setColorAt(i * 2 + 1, scratchColor.set(outfit.trouser));
        coloredIdsRef.current.add(citizen.id);
        colorsChanged = true;
      }

      const prev = prevSnapshotRef.current.get(citizen.id);
      const isWalking = citizen.status === "walking";
      let renderProgress = citizen.progress;
      if (isWalking && prev?.status === "walking" && prev.path === citizen.path) {
        renderProgress = prev.progress + (citizen.progress - prev.progress) * alpha;
      }

      let px: number;
      let py: number;
      let pz: number;
      let heading = citizen.animPhase;
      let walking = false;

      if (isWalking) {
        let cached = pathCurveCacheRef.current.get(citizen.id);
        if (!cached || cached.path !== citizen.path) {
          cached = { path: citizen.path, curve: buildCitizenPathCurve(citizen.path, tiles) };
          pathCurveCacheRef.current.set(citizen.id, cached);
        }
        if (cached.curve) {
          sampleCitizenPose(cached.curve, renderProgress, citizen.lateralSign, poseOut);
          px = poseOut.position.x;
          py = poseOut.position.y;
          pz = poseOut.position.z;
          heading = poseOut.headingRad;
          walking = true;
        } else {
          const [x, z] = hexToWorld(citizen.position);
          px = x;
          pz = z;
          py = HEX_HEIGHT + (tiles.get(coordKey(citizen.position))?.height ?? 0);
        }
      } else {
        const [x, z] = hexToWorld(citizen.position);
        px = x;
        pz = z;
        py = HEX_HEIGHT + (tiles.get(coordKey(citizen.position))?.height ?? 0);
      }

      const phase = citizen.animPhase + elapsed * CITIZENS.strideFrequency;
      const pose = walkPose(phase, walking ? 1 : 0);
      const bobY = pose.bob * CITIZENS.bobHeight;

      qHeading.setFromAxisAngle(UP_AXIS, heading);

      dummy.quaternion.copy(qHeading);
      dummy.scale.set(1, 1, 1);

      dummy.position.set(px, py + CITIZEN_LOCAL_Y.torso + bobY, pz);
      dummy.updateMatrix();
      torsoMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, py + CITIZEN_LOCAL_Y.waistband + bobY, pz);
      dummy.updateMatrix();
      waistMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, py + CITIZEN_LOCAL_Y.head + bobY, pz);
      dummy.updateMatrix();
      headMesh.setMatrixAt(i, dummy.matrix);

      legOffset.set(-citizenKit.leg.spacing, CITIZEN_LOCAL_Y.leg, 0).applyQuaternion(qHeading);
      qSwing.setFromAxisAngle(RIGHT_AXIS, pose.legSwingLeft);
      dummy.position.set(px + legOffset.x, py + legOffset.y, pz + legOffset.z);
      dummy.quaternion.copy(qHeading).multiply(qSwing);
      dummy.updateMatrix();
      legMesh.setMatrixAt(i * 2, dummy.matrix);

      legOffset.set(citizenKit.leg.spacing, CITIZEN_LOCAL_Y.leg, 0).applyQuaternion(qHeading);
      qSwing.setFromAxisAngle(RIGHT_AXIS, pose.legSwingRight);
      dummy.position.set(px + legOffset.x, py + legOffset.y, pz + legOffset.z);
      dummy.quaternion.copy(qHeading).multiply(qSwing);
      dummy.updateMatrix();
      legMesh.setMatrixAt(i * 2 + 1, dummy.matrix);
    }

    torsoMesh.count = count;
    waistMesh.count = count;
    headMesh.count = count;
    legMesh.count = count * 2;

    torsoMesh.instanceMatrix.needsUpdate = true;
    waistMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    legMesh.instanceMatrix.needsUpdate = true;

    if (colorsChanged) {
      if (torsoMesh.instanceColor) torsoMesh.instanceColor.needsUpdate = true;
      if (waistMesh.instanceColor) waistMesh.instanceColor.needsUpdate = true;
      if (legMesh.instanceColor) legMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={legMeshRef}
        args={[geometries.leg, materials.clothBase, POPULATION_CAP * 2]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh
        ref={torsoMeshRef}
        args={[geometries.torso, materials.clothBase, POPULATION_CAP]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh
        ref={waistMeshRef}
        args={[geometries.waistband, materials.clothBase, POPULATION_CAP]}
        frustumCulled={false}
        castShadow
      />
      <instancedMesh
        ref={headMeshRef}
        args={[geometries.head, materials.skin, POPULATION_CAP]}
        frustumCulled={false}
        castShadow
      />
    </>
  );
}
