"use client";

import { CONTRACTS } from "@/lib/contracts/addresses";
import { useNamespaceTree, type NamespaceNode } from "@/lib/ens";
import { AgentSubtree, type SelectedAgent } from "./AgentSubtree";

export function NamespaceTree({
  localNodes = [],
  selected,
  onSelect,
}: {
  /// Task 14: labels "spawned" at the free `Wildcard` tier (`useLocalWildcardAgents`) — never
  /// on-chain, so never part of `useNamespaceTree`'s `AgentSpawned`-sourced result. Rendered
  /// alongside the real tree so a wildcard spawn "appears on the tree immediately" with no tx.
  localNodes?: NamespaceNode[];
  selected: SelectedAgent | null;
  onSelect: (agent: SelectedAgent) => void;
}) {
  const { data: tree, isLoading, error } = useNamespaceTree();
  const combined = [...(tree ?? []), ...localNodes];

  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-black/10 bg-black/[.03] px-3 py-1.5 font-mono text-sm font-semibold dark:border-white/10 dark:bg-white/[.04]">
          {CONTRACTS.parentName}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">root — every agent below is a real Sepolia read</span>
      </div>

      {isLoading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Reading agent tree from Sepolia…</p>}
      {error && <p className="text-sm text-red-500">Failed to read tree: {error.message}</p>}
      {!isLoading && combined.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No agents spawned yet under {CONTRACTS.parentName}.</p>
      )}

      {combined.length > 0 && (
        <AgentSubtree nodes={combined} registry={CONTRACTS.agentRegistry} selected={selected} onSelect={onSelect} />
      )}
    </section>
  );
}
