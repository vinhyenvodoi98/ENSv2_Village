import { zeroAddress, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { fetchAgentTree, type AgentTreeNode } from "./useAgentTree";
import { useBlockGatedQuery } from "./query";

export type NamespaceNode = AgentTreeNode & {
  /// Dotted display name built by walking down from the fleet's parent name (task 11's "parent
  /// name at the root"), one label per hop — a plain client-side concatenation of on-chain
  /// labels, not a namehash lookup, since each hop's label is already read straight off-chain
  /// (the point task 10/11 care about — no mock/fixture — is the *labels themselves*, not the
  /// string-join logic that displays them).
  fullName: string;
  depth: number;
  /// The `AgentRegistry` instance this node actually lives in — the fleet's own for depth 0,
  /// or a `Sovereign` ancestor's own sub-registry (task 07) for anything nested under it. Reads
  /// about this node (records, roles, events) must target *this* address, not the fleet root.
  registry: `0x${string}`;
  children: NamespaceNode[];
};

/// Recursively walks the whole namespace: the fleet's own `AgentRegistry`, then — for every
/// `Sovereign`-tier node found (task 07's one-way "beyond parental control" tier) — its own
/// sub-registry, and so on to whatever depth the chain actually has. A `Sovereign` node's
/// `subregistry` is only ever meaningful once `promote` has attached one; the zero address means
/// "no children yet" and a malformed/non-`AgentRegistry` subregistry simply yields no children
/// rather than crashing the whole tree.
async function buildNamespace(
  publicClient: PublicClient,
  registry: `0x${string}`,
  parentName: string,
  depth: number
): Promise<NamespaceNode[]> {
  const nodes = await fetchAgentTree(publicClient, registry);

  return Promise.all(
    nodes.map(async (node) => {
      const fullName = `${node.label}.${parentName}`;
      let children: NamespaceNode[] = [];

      if (node.tier === "Sovereign" && node.subregistry !== zeroAddress) {
        try {
          children = await buildNamespace(publicClient, node.subregistry, fullName, depth + 1);
        } catch {
          children = [];
        }
      }

      return { ...node, fullName, depth, registry, children };
    })
  );
}

/// Flattens a namespace tree (any depth) into a lookup by `registry:labelhash` — the key detail
/// panels and record tables use to resolve "which agent does this node/parent-link point at"
/// without re-walking the tree themselves.
export function flattenNamespace(nodes: NamespaceNode[], out = new Map<string, NamespaceNode>()) {
  for (const node of nodes) {
    out.set(namespaceKey(node.registry, node.labelhash), node);
    if (node.children.length) flattenNamespace(node.children, out);
  }
  return out;
}

export function namespaceKey(registry: `0x${string}`, labelhash: `0x${string}`) {
  return `${registry.toLowerCase()}:${labelhash.toLowerCase()}`;
}

/// Maps a resolver address back to the `AgentRegistry` it belongs to. Every registry deploys
/// exactly one `AgentResolver` in its constructor (`defaultResolver`, task 07) and hands it out
/// to every agent it promotes — so a resolver address uniquely identifies "which registry's
/// nodes live here", which is exactly what's needed to turn `AgentResolver.parentOf`'s
/// `(parentResolver, parentNode)` pair (task 08 aliasing) back into a human label via
/// `flattenNamespace`'s directory.
export function buildResolverIndex(nodes: NamespaceNode[], out = new Map<string, `0x${string}`>()) {
  for (const node of nodes) {
    if (node.resolver !== zeroAddress) out.set(node.resolver.toLowerCase(), node.registry);
    if (node.children.length) buildResolverIndex(node.children, out);
  }
  return out;
}

/// The whole AgentVillage namespace, rooted at the fleet's parent name (`deployments.json`),
/// recursively including every `Sovereign` sub-registry — this is what task 11's tree view and
/// task 12's detail panel are both built on, so the two screens never disagree about what's on
/// chain.
export function useNamespaceTree() {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<NamespaceNode[]>(["namespaceTree", CONTRACTS.agentRegistry], async () => {
    if (!publicClient) throw new Error("useNamespaceTree: missing publicClient");
    return buildNamespace(publicClient, CONTRACTS.agentRegistry, CONTRACTS.parentName, 0);
  });
}
