"use client";

import { useLastHeartbeats, type NamespaceNode } from "@/lib/ens";
import { AgentNode } from "./AgentNode";

export type SelectedAgent = { registry: `0x${string}`; labelhash: `0x${string}` };

/// One level of the namespace tree: every node here shares a single `AgentRegistry` instance
/// (`registry`), so heartbeat history for the whole level is fetched once and handed down —
/// `Sovereign` children (task 07) recurse into their own `AgentSubtree` rooted at the agent's
/// own sub-registry.
export function AgentSubtree({
  nodes,
  registry,
  selected,
  onSelect,
  depth = 0,
}: {
  nodes: NamespaceNode[];
  registry: `0x${string}`;
  selected: SelectedAgent | null;
  onSelect: (agent: SelectedAgent) => void;
  depth?: number;
}) {
  const { data: lastHeartbeats } = useLastHeartbeats(registry);

  if (nodes.length === 0) return null;

  return (
    <ul className={depth === 0 ? "flex flex-col gap-3" : "mt-3 flex flex-col gap-3 border-l border-dashed border-black/10 pl-5 dark:border-white/10"}>
      {nodes.map((node) => (
        <li key={node.labelhash}>
          <AgentNode
            node={node}
            lastHeartbeat={lastHeartbeats?.get(node.labelhash)}
            isSelected={selected?.registry.toLowerCase() === registry.toLowerCase() && selected?.labelhash === node.labelhash}
            onSelect={(n) => onSelect({ registry, labelhash: n.labelhash })}
          />
          {node.children.length > 0 && (
            <AgentSubtree
              nodes={node.children}
              registry={node.subregistry}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
