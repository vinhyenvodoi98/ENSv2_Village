import { usePublicClient } from "wagmi";
import type { Log } from "viem";
import { agentRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { AGENT_TIERS } from "./useAgentTree";
import { useBlockGatedQuery } from "./query";

const TIMELINE_EVENTS = [
  "AgentSpawned",
  "AgentHeartbeat",
  "Promoted",
  "AgentRenewed",
  "AgentRevoked",
  "AgentTransferred",
  "AgentKeyUpdated",
] as const;

export type AgentEvent = {
  type: (typeof TIMELINE_EVENTS)[number];
  blockNumber: bigint;
  logIndex: number;
  timestamp: bigint;
  txHash: `0x${string}`;
  summary: string;
};

/// The full on-chain history of one agent — every lifecycle event `AgentRegistry` emits for its
/// `labelhash`, merged and time-ordered — task 12's "heartbeat/status timeline sourced from
/// events". Each entry carries its own tx hash so the UI can link straight to Etherscan: proof
/// the timeline isn't hand-typed.
export function useAgentEvents(labelhash: `0x${string}` | undefined, registry: `0x${string}` = CONTRACTS.agentRegistry) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<AgentEvent[]>(
    ["agentEvents", registry, labelhash],
    async () => {
      if (!publicClient || !labelhash) throw new Error("useAgentEvents: missing publicClient/labelhash");

      const logsByType = await Promise.all(
        TIMELINE_EVENTS.map((eventName) =>
          publicClient.getContractEvents({
            address: registry,
            abi: agentRegistryAbi,
            eventName,
            args: { labelhash },
            fromBlock: CONTRACTS.deployBlock,
            toBlock: "latest",
          })
        )
      );

      const allLogs = logsByType.flat().sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
        return a.logIndex - b.logIndex;
      });
      if (allLogs.length === 0) return [];

      const uniqueBlocks = [...new Set(allLogs.map((log) => log.blockNumber))];
      const blocks = await Promise.all(uniqueBlocks.map((blockNumber) => publicClient.getBlock({ blockNumber })));
      const timestampByBlock = new Map(uniqueBlocks.map((blockNumber, i) => [blockNumber, blocks[i].timestamp]));

      return allLogs.map((log) => ({
        type: log.eventName as AgentEvent["type"],
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        timestamp: timestampByBlock.get(log.blockNumber) ?? 0n,
        txHash: log.transactionHash,
        summary: summarize(log),
      }));
    },
    { enabled: !!labelhash }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarize(log: Log & { eventName: string; args: any }): string {
  switch (log.eventName) {
    case "AgentSpawned":
      return `Spawned at tier ${AGENT_TIERS[log.args.tier]}`;
    case "AgentHeartbeat":
      return `Heartbeat #${log.args.count}`;
    case "Promoted":
      return `Promoted ${AGENT_TIERS[log.args.fromTier]} → ${AGENT_TIERS[log.args.toTier]}`;
    case "AgentRenewed":
      return `Lease renewed`;
    case "AgentRevoked":
      return `Revoked`;
    case "AgentTransferred":
      return `Transferred to ${log.args.to}`;
    case "AgentKeyUpdated":
      return `Agent key rotated`;
    default:
      return log.eventName;
  }
}
