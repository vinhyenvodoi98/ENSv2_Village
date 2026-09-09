"use client";

import dynamic from "next/dynamic";
import { WorldHud } from "@/world/ui/WorldHud";
import { DebugPanel } from "@/world/ui/DebugPanel";

const WorldCanvas = dynamic(
  () => import("@/world/components/Scene/WorldCanvas").then((mod) => mod.WorldCanvas),
  { ssr: false }
);

/**
 * The only file allowed to import the world engine. `three` touches `window`
 * at import time, so `WorldCanvas`'s client boundary + `ssr: false` is
 * mandatory. `WorldHud`/`DebugPanel` are plain Tailwind overlays — no three,
 * so they render normally alongside the canvas instead of inside it.
 */
export default function WorldClient() {
  return (
    <>
      <WorldCanvas />
      <WorldHud />
      <DebugPanel />
    </>
  );
}
