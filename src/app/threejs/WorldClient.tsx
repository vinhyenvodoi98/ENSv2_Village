"use client";

import dynamic from "next/dynamic";

const WorldCanvas = dynamic(
  () => import("@/world/components/Scene/WorldCanvas").then((mod) => mod.WorldCanvas),
  { ssr: false }
);

/**
 * The only file allowed to import the world engine. `three` touches `window`
 * at import time, so this client boundary + `ssr: false` is mandatory.
 */
export default function WorldClient() {
  return <WorldCanvas />;
}
