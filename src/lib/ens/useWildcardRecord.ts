import { usePublicClient } from "wagmi";
import { wildcardStateStoreAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";

export type WildcardRecord = {
  wildcardKey: `0x${string}`;
  status: string;
};

/// Reads a `Wildcard`-tier agent's records straight off `WildcardStateStore` (task 06) — the
/// only place a not-yet-minted label's data lives, since it has no `AgentResolver` of its own
/// until `promote` attaches one (0->1). This is the third record source task 12 calls out
/// alongside `own`/`inherited`: a value that never touched `AgentResolver` at all.
export function useWildcardRecord(labelhash: `0x${string}` | undefined) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<WildcardRecord>(
    ["wildcardRecord", labelhash],
    async () => {
      if (!publicClient || !labelhash) throw new Error("useWildcardRecord: missing publicClient/labelhash");

      const contract = { address: CONTRACTS.wildcardStateStore, abi: wildcardStateStoreAbi } as const;
      const [wildcardKey, status] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { ...contract, functionName: "wildcardKeyOf", args: [labelhash] },
          { ...contract, functionName: "statusOf", args: [labelhash] },
        ],
      });

      return { wildcardKey: wildcardKey as `0x${string}`, status: status as string };
    },
    { enabled: !!labelhash }
  );
}
