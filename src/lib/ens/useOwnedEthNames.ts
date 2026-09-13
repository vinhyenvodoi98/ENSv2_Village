import { useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";
import { ethRegistrarAbi, ethRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { fetchContractEventsChunked, mergeEventCandidates } from "./logs";
import { reportScanProgress, useScanProgress, type ScanProgress } from "./scanProgress";
import { useBlockGatedQuery } from "./query";

export type OwnedEthName = {
  label: string;
  name: string;
  tokenId: bigint;
  owner: `0x${string}`;
  expiry: bigint;
  status: number;
};

/// Progress scope for one wallet's `.eth` scan. Per-wallet, so a reconnect as a different account
/// can never inherit the previous one's progress bar.
function scanScope(owner: `0x${string}`): string {
  return `ownedEthNames:${owner.toLowerCase()}`;
}

/// Live progress of the owned-`.eth` walk for `owner` — `null` when none is running. Separate hook
/// for the same reason `useSubnameScanProgress` is: this ticks several times a second, and nothing
/// rendering the actual names should re-render with it.
export function useOwnedNamesScanProgress(owner: `0x${string}` | undefined): ScanProgress | null {
  return useScanProgress(owner ? scanScope(owner) : null);
}

/// Whether an empty `useOwnedEthNames` result is trustworthy yet.
///
/// `mergeEventCandidates` (`logs.ts`) exists because this deployment's RPC intermittently answers
/// an `eth_getLogs` window with only a truncated slice of it, no error, nothing marking the answer
/// partial — merging across every block-gated refetch is what heals that. But the very *first* scan
/// has nothing to merge into yet: if that first pass happens to land on a truncated answer, it
/// resolves to a real, successful, empty `[]` — indistinguishable from an owner who truly has no
/// names — and only self-corrects on the next block's refetch. Rendering "No names yet" straight off
/// that first empty result is what produced the flash the wallet's own castle used to vanish
/// through; this gives it one more block to heal before anyone is told to trust it.
export function useConfirmedEmptyOwnedNames(names: OwnedEthName[] | undefined): boolean {
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const isEmpty = names !== undefined && names.length === 0;

  const [firstEmptyBlock, setFirstEmptyBlock] = useState<bigint | null>(null);
  if (!isEmpty) {
    if (firstEmptyBlock !== null) setFirstEmptyBlock(null);
  } else if (firstEmptyBlock === null && blockNumber !== undefined) {
    setFirstEmptyBlock(blockNumber);
  }

  if (!isEmpty || firstEmptyBlock === null || blockNumber === undefined) return false;
  return blockNumber > firstEmptyBlock;
}

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
      const scope = scanScope(owner);

      try {
        // Scanned from the *registrar's* first block, not AgentVillage's `deployBlock`: the two are
        // unrelated, and `agentvillage.eth` itself was registered three blocks *before* the fleet was
        // deployed — so a `deployBlock` floor silently hid the project's own name from its owner. The
        // range is chunked because it long since outgrew what one `eth_getLogs` call may span.
        const logs = await fetchContractEventsChunked({
          publicClient,
          address: CONTRACTS.ethRegistrar,
          abi: ethRegistrarAbi,
          eventName: "NameRegistered",
          fromBlock: CONTRACTS.ethRegistrarFirstBlock,
          toBlock: await publicClient.getBlockNumber(),
          // `matched` is every `.eth` ever registered on this deployment, not the wallet's own —
          // `NameRegistered` doesn't index `owner`, so ownership is only known after the multicall
          // below. Reported anyway because "the walk is finding things" is what the number is for;
          // the copy on the dialog says "registrations seen", never "yours".
          onProgress: (scanned, total, matched) =>
            reportScanProgress(scope, { phase: "scanning", scanned, total, found: matched }),
        });

        const scanned = new Map<bigint, string>();
        for (const log of logs) {
          if (log.args.tokenId === undefined || log.args.label === undefined) continue;
          scanned.set(log.args.tokenId, log.args.label);
        }
        // Merged, not replaced: this endpoint serves a truncated log range often enough that a
        // replacing scan makes owned names blink out of the UI. See `mergeEventCandidates`.
        const labelByTokenId = mergeEventCandidates(`NameRegistered:${CONTRACTS.ethRegistrar.toLowerCase()}`, scanned);
        if (labelByTokenId.size === 0) return [];

        const tokenIds = [...labelByTokenId.keys()];
        reportScanProgress(scope, { phase: "verifying", scanned: 1, total: 1, found: tokenIds.length });
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
      } finally {
        // Cleared on every exit, failure included — a scan that threw must not leave a progress bar
        // frozen on screen.
        reportScanProgress(scope, null);
      }
    },
    { enabled: !!owner }
  );
}
