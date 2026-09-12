import { decodeFunctionResult, encodeFunctionData, zeroAddress, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { permissionedResolverAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { decodeContenthash, type DecodedContenthash } from "./contenthash";
import { fetchContractEventsChunked } from "./logs";
import { useBlockGatedQuery } from "./query";
import type { EnsNameState } from "./useEnsName";
import { dnsEncodeName } from "./useResolve";
import { ETH_COIN_TYPE as COIN_TYPE_ETH } from "./useReverseName";

/// The hackathon-deployed `PermissionedResolver` (see `registryRoles.ts`'s `RESOLVER_ROLES` doc
/// comment) has no standalone `addr()`/`text()`/`contenthash()` getters — the only read entrypoint
/// is `resolve(bytes name, bytes data)` (ENSIP-10), which dispatches on a profile call's selector
/// exactly like a `UniversalResolver` would forward one. These are that profile calldata's shapes;
/// `useResolve.ts` already established this exact pattern for `UniversalResolver.resolve()` reads,
/// this is the same thing called directly against a known resolver instead.
const addrAbi = [
  { type: "function", name: "addr", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }, { name: "coinType", type: "uint256" }], outputs: [{ name: "", type: "bytes" }] },
] as const;
const textAbi = [
  { type: "function", name: "text", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }] },
] as const;
const contenthashAbi = [
  { type: "function", name: "contenthash", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ name: "", type: "bytes" }] },
] as const;

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

/// The records editor's read layer. The hackathon-deployed `PermissionedResolver` keys every
/// record by an incrementing `recordId` (`getRecordId(node)`), not by `node` directly, and exposes
/// no standalone `addr()`/`text()`/`contenthash()` getters — only `resolve(bytes name, bytes data)`
/// (ENSIP-10). Every read below goes through that, straight to the resolver contract (never through
/// `UniversalResolver`'s own `resolve()` wrapper — the resolver address is already known and
/// confirmed, no need to re-walk the registry tree), so a write made here and a write made by any
/// other standard ENS client agree the instant both are read the same way.
export function useResolverRecords(state: EnsNameState | null | undefined) {
  const publicClient = usePublicClient();
  const resolver = state?.resolver && state.resolver !== zeroAddress ? state.resolver : null;
  const node = state?.node ?? null;
  const name = state?.name ?? null;

  return useBlockGatedQuery<ResolverRecords | null>(
    ["resolverRecords", resolver, node],
    async () => {
      if (!publicClient || !resolver || !node || !name) return null;

      const dnsName = dnsEncodeName(name);
      const resolverContract = { address: resolver, abi: permissionedResolverAbi } as const;

      // `TextUpdated`/`AddressUpdated` are indexed by `recordId`, not `node` — a name that has
      // never had a setter called on it has `recordId === 0` and, by construction, no logs at all.
      const recordId = await publicClient.readContract({
        ...resolverContract,
        functionName: "getRecordId",
        args: [node],
      });

      const toBlock = await publicClient.getBlockNumber();
      const [textLogs, addressLogs] = await Promise.all([
        fetchContractEventsChunked({
          publicClient,
          address: resolver,
          abi: permissionedResolverAbi,
          eventName: "TextUpdated",
          fromBlock: CONTRACTS.ethRegistrarFirstBlock,
          toBlock,
          args: { recordId },
        }),
        fetchContractEventsChunked({
          publicClient,
          address: resolver,
          abi: permissionedResolverAbi,
          eventName: "AddressUpdated",
          fromBlock: CONTRACTS.ethRegistrarFirstBlock,
          toBlock,
          args: { recordId },
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

      // Every read is a `resolve(dnsName, profileCalldata)` call against the same resolver —
      // batched with `publicClient.multicall` the same way the old direct-getter version was, just
      // targeting one function (`resolve`) with different inner calldata per candidate field.
      const reads = [
        ...textKeys.map((key) => encodeFunctionData({ abi: textAbi, functionName: "text", args: [node, key] })),
        encodeFunctionData({ abi: addrAbi, functionName: "addr", args: [node, COIN_TYPE_ETH] }),
        encodeFunctionData({ abi: contenthashAbi, functionName: "contenthash", args: [node] }),
        ...coinTypeList.map((coinType) => encodeFunctionData({ abi: addrAbi, functionName: "addr", args: [node, coinType] })),
      ];
      const results = await publicClient.multicall({
        allowFailure: true,
        contracts: reads.map(
          (data) => ({ ...resolverContract, functionName: "resolve", args: [dnsName, data] }) as const
        ),
      });

      const texts: Record<string, string> = {};
      textKeys.forEach((key, i) => {
        const r = results[i];
        if (r.status !== "success") return;
        const value = decodeFunctionResult({ abi: textAbi, functionName: "text", data: r.result as Hex }) as string;
        if (value.length > 0) texts[key] = value;
      });

      const ethResult = results[textKeys.length];
      const ethAddressBytes =
        ethResult.status === "success"
          ? (decodeFunctionResult({ abi: addrAbi, functionName: "addr", data: ethResult.result as Hex }) as Hex)
          : "0x";
      const ethAddress = ethAddressBytes !== "0x" ? ethAddressBytes : null;

      const contenthashResult = results[textKeys.length + 1];
      const contenthashRaw =
        contenthashResult.status === "success"
          ? (decodeFunctionResult({ abi: contenthashAbi, functionName: "contenthash", data: contenthashResult.result as Hex }) as Hex)
          : "0x";

      const otherAddresses: { coinType: bigint; addressBytes: `0x${string}` }[] = [];
      coinTypeList.forEach((coinType, i) => {
        const r = results[textKeys.length + 2 + i];
        if (r.status !== "success") return;
        const addressBytes = decodeFunctionResult({ abi: addrAbi, functionName: "addr", data: r.result as Hex }) as Hex;
        if (addressBytes !== "0x") otherAddresses.push({ coinType, addressBytes });
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
    { enabled: !!publicClient && !!resolver && !!node && !!name }
  );
}
