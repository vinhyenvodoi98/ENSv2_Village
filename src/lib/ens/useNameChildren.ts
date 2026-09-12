import { zeroAddress, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { ethRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { fetchContractEventsChunked, mergeEventCandidates } from "./logs";
import { NAME_STATUS, type EnsNameState, type NameStatus } from "./useEnsName";
import { useBlockGatedQuery } from "./query";

export type EnsChildName = {
  /// `${registry}:${labelhash}` — same key scheme `useNamespaceTree.ts` uses (task 11), recomputed
  /// here rather than imported so this file never touches that AgentRegistry-era module.
  ensKey: string;
  label: string;
  fullName: string;
  tokenId: bigint;
  status: NameStatus;
  owner: `0x${string}` | null;
  expiry: bigint;
  resolver: `0x${string}` | null;
  subregistry: `0x${string}` | null;
  /// `State.resource` — the child's own EACL resource, distinct from `tokenId`
  /// (`PermissionedRegistry`'s resource/token version counters diverge on role-changing writes).
  /// Task 36 reads roles against this, the same way `useEnsName`'s own `resource` field does for the
  /// page's subject name.
  resource: bigint;
};

export type EnsNameChildren = {
  /// Whether `registry` answered `getState`/`getResolver`/`getSubregistry` at all — a subregistry
  /// can be any `IRegistry`, and one that isn't an `IPermissionedRegistry` (AgentVillage's own
  /// `AgentRegistry`, notably) has no `LabelRegistered` history to enumerate and no per-name state
  /// to re-verify. That's a fact about the registry, not a failed read.
  enumerable: boolean;
  children: EnsChildName[];
};

function childKey(registry: `0x${string}`, labelhash: bigint): string {
  return `${registry.toLowerCase()}:0x${labelhash.toString(16)}`;
}

/// The direct subnames of one ENSv2 name — the names registered *in* its own `subregistry`, read
/// the same protocol-level way `useOwnedEthNames` reads what an address owns: scan
/// `IPermissionedRegistry.LabelRegistered` for candidates, then re-verify every one of them against
/// the registry directly, because an event only proves a label was *once* registered, never that it
/// still is. Works for any standards-compliant subregistry — `ETHRegistry`, a `UserRegistry`
/// deployed via `VerifiableFactory` (task 36) — not just this project's own.
///
/// Deliberately does **not** recurse: a subname's own children are that subname's page's problem
/// (`/ens/[name]` navigated one level deeper), not this hook's. Keeping each page scoped to one
/// name is what keeps this a bounded read instead of a whole-tree crawl.
///
/// Known gap, same class as `useOwnedEthNames`' own: `LabelRegistered` is read as a *candidate*
/// source, not ground truth, and re-verified against live state below — but a label re-registered
/// after lapsing can in principle update the registry's internal entry without emitting a fresh
/// `LabelRegistered` (confirmed against the hackathon `ETHRegistry`: its registrar-level
/// `NameRegistered` count and its own `LabelRegistered` count don't match 1:1). Such a label would
/// be missed here even though it is live. Solving that needs a canonical per-label indexer this
/// project doesn't have; documented rather than silently assumed away.
export function useNameChildren(state: EnsNameState | null | undefined) {
  const publicClient = usePublicClient();
  const subregistry =
    state?.isPermissionedRegistry && state.subregistry && state.subregistry !== zeroAddress
      ? state.subregistry
      : null;

  const parentName = state?.name ?? "";

  return useBlockGatedQuery<EnsNameChildren>(
    ["ensNameChildren", subregistry],
    async () => {
      if (!publicClient || !subregistry) return { enumerable: false, children: [] };
      const result = await fetchChildren(publicClient, subregistry);
      return {
        ...result,
        children: result.children.map((child) => ({ ...child, fullName: `${child.label}.${parentName}` })),
      };
    },
    { enabled: !!publicClient && !!subregistry }
  );
}

async function fetchChildren(publicClient: PublicClient, registry: `0x${string}`): Promise<EnsNameChildren> {
  const logs = await fetchContractEventsChunked({
    publicClient,
    address: registry,
    abi: ethRegistryAbi,
    eventName: "LabelRegistered",
    fromBlock: CONTRACTS.ensDeploymentFirstBlock,
    toBlock: await publicClient.getBlockNumber(),
  });

  // Latest event per tokenId wins — a label re-registered after expiring changes its labelhash's
  // entry but keeps the same tokenId, so this also naturally dedupes.
  const scanned = new Map<bigint, { label: string; tokenId: bigint }>();
  for (const log of logs) {
    if (log.args.tokenId === undefined || log.args.label === undefined) continue;
    scanned.set(log.args.tokenId, { label: log.args.label, tokenId: log.args.tokenId });
  }
  // Merged, not replaced, for the same reason `useOwnedEthNames` does it: a truncated log range
  // from the RPC must not read as "these subnames are gone". See `mergeEventCandidates`.
  const candidateByTokenId = mergeEventCandidates(`LabelRegistered:${registry.toLowerCase()}`, scanned);
  const candidates = [...candidateByTokenId.values()];
  if (candidates.length === 0) {
    // No history — still worth confirming the registry actually speaks `IPermissionedRegistry`
    // before calling this "no subnames" rather than "not enumerable".
    const supports = await publicClient
      .readContract({ address: registry, abi: ethRegistryAbi, functionName: "getStatus", args: [0n] })
      .then(() => true)
      .catch(() => false);
    return { enumerable: supports, children: [] };
  }

  const contract = { address: registry, abi: ethRegistryAbi } as const;
  const results = await publicClient.multicall({
    allowFailure: true,
    contracts: candidates.flatMap(
      (c) =>
        [
          { ...contract, functionName: "getState", args: [c.tokenId] },
          { ...contract, functionName: "getResolver", args: [c.label] },
          { ...contract, functionName: "getSubregistry", args: [c.label] },
        ] as const
    ),
  });

  // If `getState` fails for every single candidate, the registry that emitted these logs doesn't
  // actually implement `IPermissionedRegistry` (a `LabelRegistered`-shaped event from an
  // unrelated/custom contract would be indistinguishable from a real one without this check).
  const anyStateOk = candidates.some((_, i) => results[i * 3].status === "success");
  if (!anyStateOk) return { enumerable: false, children: [] };

  const children: EnsChildName[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const { label, tokenId } = candidates[i];
    const stateResult = results[i * 3];
    const resolverResult = results[i * 3 + 1];
    const subregistryResult = results[i * 3 + 2];
    if (stateResult.status !== "success") continue;

    const chainState = stateResult.result as {
      status: number;
      expiry: bigint;
      latestOwner: `0x${string}`;
      tokenId: bigint;
      resource: bigint;
    };
    children.push({
      ensKey: childKey(registry, tokenId),
      label,
      fullName: label,
      tokenId,
      status: NAME_STATUS[Number(chainState.status)] ?? "available",
      owner: chainState.latestOwner === zeroAddress ? null : chainState.latestOwner,
      expiry: chainState.expiry,
      resolver: resolverResult.status === "success" ? (resolverResult.result as `0x${string}`) : null,
      subregistry: subregistryResult.status === "success" ? (subregistryResult.result as `0x${string}`) : null,
      resource: chainState.resource,
    });
  }

  return { enumerable: true, children: children.sort((a, b) => a.label.localeCompare(b.label)) };
}
