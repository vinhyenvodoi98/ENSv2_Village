import { zeroAddress, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { ethRegistryAbi } from "@/lib/contracts/abis";
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
  /// Task 14: a `Wildcard`-tier spawn is genuinely free — no `AgentRegistry.spawn` tx, nothing
  /// written on-chain (task 06's wildcard resolution answers by rule, not by table). Set on the
  /// browser-local synthetic nodes `useLocalWildcardAgents` builds so the rest of the UI (detail
  /// panel, lifecycle actions) can tell "not really minted yet" apart from a real `Wildcard`-tier
  /// registry entry. Always `undefined`/falsy on anything read from the chain.
  isLocalPreview?: boolean;
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

/// Grafts browser-local `Wildcard` previews (`useLocalWildcardAgents`) onto the real, chain-read
/// tree at the right place: a preview whose target registry is some `Sovereign`'s sub-registry
/// becomes that node's child, so its ghost castle clusters around the right parent instead of
/// floating at the root. Previews whose registry matches nothing on chain (the parent was
/// revoked, or the tree hasn't loaded that branch) stay at the root rather than disappearing.
export function mergeLocalPreviews(tree: NamespaceNode[], localNodes: NamespaceNode[]): NamespaceNode[] {
  if (localNodes.length === 0) return tree;

  const byRegistry = new Map<string, NamespaceNode[]>();
  for (const node of localNodes) {
    const key = node.registry.toLowerCase();
    byRegistry.set(key, [...(byRegistry.get(key) ?? []), node]);
  }

  const attached = new Set<string>();
  const walk = (nodes: NamespaceNode[]): NamespaceNode[] =>
    nodes.map((node) => {
      const key = node.subregistry.toLowerCase();
      const extras = node.subregistry !== zeroAddress ? (byRegistry.get(key) ?? []) : [];
      if (extras.length > 0) attached.add(key);
      return { ...node, children: [...walk(node.children), ...extras] };
    });

  const merged = walk(tree);
  const rootKey = CONTRACTS.agentRegistry.toLowerCase();
  attached.add(rootKey);
  const rootLevel = byRegistry.get(rootKey) ?? [];
  const orphans = Array.from(byRegistry)
    .filter(([key]) => !attached.has(key))
    .flatMap(([, nodes]) => nodes);

  return [...merged, ...rootLevel, ...orphans];
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

/// The namespace rooted at `kingdomName` (default: the fleet's own `CONTRACTS.parentName`),
/// recursively including every `Sovereign` sub-registry — this is what task 11's tree view and
/// task 12's detail panel are both built on, so the two screens never disagree about what's on
/// chain.
///
/// Task 31 generalizes this beyond the fleet's own name: any other `<label>.eth` claimed through
/// `ETHRegistrar` is looked up via `ETHRegistry.getSubregistry(label)` — a freshly claimed name
/// leaves this at `address(0)` (task 31 deliberately doesn't wire it; task 32 does), which reads
/// here as "kingdom founded, no agents yet" rather than an error.
export function useNamespaceTree(kingdomName: string = CONTRACTS.parentName, options?: { enabled?: boolean }) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<NamespaceNode[]>(
    ["namespaceTree", kingdomName],
    async () => {
      if (!publicClient) throw new Error("useNamespaceTree: missing publicClient");

      if (kingdomName === CONTRACTS.parentName) {
        return buildNamespace(publicClient, CONTRACTS.agentRegistry, kingdomName, 0);
      }

      const label = kingdomName.replace(/\.eth$/, "");
      const registry = await publicClient.readContract({
        address: CONTRACTS.ethRegistry,
        abi: ethRegistryAbi,
        functionName: "getSubregistry",
        args: [label],
      });
      if (!registry || registry === zeroAddress) return [];
      return buildNamespace(publicClient, registry, kingdomName, 0);
    },
    { enabled: options?.enabled ?? true }
  );
}

/// Task 31/32: which `AgentRegistry` a kingdom's *own* root spawns should target — the same
/// resolution `useNamespaceTree` uses to build the tree, exposed on its own so a spawn form can
/// target the right contract without walking the (possibly large) whole tree just to find it.
/// `zeroAddress` means exactly what it means in `ETHRegistrar.register`: this kingdom hasn't had
/// its own registry wired up yet (task 31 leaves it that way on purpose; task 32 wires it), so
/// there's nowhere real to `spawn` into until then.
export function useKingdomRegistry(kingdomName: string | null) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<`0x${string}` | null>(
    ["kingdomRegistry", kingdomName],
    async () => {
      if (!publicClient || !kingdomName) return null;
      if (kingdomName === CONTRACTS.parentName) return CONTRACTS.agentRegistry;

      const label = kingdomName.replace(/\.eth$/, "");
      return publicClient.readContract({
        address: CONTRACTS.ethRegistry,
        abi: ethRegistryAbi,
        functionName: "getSubregistry",
        args: [label],
      });
    },
    { enabled: !!publicClient && !!kingdomName }
  );
}

/// The wallet a kingdom's `.eth` name currently belongs to — `ETHRegistry.findOwner(label)` works
/// off the bare label, so unlike a tokenId-keyed read this resolves for *any* kingdom, including
/// one the connected wallet doesn't own (the `?kingdom=` showcase view, task 31 §5).
export function useKingdomOwner(kingdomName: string | null) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<`0x${string}` | null>(
    ["kingdomOwner", kingdomName],
    async () => {
      if (!publicClient || !kingdomName) return null;
      const label = kingdomName.replace(/\.eth$/, "");
      return publicClient.readContract({
        address: CONTRACTS.ethRegistry,
        abi: ethRegistryAbi,
        functionName: "findOwner",
        args: [label],
      });
    },
    { enabled: !!publicClient && !!kingdomName }
  );
}
