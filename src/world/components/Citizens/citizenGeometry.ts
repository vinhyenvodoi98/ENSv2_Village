import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from "three";
import { citizenKit } from "@/world/config/citizenKit";
import { CITIZENS } from "@/world/config/world.config";

export interface CitizenGeometries {
  head: SphereGeometry;
  torso: CapsuleGeometry;
  leg: BoxGeometry;
  arm: BoxGeometry;
  waistband: CylinderGeometry;
  mantle: CylinderGeometry;
  headwear: ConeGeometry;
}

let cached: CitizenGeometries | null = null;

/**
 * One set of low-poly primitive geometries, built once and shared by every
 * citizen instance (both the standalone `Citizen` figure and the instanced
 * crowd) — only placement and per-instance color differ between citizens.
 */
export function getCitizenGeometries(): CitizenGeometries {
  if (cached) return cached;
  const leg = new BoxGeometry(citizenKit.leg.width, citizenKit.leg.height, citizenKit.leg.depth);
  leg.translate(0, -citizenKit.leg.height / 2, 0);
  const arm = new BoxGeometry(citizenKit.arm.width, citizenKit.arm.height, citizenKit.arm.depth);
  arm.translate(0, -citizenKit.arm.height / 2, 0);

  cached = {
    head: new SphereGeometry(citizenKit.head.radius, 8, 6),
    torso: new CapsuleGeometry(citizenKit.torso.radius, citizenKit.torso.length, 2, 6),
    leg,
    arm,
    waistband: new CylinderGeometry(
      citizenKit.waistband.radius,
      citizenKit.waistband.radius,
      citizenKit.waistband.height,
      6
    ),
    mantle: new CylinderGeometry(
      citizenKit.mantle.topRadius,
      citizenKit.mantle.bottomRadius,
      citizenKit.mantle.height,
      6
    ),
    headwear: new ConeGeometry(citizenKit.headwear.radius, citizenKit.headwear.height, 6),
  };
  return cached;
}

/** Local (feet-at-origin) y-offsets for each part's center, feet resting at y = 0. */
export const CITIZEN_LOCAL_Y = {
  /** Hip joint; leg geometry extends downward from this pivot. */
  leg: citizenKit.leg.height,
  torso: citizenKit.leg.height + citizenKit.torso.radius + citizenKit.torso.length / 2,
  waistband: citizenKit.leg.height + citizenKit.waistband.height / 2,
  arm: citizenKit.leg.height + citizenKit.torso.length + citizenKit.torso.radius * 1.55,
  mantle: citizenKit.leg.height + citizenKit.torso.length + citizenKit.torso.radius * 1.72,
  head: citizenKit.leg.height + citizenKit.torso.length + citizenKit.torso.radius * 2 + citizenKit.head.radius,
  headwearBase:
    citizenKit.leg.height +
    citizenKit.torso.length +
    citizenKit.torso.radius * 2 +
    citizenKit.head.radius * 2,
} as const;

/**
 * Walk-cycle pose at a given phase (radians) and walking fraction (0 = fully
 * idle/still, 1 = full stride). Pure math, shared by the standalone figure
 * and the instanced crowd so they never drift out of sync.
 */
export function walkPose(phase: number, walking: number) {
  const swing = Math.sin(phase) * CITIZENS.legSwingRad * walking;
  return {
    legSwingLeft: swing,
    legSwingRight: -swing,
    armSwingLeft: -swing * CITIZENS.armSwingMultiplier,
    armSwingRight: swing * CITIZENS.armSwingMultiplier,
    bob: Math.abs(Math.sin(phase)) * walking,
    bodyLean: CITIZENS.bodyLeanRad * walking,
  };
}
