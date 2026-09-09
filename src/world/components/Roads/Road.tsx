"use client";

import type { Road as RoadData } from "@/world/core/types";

interface RoadProps {
  road: RoadData;
}

/** A single road segment mesh. Stub for task 20 — built in task 25. */
export function Road({ road }: RoadProps) {
  void road;
  return null;
}
