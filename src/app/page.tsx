import type { Metadata } from "next";
import WorldRoot from "./WorldRoot";

export const metadata: Metadata = {
  title: "AgentVillage",
  description: "Your ENSv2 names, as a world map read straight off Sepolia.",
};

/**
 * Task 29 merged the ENSv2 tree and the 3D world into one screen; a later redesign then
 * dropped root's own bespoke chrome in favor of the identical map + drawer `/ens/[name]`
 * renders (`WorldRoot.tsx`): one castle per name the connected wallet owns, no hierarchy
 * between them, clicking one opens the same tabbed state any other name's page opens.
 * `WorldRoot` no longer reads the URL, so no `<Suspense>` boundary is needed here.
 */
export default function Home() {
  return <WorldRoot />;
}
