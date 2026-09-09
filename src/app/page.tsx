"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { NamespaceTree } from "@/components/tree/NamespaceTree";
import type { SelectedAgent } from "@/components/tree/AgentSubtree";
import { AgentDetailPanel } from "@/components/detail/AgentDetailPanel";
import { SpawnAgentForm } from "@/components/lifecycle/SpawnAgentForm";
import {
  buildResolverIndex,
  flattenNamespace,
  localWildcardToNode,
  namespaceKey,
  useLocalWildcardAgents,
  useNamespaceTree,
} from "@/lib/ens";

export default function Home() {
  const { data: tree } = useNamespaceTree();
  const { agents: localAgents, add: addLocalAgent, remove: removeLocalAgent } = useLocalWildcardAgents();
  const [selected, setSelected] = useState<SelectedAgent | null>(null);

  // Task 14: once a locally-previewed wildcard label is minted for real (via "Register
  // on-chain" or a fresh non-Wildcard spawn), it shows up in the real, event-sourced tree —
  // drop the local placeholder so it isn't rendered twice.
  const mintedLabels = useMemo(() => new Set((tree ?? []).map((n) => n.label)), [tree]);
  useEffect(() => {
    for (const agent of localAgents) {
      if (mintedLabels.has(agent.label)) removeLocalAgent(agent.label);
    }
  }, [localAgents, mintedLabels, removeLocalAgent]);

  const localNodes = useMemo(
    () => localAgents.filter((a) => !mintedLabels.has(a.label)).map(localWildcardToNode),
    [localAgents, mintedLabels]
  );

  const combinedTree = useMemo(() => [...(tree ?? []), ...localNodes], [tree, localNodes]);
  const directory = useMemo(() => flattenNamespace(combinedTree), [combinedTree]);
  const resolverIndex = useMemo(() => buildResolverIndex(combinedTree), [combinedTree]);
  const selectedNode = selected ? directory.get(namespaceKey(selected.registry, selected.labelhash)) ?? null : null;

  return (
    <div className="flex flex-1 flex-col gap-8 bg-zinc-50 px-6 py-8 dark:bg-black sm:px-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">AgentVillage</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Live ENSv2 namespace — agents, tiers, and heartbeats read straight off Sepolia.
          </p>
        </div>
        <ConnectWallet />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <SpawnAgentForm onSpawnedLocally={addLocalAgent} />
        <NamespaceTree localNodes={localNodes} selected={selected} onSelect={setSelected} />
      </main>

      <AgentDetailPanel
        node={selectedNode}
        directory={directory}
        resolverIndex={resolverIndex}
        onClose={() => setSelected(null)}
        onSelectChild={setSelected}
      />
    </div>
  );
}
