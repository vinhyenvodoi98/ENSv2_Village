"use client";

import { fortressPresets } from "./fortress.presets";

interface FortressProps {
  preset?: keyof typeof fortressPresets;
}

/** Renders a fortress from its preset part list. Stub for task 20 — built in task 24. */
export function Fortress({ preset = "medieval" }: FortressProps) {
  void fortressPresets[preset];
  return null;
}
