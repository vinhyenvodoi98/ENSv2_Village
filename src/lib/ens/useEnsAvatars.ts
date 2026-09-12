import { decodeFunctionResult, encodeFunctionData, namehash, type Hex } from "viem";
import { useMemo } from "react";
import { usePublicClient } from "wagmi";
import { universalResolverAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { normalizeName } from "./name";
import { useBlockGatedQuery } from "./query";
import { dnsEncodeName } from "./useResolve";

const avatarTextAbi = [
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export type EnsAvatarDirectory = Readonly<Record<string, string>>;

/**
 * Resolves the standard ENS `avatar` text record for many names in one RPC
 * batch. UniversalResolverV2 owns registry traversal, aliases and ENSIP-10
 * wildcard dispatch; the UI never guesses which concrete resolver to call.
 */
export function useEnsAvatars(names: readonly string[]) {
  const publicClient = usePublicClient();
  const normalizedNames = useMemo(
    () => [...new Set(names.map(normalizeName).filter(Boolean))].sort(),
    [names]
  );

  return useBlockGatedQuery<EnsAvatarDirectory>(
    ["ensAvatars", ...normalizedNames],
    async () => {
      if (!publicClient || normalizedNames.length === 0) return {};

      const calls = normalizedNames.map((name) => {
        const calldata = encodeFunctionData({
          abi: avatarTextAbi,
          functionName: "text",
          args: [namehash(name), "avatar"],
        });
        return {
          address: CONTRACTS.universalResolver,
          abi: universalResolverAbi,
          functionName: "resolve" as const,
          args: [dnsEncodeName(name), calldata] as const,
        };
      });

      const results = await publicClient.multicall({ allowFailure: true, contracts: calls });
      const avatars: Record<string, string> = {};

      results.forEach((result, index) => {
        if (result.status !== "success") return;
        const [data] = result.result as readonly [Hex, `0x${string}`];
        const value = decodeFunctionResult({
          abi: avatarTextAbi,
          functionName: "text",
          data,
        });
        if (value) avatars[normalizedNames[index]] = value;
      });

      return avatars;
    },
    { enabled: !!publicClient && normalizedNames.length > 0 }
  );
}
