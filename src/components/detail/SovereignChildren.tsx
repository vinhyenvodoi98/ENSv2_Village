import { zeroAddress } from "viem";
import type { NamespaceNode } from "@/lib/ens";
import { explorerAddressUrl } from "@/lib/explorer";
import { truncateAddress } from "@/lib/format";
import { TierBadge } from "@/components/tree/TierBadge";
import type { SelectedAgent } from "@/components/tree/AgentSubtree";

/// Task 12: a `Sovereign` agent shows its own sub-registry address and child list — the tree
/// (task 11) already walked this same sub-registry to build `node.children`, so this reuses
/// that instead of re-reading the chain.
export function SovereignChildren({
  node,
  onSelectChild,
}: {
  node: NamespaceNode;
  onSelectChild: (agent: SelectedAgent) => void;
}) {
  if (node.subregistry === zeroAddress) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No sub-registry attached yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <a
        href={explorerAddressUrl(node.subregistry)}
        target="_blank"
        rel="noreferrer"
        className="w-fit rounded-lg border border-black/10 bg-black/[.03] px-3 py-1.5 font-mono text-xs hover:border-black/25 dark:border-white/10 dark:bg-white/[.04] dark:hover:border-white/25"
      >
        sub-registry {truncateAddress(node.subregistry)} ↗
      </a>

      {node.children.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No child agents spawned in its namespace yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {node.children.map((child) => (
            <li key={child.labelhash}>
              <button
                type="button"
                onClick={() => onSelectChild({ registry: child.registry, labelhash: child.labelhash })}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-left text-sm hover:border-black/25 dark:border-white/10 dark:hover:border-white/25"
              >
                <span className="font-mono">{child.fullName}</span>
                <TierBadge tier={child.tier} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
