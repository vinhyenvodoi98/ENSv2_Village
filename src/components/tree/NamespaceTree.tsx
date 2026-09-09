"use client";

import { CONTRACTS } from "@/lib/contracts/addresses";
import { useNamespaceTree } from "@/lib/ens";
import { AgentSubtree, type SelectedAgent } from "./AgentSubtree";

export function NamespaceTree({
  selected,
  onSelect,
}: {
  selected: SelectedAgent | null;
  onSelect: (agent: SelectedAgent) => void;
}) {
  const { data: tree, isLoading, error } = useNamespaceTree();

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
      {tree && tree.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No agents spawned yet under {CONTRACTS.parentName}.</p>
      )}

      {tree && tree.length > 0 && (
        <AgentSubtree nodes={tree} registry={CONTRACTS.agentRegistry} selected={selected} onSelect={onSelect} />
      )}
    </section>
  );
}
