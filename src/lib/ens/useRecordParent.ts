import { zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { agentResolverAbi } from "@/lib/contracts/abis";
import { useBlockGatedQuery } from "./query";

export type RecordParentLink = {
  parentResolver: `0x${string}`;
  parentNode: `0x${string}`;
  isSet: boolean;
};

/// Reads the aliasing link (task 08) an agent's own `AgentResolver` node points at, if any — the
/// `(parentResolver, parentNode)` pair `text()` climbs when a key isn't set locally. Task 12
/// wants inherited records labeled "inherited from `<parent name>`"; combined with
/// `buildResolverIndex`/`flattenNamespace`, this is what turns the raw pair into that label.
export function useRecordParent(resolver: `0x${string}` | undefined, node: `0x${string}` | undefined) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<RecordParentLink>(
    ["recordParent", resolver, node],
    async () => {
      if (!publicClient || !resolver || !node) throw new Error("useRecordParent: missing publicClient/resolver/node");

      const [parentResolver, parentNode, isSet] = await publicClient.readContract({
        address: resolver,
        abi: agentResolverAbi,
        functionName: "parentOf",
        args: [node],
      });

      return { parentResolver, parentNode, isSet };
    },
    { enabled: !!resolver && !!node && resolver !== zeroAddress }
  );
}
