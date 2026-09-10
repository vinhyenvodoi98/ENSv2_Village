"use client";

import { useCallback, useState } from "react";
import { namehash, zeroAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { agentRegistryAbi, ethRegistryAbi, wildcardResolverAbi, wildcardStateStoreAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";
import { useDeployAction, useDeployedContractAddress, useTxAction } from "./useTxAction";

// Mirrors `RegistryRolesLib.sol` in ENSv2's own contracts — not part of this project's `Roles.sol`
// (that one is `AgentRegistry`'s own fleet-internal role set, a different bitmap entirely).
const ROLE_SET_SUBREGISTRY = 1n << 20n;
const ROLE_SET_RESOLVER = 1n << 24n;

type StoredDeploys = {
  agentRegistryTxHash?: `0x${string}`;
  wildcardStateStoreTxHash?: `0x${string}`;
  wildcardResolverTxHash?: `0x${string}`;
};

function storageKey(chainId: number, tokenId: bigint): string {
  return `agentvillage:found-kingdom:${chainId}:${tokenId.toString()}`;
}

function readStored(chainId: number | undefined, tokenId: bigint | null): StoredDeploys {
  if (typeof window === "undefined" || !chainId || tokenId === null) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(chainId, tokenId));
    return raw ? (JSON.parse(raw) as StoredDeploys) : {};
  } catch {
    return {};
  }
}

function writeStored(chainId: number, tokenId: bigint, patch: StoredDeploys) {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(chainId, tokenId);
    const current = readStored(chainId, tokenId);
    window.localStorage.setItem(key, JSON.stringify({ ...current, ...patch }));
  } catch {
    // best-effort — worst case a reload mid-flow has to redeploy the still-unlinked piece
  }
}

type ChainState = {
  resource: bigint;
  currentRegistry: `0x${string}`;
  currentResolver: `0x${string}`;
  roleBitmap: bigint;
};

/// Task 32: "found your kingdom" — deploy a kingdom's own `AgentRegistry`, then wire it and a
/// fresh `WildcardResolver`/`WildcardStateStore` pair onto the claimed name. Verified against the
/// actual contracts (not assumed): `WildcardResolver`/`WildcardStateStore` are each bound to a
/// single `AgentRegistry` via an immutable constructor arg (and `WildcardStateStore`'s wildcard
/// state is keyed by bare `labelhash`, with no per-registry scoping at all) — the shared instance
/// task 30 deployed for `agentvillage.eth` genuinely cannot be reused for a second kingdom, so this
/// deploys a dedicated pair every time, not just a dedicated `AgentRegistry`.
///
/// Two chain-verified checkpoints, matching the two `ETHRegistry` links that actually exist:
///   Stage 1 "Establish & appoint the ledger" — deploy `AgentRegistry`, then
///   `ETHRegistry.setSubregistry`. Done when `getSubregistry(label) != 0`.
///   Stage 2 "Raise the signpost" — deploy `WildcardStateStore` + `WildcardResolver`, then
///   `ETHRegistry.setResolver`. Done when `getResolver(label) != 0`.
/// Each stage's intermediate deploy tx hashes are persisted the instant the wallet returns them
/// (same principle as task 31's commit secret) so a reload mid-stage resumes without redeploying
/// an already-confirmed contract — `useDeployedContractAddress` recovers the address from the
/// persisted hash exactly the way task 31 recovers a commit from its stored hash.
export function useFoundKingdom(kingdomName: string | null, tokenId: bigint | null) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const label = kingdomName ? kingdomName.replace(/\.eth$/, "") : null;

  const chainQuery = useBlockGatedQuery<ChainState | null>(
    ["foundKingdomChainState", label, tokenId?.toString(), address],
    async () => {
      if (!publicClient || !label || tokenId === null || !address) return null;
      const registryContract = { address: CONTRACTS.ethRegistry, abi: ethRegistryAbi } as const;
      const [resource, currentRegistry, currentResolver] = await Promise.all([
        publicClient.readContract({ ...registryContract, functionName: "getResource", args: [tokenId] }),
        publicClient.readContract({ ...registryContract, functionName: "getSubregistry", args: [label] }),
        publicClient.readContract({ ...registryContract, functionName: "getResolver", args: [label] }),
      ]);
      const roleBitmap = await publicClient.readContract({
        ...registryContract,
        functionName: "roles",
        args: [resource, address],
      });
      return { resource, currentRegistry, currentResolver, roleBitmap };
    },
    { enabled: !!publicClient && !!label && tokenId !== null && !!address }
  );
  const chainState = chainQuery.data ?? null;

  const stage1Done = !!chainState && chainState.currentRegistry !== zeroAddress;
  const stage2Done = !!chainState && chainState.currentResolver !== zeroAddress;
  const hasSubregistryRole = !!chainState && (chainState.roleBitmap & ROLE_SET_SUBREGISTRY) !== 0n;
  const hasResolverRole = !!chainState && (chainState.roleBitmap & ROLE_SET_RESOLVER) !== 0n;

  // Same render-phase cache pattern as `useClaimName`'s `storedCache` / `useSelectedKingdom`:
  // reset synchronously when the kingdom (tokenId) changes, never via a `useEffect`+setState.
  const cacheKey = chainId && tokenId !== null ? `${chainId}:${tokenId.toString()}` : null;
  const [cache, setCache] = useState<{ key: string | null; value: StoredDeploys }>(() => ({
    key: cacheKey,
    value: readStored(chainId, tokenId),
  }));
  if (cache.key !== cacheKey) {
    setCache({ key: cacheKey, value: readStored(chainId, tokenId) });
  }
  const stored = cache.value;

  const persist = useCallback(
    (patch: StoredDeploys) => {
      if (!chainId || tokenId === null) return;
      writeStored(chainId, tokenId, patch);
      setCache({ key: cacheKey, value: { ...stored, ...patch } });
    },
    [chainId, tokenId, cacheKey, stored]
  );

  const { address: recoveredAgentRegistry } = useDeployedContractAddress(stage1Done ? undefined : stored.agentRegistryTxHash);
  const { address: recoveredStateStore } = useDeployedContractAddress(stored.wildcardStateStoreTxHash);
  const { address: recoveredResolver } = useDeployedContractAddress(stage2Done ? undefined : stored.wildcardResolverTxHash);

  const agentRegistryAddress: `0x${string}` | null =
    stage1Done && chainState ? chainState.currentRegistry : recoveredAgentRegistry;
  const wildcardStateStoreAddress = recoveredStateStore;
  const wildcardResolverAddress: `0x${string}` | null =
    stage2Done && chainState ? chainState.currentResolver : recoveredResolver;

  const deployRegistryAction = useDeployAction();
  const linkRegistryAction = useTxAction();
  const deployStateStoreAction = useDeployAction();
  const deployResolverAction = useDeployAction();
  const linkResolverAction = useTxAction();

  const deployRegistry = useCallback(async () => {
    if (!address) return;
    const { agentRegistryBytecode } = await import("@/lib/contracts/bytecode");
    const hash = await deployRegistryAction.deploy({ abi: agentRegistryAbi, bytecode: agentRegistryBytecode, args: [address] });
    persist({ agentRegistryTxHash: hash });
  }, [address, deployRegistryAction, persist]);

  const linkRegistry = useCallback(async () => {
    if (!agentRegistryAddress || tokenId === null) return;
    await linkRegistryAction.send({
      address: CONTRACTS.ethRegistry,
      abi: ethRegistryAbi,
      functionName: "setSubregistry",
      args: [tokenId, agentRegistryAddress],
    });
  }, [agentRegistryAddress, tokenId, linkRegistryAction]);

  const deployStateStore = useCallback(async () => {
    if (!agentRegistryAddress) return;
    const { wildcardStateStoreBytecode } = await import("@/lib/contracts/bytecode");
    const hash = await deployStateStoreAction.deploy({
      abi: wildcardStateStoreAbi,
      bytecode: wildcardStateStoreBytecode,
      args: [agentRegistryAddress],
    });
    persist({ wildcardStateStoreTxHash: hash });
  }, [agentRegistryAddress, deployStateStoreAction, persist]);

  const deployResolver = useCallback(async () => {
    if (!agentRegistryAddress || !wildcardStateStoreAddress || !kingdomName) return;
    const { wildcardResolverBytecode } = await import("@/lib/contracts/bytecode");
    const parentNode = namehash(kingdomName);
    const hash = await deployResolverAction.deploy({
      abi: wildcardResolverAbi,
      bytecode: wildcardResolverBytecode,
      args: [agentRegistryAddress, wildcardStateStoreAddress, parentNode],
    });
    persist({ wildcardResolverTxHash: hash });
  }, [agentRegistryAddress, wildcardStateStoreAddress, kingdomName, deployResolverAction, persist]);

  const linkResolver = useCallback(async () => {
    if (!wildcardResolverAddress || tokenId === null) return;
    await linkResolverAction.send({
      address: CONTRACTS.ethRegistry,
      abi: ethRegistryAbi,
      functionName: "setResolver",
      args: [tokenId, wildcardResolverAddress],
    });
  }, [wildcardResolverAddress, tokenId, linkResolverAction]);

  return {
    loading: chainQuery.isLoading || !chainState,
    stage1: {
      done: stage1Done,
      blockedReason: !hasSubregistryRole ? "missing ROLE_SET_SUBREGISTRY on this name" : null,
      agentRegistryAddress,
      deployRegistry: { run: deployRegistry, ...deployRegistryAction },
      linkRegistry: { run: linkRegistry, state: linkRegistryAction.state, txHash: linkRegistryAction.txHash, error: linkRegistryAction.error },
    },
    stage2: {
      done: stage2Done,
      blockedReason: !hasResolverRole ? "missing ROLE_SET_RESOLVER on this name" : null,
      wildcardStateStoreAddress,
      wildcardResolverAddress,
      deployStateStore: { run: deployStateStore, ...deployStateStoreAction },
      deployResolver: { run: deployResolver, ...deployResolverAction },
      linkResolver: { run: linkResolver, state: linkResolverAction.state, txHash: linkResolverAction.txHash, error: linkResolverAction.error },
    },
  };
}
