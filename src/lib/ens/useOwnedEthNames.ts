import { usePublicClient } from "wagmi";
import { ethRegistrarAbi, ethRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";

export type OwnedEthName = {
  label: string;
  name: string;
  tokenId: bigint;
  owner: `0x${string}`;
  expiry: bigint;
  status: number;
};

/// Task 31: which `.eth` names (on the hackathon `ETHRegistrar`) the connected wallet actually
/// owns right now. `NameRegistered` only indexes `tokenId` (not `owner`), so it's read here as a
/// plain candidate list — a label that was minted, transferred, or expired since the event fired
/// is exactly the case `ETHRegistry.getOwner`/`getExpiry`/`getStatus` re-verification exists to
/// catch. Events give the label string (the registry itself only ever indexes by tokenId); the
/// re-verified state is what's actually trusted.
export function useOwnedEthNames(owner: `0x${string}` | undefined) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<OwnedEthName[]>(
    ["ownedEthNames", owner],
    async () => {
      if (!publicClient || !owner) throw new Error("useOwnedEthNames: missing publicClient/owner");

      const logs = await publicClient.getContractEvents({
        address: CONTRACTS.ethRegistrar,
        abi: ethRegistrarAbi,
        eventName: "NameRegistered",
        fromBlock: CONTRACTS.deployBlock,
        toBlock: "latest",
      });

      const labelByTokenId = new Map<bigint, string>();
      for (const log of logs) {
        if (log.args.tokenId === undefined || log.args.label === undefined) continue;
        labelByTokenId.set(log.args.tokenId, log.args.label);
      }
      if (labelByTokenId.size === 0) return [];

      const tokenIds = [...labelByTokenId.keys()];
      const contract = { address: CONTRACTS.ethRegistry, abi: ethRegistryAbi } as const;
      const results = await publicClient.multicall({
        allowFailure: false,
        contracts: tokenIds.flatMap(
          (tokenId) =>
            [
              { ...contract, functionName: "getOwner", args: [tokenId] },
              { ...contract, functionName: "getExpiry", args: [tokenId] },
              { ...contract, functionName: "getStatus", args: [tokenId] },
            ] as const
        ),
      });

      const names: OwnedEthName[] = [];
      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i];
        const currentOwner = results[i * 3] as `0x${string}`;
        const expiry = results[i * 3 + 1] as bigint;
        const status = results[i * 3 + 2] as number;
        if (currentOwner.toLowerCase() !== owner.toLowerCase()) continue;

        const label = labelByTokenId.get(tokenId)!;
        names.push({ label, name: `${label}.eth`, tokenId, owner: currentOwner, expiry, status });
      }

      return names.sort((a, b) => a.label.localeCompare(b.label));
    },
    { enabled: !!owner }
  );
}
