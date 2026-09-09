import { keccak256, toBytes, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { agentRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";

// Mirrors `AgentRegistry.Tier` (task 03/07) — enum ordinal from `agentOf` is remapped to these
// names so nothing downstream has to remember the raw ordinal.
export const AGENT_TIERS = ["Wildcard", "Leased", "Owned", "Sovereign"] as const;
export type AgentTier = (typeof AGENT_TIERS)[number];

export type AgentTreeNode = {
  label: string;
  labelhash: `0x${string}`;
  owner: `0x${string}`;
  agentKey: `0x${string}`;
  tier: AgentTier;
  expiry: bigint;
  revoked: boolean;
  revocable: boolean;
  transferable: boolean;
  resolver: `0x${string}`;
  subregistry: `0x${string}`;
  heartbeatCount: bigint;
};

/// Reads the full agent tree of a single `AgentRegistry` instance (any registry — the fleet's
/// own, or a `Sovereign` agent's own sub-registry, task 07) directly, non-recursively. Shared by
/// `useAgentTree` (single-registry hook) and `useNamespaceTree` (recursive whole-tree walk).
///
/// Two-step, as task 10 calls for: `AgentSpawned` events give the complete label set (an event
/// is the only place a label's plaintext string is recorded — the registry itself only ever
/// indexes by `labelhash`), then a single `multicall` reads every label's *current* `agentOf`
/// state in one round trip — so a later revoke/promote/transfer is reflected correctly without
/// having to replay and reduce every event ourselves.
export async function fetchAgentTree(
  publicClient: PublicClient,
  root: `0x${string}`,
  fromBlock: bigint = CONTRACTS.deployBlock
): Promise<AgentTreeNode[]> {
  const spawnLogs = await publicClient.getContractEvents({
    address: root,
    abi: agentRegistryAbi,
    eventName: "AgentSpawned",
    fromBlock,
    toBlock: "latest",
  });

  const labels = [...new Set(spawnLogs.map((log) => log.args.label).filter((label): label is string => !!label))];
  if (labels.length === 0) return [];

  const contract = { address: root, abi: agentRegistryAbi } as const;
  const records = await publicClient.multicall({
    allowFailure: false,
    contracts: labels.map((label) => ({ ...contract, functionName: "agentOf", args: [label] }) as const),
  });

  return labels.map((label, i) => {
    const record = records[i];
    return {
      label,
      labelhash: keccakLabel(label),
      owner: record.owner,
      agentKey: record.agentKey,
      tier: AGENT_TIERS[record.tier],
      expiry: record.expiry,
      revoked: record.revoked,
      revocable: record.revocable,
      transferable: record.transferable,
      resolver: record.resolver,
      subregistry: record.subregistry,
      heartbeatCount: record.heartbeatCount,
    } satisfies AgentTreeNode;
  });
}

/// Reads the full agent tree of one `AgentRegistry` instance (default: the fleet's own, from
/// `deployments.json`) — every label ever spawned, with its current on-chain state.
export function useAgentTree(root: `0x${string}` = CONTRACTS.agentRegistry) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<AgentTreeNode[]>(["agentTree", root], async () => {
    if (!publicClient) throw new Error("useAgentTree: missing publicClient");
    return fetchAgentTree(publicClient, root);
  });
}

// AgentRegistry keys every agent by `keccak256(bytes(label))` (task 03) — recomputed here rather
// than re-deriving from event topics so callers get a plain, typed labelhash back.
function keccakLabel(label: string): `0x${string}` {
  return keccak256(toBytes(label));
}
