"use client";

import type { Citizen as CitizenData } from "@/world/core/types";

interface CitizenProps {
  citizen: CitizenData;
}

/** A single citizen mesh. Stub for task 20 — built in task 26. */
export function Citizen({ citizen }: CitizenProps) {
  void citizen;
  return null;
}
