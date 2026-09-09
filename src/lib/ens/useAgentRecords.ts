import { usePublicClient } from "wagmi";
import { agentResolverAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";

export type AgentRecord = {
  value: string;
  /// `true` when the value came from a parent's record via aliasing (task 08) rather than being
  /// set directly on this node — i.e. `ownText(node, key) === "" && text(node, key) !== ""`.
  inherited: boolean;
};

export type AgentRecords = {
  addr: `0x${string}`;
  records: Record<string, AgentRecord>;
};

/// Reads an agent's `addr` and a set of text records straight off its `AgentResolver` (task 05),
/// distinguishing values inherited via aliasing (task 08) from values set directly on the node —
/// exactly the `ownText`/`text` pair `AgentResolver` exposes for this purpose.
///
/// `node` is the agent's labelhash (`AgentResolver`'s node space, *not* an ENS namehash — see
/// `AgentResolver`'s own doc comment). `resolver` defaults to the fleet's shared `AgentResolver`
/// (`deployments.json`); pass a different one for an agent living under its own Sovereign-tier
/// sub-registry (task 07).
export function useAgentRecords(
  node: `0x${string}` | undefined,
  keys: readonly string[],
  resolver: `0x${string}` = CONTRACTS.agentResolver
) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<AgentRecords>(
    ["agentRecords", resolver, node, ...keys],
    async () => {
      if (!publicClient || !node) throw new Error("useAgentRecords: missing publicClient/node");

      const contract = { address: resolver, abi: agentResolverAbi };

      type Call = {
        address: `0x${string}`;
        abi: typeof agentResolverAbi;
        functionName: "addr" | "ownText" | "text";
        args: readonly [`0x${string}`] | readonly [`0x${string}`, string];
      };

      const contracts: Call[] = [
        { ...contract, functionName: "addr", args: [node] as const },
        ...keys.flatMap((key) => [
          { ...contract, functionName: "ownText" as const, args: [node, key] as const },
          { ...contract, functionName: "text" as const, args: [node, key] as const },
        ]),
      ];

      const results = await publicClient.multicall({ allowFailure: false, contracts });

      const addr = results[0] as `0x${string}`;
      const records: Record<string, AgentRecord> = {};
      keys.forEach((key, i) => {
        const ownValue = results[1 + i * 2] as string;
        const effectiveValue = results[1 + i * 2 + 1] as string;
        records[key] = {
          value: effectiveValue,
          inherited: ownValue === "" && effectiveValue !== "",
        };
      });

      return { addr, records };
    },
    { enabled: !!node }
  );
}
