"use client";

import { useMemo, useState } from "react";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { NamespaceTree } from "@/components/tree/NamespaceTree";
import type { SelectedAgent } from "@/components/tree/AgentSubtree";
import { AgentDetailPanel } from "@/components/detail/AgentDetailPanel";
import { buildResolverIndex, flattenNamespace, namespaceKey, useNamespaceTree } from "@/lib/ens";

export default function Home() {
  const { data: tree } = useNamespaceTree();
  const [selected, setSelected] = useState<SelectedAgent | null>(null);

  const directory = useMemo(() => (tree ? flattenNamespace(tree) : new Map()), [tree]);
  const resolverIndex = useMemo(() => (tree ? buildResolverIndex(tree) : new Map()), [tree]);
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

      <main className="mx-auto w-full max-w-3xl">
        <NamespaceTree selected={selected} onSelect={setSelected} />
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
