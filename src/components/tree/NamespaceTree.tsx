"use client";

import { CONTRACTS } from "@/lib/contracts/addresses";
import { useKingdomOwner, useNamespaceTree, type NamespaceNode } from "@/lib/ens";
import { explorerAddressUrl } from "@/lib/explorer";
import { truncateAddress } from "@/lib/format";
import { AgentSubtree, type SelectedAgent } from "./AgentSubtree";

export function NamespaceTree({
  nodes,
  localNodes = [],
  selected,
  onSelect,
  onSpawnRoot,
  kingdomName = CONTRACTS.parentName,
  registry = CONTRACTS.agentRegistry,
}: {
  /// Pre-merged tree to render. Task 29's root page passes the same array it projects onto the
  /// 3D map, so the list and the map can never disagree about what exists. Omitted (e.g. a
  /// standalone embedding) means "read it yourself" — the query is shared, so this costs nothing.
  nodes?: NamespaceNode[];
  /// Task 14: labels "spawned" at the free `Wildcard` tier (`useLocalWildcardAgents`) — never
  /// on-chain, so never part of `useNamespaceTree`'s `AgentSpawned`-sourced result. Rendered
  /// alongside the real tree so a wildcard spawn "appears on the tree immediately" with no tx.
  localNodes?: NamespaceNode[];
  selected: SelectedAgent | null;
  onSelect: (agent: SelectedAgent) => void;
  /// Task: root itself is a spawn shortcut, same as clicking a castle opens
  /// *its* spawn section — the root chip is the root's equivalent of a
  /// castle. Omitted keeps the chip inert (e.g. a read-only embedding).
  onSpawnRoot?: () => void;
  /// Task 31/32: the kingdom this list's root chip and empty-state text name — the caller's
  /// currently active kingdom, not always the fleet's. Defaults to `CONTRACTS.parentName` so a
  /// standalone embedding (no caller-supplied tree) keeps working unchanged.
  kingdomName?: string;
  /// The `AgentRegistry` the root-level nodes actually live in — must match `nodes`' own
  /// `.registry` field or clicking a root-level agent won't resolve against `directory`/
  /// `resolverIndex` (both keyed by each node's real registry, read off chain).
  registry?: `0x${string}`;
}) {
  const { data: tree, isLoading, error } = useNamespaceTree(kingdomName, { enabled: !nodes });
  const { data: owner } = useKingdomOwner(kingdomName);
  const combined = nodes ?? [...(tree ?? []), ...localNodes];

  return (
    <section className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-1.5 rounded-lg border border-black/10 bg-black/[.03] px-3 py-2.5 dark:border-white/10 dark:bg-white/[.04]">
        <div className="flex items-center justify-between gap-2">
          {onSpawnRoot ? (
            <button
              type="button"
              onClick={onSpawnRoot}
              title={`Spawn a new agent under ${kingdomName}`}
              className="group flex items-center font-mono text-sm font-semibold transition-colors hover:text-[#c9a15a]"
            >
              {kingdomName}
              <span aria-hidden className="ml-1.5 text-[#c9a15a] opacity-0 transition-opacity group-hover:opacity-100">
                ⚑
              </span>
            </button>
          ) : (
            <span className="font-mono text-sm font-semibold">{kingdomName}</span>
          )}
          <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            root
          </span>
        </div>

        {/* The ENS name is just a label — this is the wallet it actually resolves to,
            one click from Etherscan for anyone who wants to verify it themselves. */}
        {owner && (
          <a
            href={explorerAddressUrl(owner)}
            target="_blank"
            rel="noreferrer"
            className="w-fit font-mono text-xs text-zinc-500 hover:text-[#c9a15a] hover:underline dark:text-zinc-400"
          >
            {truncateAddress(owner)} ↗
          </a>
        )}
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {onSpawnRoot ? "Click the name above to spawn here, or browse the tree below." : "Every agent below is a real Sepolia read."}
      </p>

      {isLoading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Reading agent tree from Sepolia…</p>}
      {error && <p className="text-sm text-red-500">Failed to read tree: {error.message}</p>}
      {!isLoading && combined.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No agents spawned yet under {kingdomName}.</p>
      )}

      {combined.length > 0 && (
        <AgentSubtree nodes={combined} registry={registry} selected={selected} onSelect={onSelect} />
      )}
    </section>
  );
}
