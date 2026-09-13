import { zeroAddress, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { ethRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";
import { fetchChildren, type EnsChildName } from "./useNameChildren";
import type { OwnedEthName } from "./useOwnedEthNames";

/// The direct (level-1) subnames of every `.eth` name a wallet owns — the root portfolio map's
/// analogue of `useNameChildren`, run over the whole portfolio at once instead of one selected
/// name. Every owned name's governing registry is `CONTRACTS.ethRegistry` itself (they're all
/// `<label>.eth`), so — unlike `useEnsName` — no per-name registry walk is needed before finding
/// each one's `subregistry`; one multicall against `ethRegistry` answers all of them together.
///
/// Returns a map keyed by the owned name's full name (`"alice.eth"`), each entry the same
/// `EnsChildName[]` `useNameChildren` would return for that name — omitted entirely for names
/// with no subregistry wired, so "not in the map" and "map yields `[]`" both read as "no subnames".
export function usePortfolioSubnames(names: OwnedEthName[] | undefined) {
  const publicClient = usePublicClient();
  const tokenIds = names?.map((n) => n.tokenId) ?? [];

  return useBlockGatedQuery<ReadonlyMap<string, EnsChildName[]>>(
    ["portfolioSubnames", tokenIds.map(String)],
    async () => {
      if (!publicClient || !names || names.length === 0) return new Map();
      return fetchPortfolioChildren(publicClient, names);
    },
    { enabled: !!publicClient && !!names && names.length > 0 }
  );
}

async function fetchPortfolioChildren(
  publicClient: PublicClient,
  names: OwnedEthName[]
): Promise<ReadonlyMap<string, EnsChildName[]>> {
  const contract = { address: CONTRACTS.ethRegistry, abi: ethRegistryAbi } as const;
  const subregistryResults = await publicClient.multicall({
    allowFailure: true,
    contracts: names.map((owned) => ({ ...contract, functionName: "getSubregistry", args: [owned.label] }) as const),
  });

  const governed = names
    .map((owned, i) => ({ owned, result: subregistryResults[i] }))
    .filter(
      (entry): entry is { owned: OwnedEthName; result: { status: "success"; result: `0x${string}` } } =>
        entry.result.status === "success" && entry.result.result !== zeroAddress
    );

  const scanned = await Promise.all(
    governed.map(({ owned, result }) =>
      fetchChildren(publicClient, result.result).then((r) => ({ owned, children: r.children }))
    )
  );

  const byName = new Map<string, EnsChildName[]>();
  for (const { owned, children } of scanned) {
    byName.set(
      owned.name,
      children.map((child) => ({ ...child, fullName: `${child.label}.${owned.name}` }))
    );
  }
  return byName;
}
