import type { Metadata } from "next";
import { Suspense } from "react";
import WorldRoot from "./WorldRoot";

export const metadata: Metadata = {
  title: "AgentVillage",
  description: "The live ENSv2 agent tree, as a world map read straight off Sepolia.",
};

/**
 * Task 29 merged the two tracks that used to run side by side — the ENSv2 tree
 * at `/` and the 3D world at `/threejs` — into one screen. The world *is* the
 * namespace UI now: one castle per `NamespaceNode`, read from chain.
 *
 * Task 31: `WorldRoot` reads `?kingdom=` via `useSearchParams()`, which the App
 * Router requires a `<Suspense>` boundary for — the canvas already handles its
 * own loading state, so `fallback={null}` introduces no visible flash.
 */
export default function Home() {
  return (
    <Suspense fallback={null}>
      <WorldRoot />
    </Suspense>
  );
}
