import { usePublicClient } from "wagmi";
import { agentRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";

export type LastHeartbeat = {
  count: bigint;
  blockNumber: bigint;
  timestamp: bigint;
  txHash: `0x${string}`;
};

/// The most recent `AgentHeartbeat` per label for one registry, keyed by `labelhash` — task 11
/// needs "time of the most recent heartbeat" per tree node, so this reads every heartbeat event
/// once (same pattern `useAgentTree` uses for `AgentSpawned`) rather than one event query per
/// node, then resolves block timestamps for only the distinct blocks actually involved.
export function useLastHeartbeats(registry: `0x${string}` = CONTRACTS.agentRegistry) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<Map<`0x${string}`, LastHeartbeat>>(["lastHeartbeats", registry], async () => {
    if (!publicClient) throw new Error("useLastHeartbeats: missing publicClient");

    const logs = await publicClient.getContractEvents({
      address: registry,
      abi: agentRegistryAbi,
      eventName: "AgentHeartbeat",
      fromBlock: CONTRACTS.deployBlock,
      toBlock: "latest",
    });

    const latestByLabel = new Map<`0x${string}`, (typeof logs)[number]>();
    for (const log of logs) {
      if (!log.args.labelhash) continue;
      // Logs come back in ascending block order, so the last write per label wins.
      latestByLabel.set(log.args.labelhash, log);
    }

    const uniqueBlocks = [...new Set([...latestByLabel.values()].map((log) => log.blockNumber))];
    const blocks = await Promise.all(uniqueBlocks.map((blockNumber) => publicClient.getBlock({ blockNumber })));
    const timestampByBlock = new Map(uniqueBlocks.map((blockNumber, i) => [blockNumber, blocks[i].timestamp]));

    const result = new Map<`0x${string}`, LastHeartbeat>();
    for (const [labelhash, log] of latestByLabel) {
      result.set(labelhash, {
        count: log.args.count ?? 0n,
        blockNumber: log.blockNumber,
        timestamp: timestampByBlock.get(log.blockNumber) ?? 0n,
        txHash: log.transactionHash,
      });
    }
    return result;
  });
}
