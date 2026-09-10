"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { WorldHud } from "@/world/ui/WorldHud";
import { DebugPanel } from "@/world/ui/DebugPanel";
import { TilePanel } from "@/world/ui/TilePanel";
import { BuildBar } from "@/world/ui/BuildBar";
import { useWorldStore } from "@/world/state/useWorldStore";

const WorldCanvas = dynamic(
  () => import("@/world/components/Scene/WorldCanvas").then((mod) => mod.WorldCanvas),
  { ssr: false }
);

/**
 * The terrain sandbox. Since task 29 the *real* world lives at `/` and is
 * driven entirely by ENS; this route is kept (rather than redirected) as the
 * one place the world engine can be run with no RPC, no wallet and no chain
 * state — terrain, roads, citizens, weather and the fortress kits on their
 * own. Castles here are placed by hand and carry sandbox names, which is why
 * `setMode("sandbox")` is the first thing it does.
 *
 * `TilePanel` (tier / population / roads) is likewise sandbox-only: on `/` the
 * selected castle opens `AgentDetailPanel` instead, so the two never both
 * appear.
 */
export default function WorldClient() {
  const setMode = useWorldStore((state) => state.setMode);

  useEffect(() => {
    setMode("sandbox");
    return () => setMode("ens");
  }, [setMode]);

  return (
    <>
      <WorldCanvas />
      <WorldHud />
      <TilePanel />
      <BuildBar />
      <DebugPanel />
    </>
  );
}
