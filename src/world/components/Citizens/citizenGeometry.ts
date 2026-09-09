import { BoxGeometry, CapsuleGeometry, SphereGeometry } from "three";
import { citizenKit } from "@/world/config/citizenKit";
import { CITIZENS } from "@/world/config/world.config";

export interface CitizenGeometries {
  head: SphereGeometry;
  torso: CapsuleGeometry;
  leg: BoxGeometry;
  waistband: BoxGeometry;
}

let cached: CitizenGeometries | null = null;

/**
 * One set of low-poly primitive geometries, built once and shared by every
 * citizen instance (both the standalone `Citizen` figure and the instanced
 * crowd) — only placement and per-instance color differ between citizens.
 */
export function getCitizenGeometries(): CitizenGeometries {
  if (cached) return cached;
  cached = {
    head: new SphereGeometry(citizenKit.head.radius, 8, 6),
    torso: new CapsuleGeometry(citizenKit.torso.radius, citizenKit.torso.length, 2, 6),
    leg: new BoxGeometry(citizenKit.leg.width, citizenKit.leg.height, citizenKit.leg.depth),
    waistband: new BoxGeometry(citizenKit.waistband.width, citizenKit.waistband.height, citizenKit.waistband.depth),
  };
  return cached;
}

/** Local (feet-at-origin) y-offsets for each part's center, feet resting at y = 0. */
export const CITIZEN_LOCAL_Y = {
  leg: citizenKit.leg.height / 2,
  torso: citizenKit.leg.height + citizenKit.torso.radius + citizenKit.torso.length / 2,
  waistband: citizenKit.leg.height,
  head: citizenKit.leg.height + citizenKit.torso.length + citizenKit.torso.radius * 2 + citizenKit.head.radius,
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
    bob: Math.abs(Math.sin(phase)) * walking,
  };
}
