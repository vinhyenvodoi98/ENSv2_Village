import type { PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { universalResolverAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { normalizeName } from "./name";
import { useBlockGatedQuery } from "./query";

/// ENSIP-11 coin type for the deployment's chain: `0x80000000 | chainId`. ENSv2's
/// `UniversalResolver.reverse` takes the coin type rather than assuming mainnet ETH, so the chain id
/// comes from `deployments.json` like every other deployment fact.
export const REVERSE_COIN_TYPE = BigInt(0x80000000 | CONTRACTS.chainId);

/// Legacy ETH coin type — what a reverse record set up before ENSIP-11's chain-scoped ones uses.
export const ETH_COIN_TYPE = 60n;

export type ReverseName = {
  name: string;
  coinType: bigint;
};

/// The primary name an address has claimed for itself, via `UniversalResolver.reverse`.
///
/// An address with no reverse record set makes that call **revert**, which is the normal case rather
/// than an error: task 33's search box uses "exactly one obvious match" to decide between
/// redirecting to `/ens/[name]` and rendering the address's portfolio, and a revert simply means
/// there is no obvious match. Hence `null` on failure, never a thrown error.
export async function fetchReverseName(
  publicClient: PublicClient,
  address: `0x${string}`
): Promise<ReverseName | null> {
  for (const coinType of [REVERSE_COIN_TYPE, ETH_COIN_TYPE]) {
    try {
      const [name] = await publicClient.readContract({
        address: CONTRACTS.universalResolver,
        abi: universalResolverAbi,
        functionName: "reverse",
        args: [address, coinType],
      });
      const normalized = normalizeName(name);
      if (normalized) return { name: normalized, coinType };
    } catch {
      // No reverse record under this coin type — try the next, then give up.
    }
  }

  return null;
}

/// `fetchReverseName` as a block-gated hook, for screens that want to *show* an address's primary
/// name (the `/address/[addr]` header) rather than to decide a redirect from it.
export function useReverseName(address: `0x${string}` | null | undefined) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<ReverseName | null>(
    ["reverseName", address],
    async () => {
      if (!publicClient || !address) return null;
      return fetchReverseName(publicClient, address);
    },
    { enabled: !!publicClient && !!address }
  );
}
