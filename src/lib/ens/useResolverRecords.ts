import { zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { permissionedResolverAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { decodeContenthash, type DecodedContenthash } from "./contenthash";
import { fetchContractEventsChunked } from "./logs";
import { useBlockGatedQuery } from "./query";
import type { EnsNameState } from "./useEnsName";
import { ETH_COIN_TYPE as COIN_TYPE_ETH } from "./useReverseName";

/// Task 35: "the well-known keys first ... plus free-form key/value rows."
export const WELL_KNOWN_TEXT_KEYS = ["avatar", "description", "url", "com.twitter", "com.github", "email"] as const;

export { COIN_TYPE_ETH };

export type ResolverRecords = {
  /// Well-known keys first (`WELL_KNOWN_TEXT_KEYS` order), then any custom key this name has ever
  /// had — text records aren't enumerable on `PermissionedResolver` any more than on any ENS
  /// resolver, so custom keys are discovered from `TextChanged` logs and only kept if a live
  /// `text()` read still returns a non-empty value: "logs give the candidate set, chain state
  /// decides what is true now" (task 34's own phrase, same pattern here).
  textKeys: string[];
  texts: Record<string, string>;
  ethAddress: `0x${string}` | null;
  /// Non-ETH coin types this name has ever set, discovered from `AddressChanged` logs and
  /// re-confirmed live the same way; a coin type cleared since its last log is dropped.
  otherAddresses: { coinType: bigint; addressBytes: `0x${string}` }[];
  contenthashRaw: `0x${string}`;
  contenthash: DecodedContenthash | null;
};

/// The records editor's read layer: every value `PermissionedResolver` actually holds for one
/// name's node, read straight off the resolver contract (never through `UniversalResolver`'s
/// `resolve()` wrapper) so a write made here and a write made by any other standard ENS client
/// agree the instant both are read the same way.
export function useResolverRecords(state: EnsNameState | null | undefined) {
  const publicClient = usePublicClient();
  const resolver = state?.resolver && state.resolver !== zeroAddress ? state.resolver : null;
  const node = state?.node ?? null;

  return useBlockGatedQuery<ResolverRecords | null>(
    ["resolverRecords", resolver, node],
    async () => {
      if (!publicClient || !resolver || !node) return null;

      const toBlock = await publicClient.getBlockNumber();
      const [textLogs, addressLogs] = await Promise.all([
        fetchContractEventsChunked({
          publicClient,
          address: resolver,
          abi: permissionedResolverAbi,
          eventName: "TextChanged",
          fromBlock: CONTRACTS.ethRegistrarFirstBlock,
          toBlock,
          args: { node },
        }),
        fetchContractEventsChunked({
          publicClient,
          address: resolver,
          abi: permissionedResolverAbi,
          eventName: "AddressChanged",
          fromBlock: CONTRACTS.ethRegistrarFirstBlock,
          toBlock,
          args: { node },
        }),
      ]);

      const customKeys = new Set<string>();
      for (const log of textLogs) {
        if (log.args.key) customKeys.add(log.args.key);
      }
      for (const key of WELL_KNOWN_TEXT_KEYS) customKeys.delete(key);
      const textKeys = [...WELL_KNOWN_TEXT_KEYS, ...[...customKeys].sort()];

      const otherCoinTypes = new Set<bigint>();
      for (const log of addressLogs) {
        if (log.args.coinType !== undefined && log.args.coinType !== COIN_TYPE_ETH) {
          otherCoinTypes.add(log.args.coinType);
        }
      }
      const coinTypeList = [...otherCoinTypes];

      const contract = { address: resolver, abi: permissionedResolverAbi } as const;
      const results = await publicClient.multicall({
        allowFailure: true,
        contracts: [
          ...textKeys.map((key) => ({ ...contract, functionName: "text", args: [node, key] }) as const),
          { ...contract, functionName: "addr", args: [node, COIN_TYPE_ETH] } as const,
          { ...contract, functionName: "contenthash", args: [node] } as const,
          ...coinTypeList.map((coinType) => ({ ...contract, functionName: "addr", args: [node, coinType] }) as const),
        ],
      });

      const texts: Record<string, string> = {};
      textKeys.forEach((key, i) => {
        const r = results[i];
        if (r.status === "success" && typeof r.result === "string" && r.result.length > 0) {
          texts[key] = r.result;
        }
      });

      const ethResult = results[textKeys.length];
      const ethAddressBytes = ethResult.status === "success" ? (ethResult.result as `0x${string}`) : "0x";
      const ethAddress = ethAddressBytes !== "0x" ? ethAddressBytes : null;

      const contenthashResult = results[textKeys.length + 1];
      const contenthashRaw = contenthashResult.status === "success" ? (contenthashResult.result as `0x${string}`) : "0x";

      const otherAddresses: { coinType: bigint; addressBytes: `0x${string}` }[] = [];
      coinTypeList.forEach((coinType, i) => {
        const r = results[textKeys.length + 2 + i];
        if (r.status === "success" && typeof r.result === "string" && r.result !== "0x") {
          otherAddresses.push({ coinType, addressBytes: r.result as `0x${string}` });
        }
      });

      return {
        textKeys,
        texts,
        ethAddress,
        otherAddresses,
        contenthashRaw,
        contenthash: decodeContenthash(contenthashRaw),
      };
    },
    { enabled: !!publicClient && !!resolver && !!node }
  );
}
