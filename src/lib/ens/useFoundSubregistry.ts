"use client";

import { useCallback, useState } from "react";
import { zeroAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { ethRegistryAbi, permissionedRegistryAbi } from "@/lib/contracts/abis";
import { ADMIN_ROLE_SHIFT, REGISTRY_ROLES } from "./registryRoles";
import { useBlockGatedQuery } from "./query";
import type { EnsNameState } from "./useEnsName";
import { useDeployAction, useDeployedContractAddress, useTxAction } from "./useTxAction";

function roleBit(key: string): bigint {
  const def = REGISTRY_ROLES.find((r) => r.key === key);
  if (!def) throw new Error(`useFoundSubregistry: unknown role key ${key}`);
  return def.bit;
}

/// Task 36 step 1's default grant: the deployer gets `ROLE_REGISTRAR` (so `register()` needs no
/// permission from anyone above, per the task's own spec) plus its admin (so they can delegate
/// registration later without redeploying), and the sibling `ROLE_REGISTER_RESERVED` +
/// `ROLE_SET_URI` root-only roles + their admins — the same shape `ETHRegistrar`'s own
/// `REGISTRATION_ROLE_BITMAP` takes for a *token*-scope grant, mirrored here for the *root*-scope
/// bitmap a fresh registry's constructor grants to its `rootAccount`. Built from `REGISTRY_ROLES`'
/// own bit values, never a retyped literal.
const ROOT_OWNER_BITMAP = ["ROLE_REGISTRAR", "ROLE_REGISTER_RESERVED", "ROLE_SET_URI"].reduce(
  (bm, key) => bm | roleBit(key) | (roleBit(key) << ADMIN_ROLE_SHIFT),
  0n
);

const ROLE_SET_SUBREGISTRY = roleBit("ROLE_SET_SUBREGISTRY");

type StoredDeploy = { registryTxHash?: `0x${string}` };

function storageKey(chainId: number, tokenId: bigint): string {
  return `agentvillage:found-subregistry:${chainId}:${tokenId.toString()}`;
}

function readStored(chainId: number | undefined, tokenId: bigint | null): StoredDeploy {
  if (typeof window === "undefined" || !chainId || tokenId === null) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(chainId, tokenId));
    return raw ? (JSON.parse(raw) as StoredDeploy) : {};
  } catch {
    return {};
  }
}

function writeStored(chainId: number, tokenId: bigint, patch: StoredDeploy) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(chainId, tokenId), JSON.stringify({ ...readStored(chainId, tokenId), ...patch }));
  } catch {
    // best-effort, matching useFoundKingdom.ts
  }
}

/// Task 36's "found your own registry": deploy a dedicated `PermissionedRegistry` for `state`, then
/// `setSubregistry` on its parent — the same two-checkpoint, chain-verified, resumable-after-reload
/// shape `useFoundKingdom.ts` uses for task 32, reused rather than reinvented because it's already
/// proven for exactly this kind of "deploy, then link, and never assume a step from a stale tx
/// state" flow. Reuses the *existing* registry's own `LABEL_STORE` (read live, not guessed) rather
/// than deploying a second one — `ILabelStore` has no per-registry state of its own to duplicate.
export function useFoundSubregistry(state: EnsNameState | null | undefined) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();

  const registry = state?.registry ?? null;
  const tokenId = state?.tokenId ?? null;
  const resource = state?.resource ?? null;

  const chainQuery = useBlockGatedQuery(
    ["foundSubregistryChainState", registry, tokenId?.toString(), address],
    async () => {
      if (!publicClient || !registry || tokenId === null || resource === null || !address) return null;
      const [currentSubregistry, labelStore, roleBitmap] = await Promise.all([
        publicClient.readContract({ address: registry, abi: ethRegistryAbi, functionName: "getSubregistry", args: [state!.label] }),
        publicClient.readContract({ address: registry, abi: permissionedRegistryAbi, functionName: "LABEL_STORE" }),
        publicClient.readContract({ address: registry, abi: ethRegistryAbi, functionName: "roles", args: [resource, address] }),
      ]);
      return { currentSubregistry, labelStore, roleBitmap };
    },
    { enabled: !!publicClient && !!registry && tokenId !== null && resource !== null && !!address }
  );
  const chainState = chainQuery.data ?? null;

  const done = !!chainState && chainState.currentSubregistry !== zeroAddress;
  const hasSubregistryRole = !!chainState && (chainState.roleBitmap & ROLE_SET_SUBREGISTRY) !== 0n;

  const cacheKey = chainId && tokenId !== null ? `${chainId}:${tokenId.toString()}` : null;
  const [cache, setCache] = useState<{ key: string | null; value: StoredDeploy }>(() => ({
    key: cacheKey,
    value: readStored(chainId, tokenId),
  }));
  if (cache.key !== cacheKey) setCache({ key: cacheKey, value: readStored(chainId, tokenId) });

  const persist = useCallback(
    (patch: StoredDeploy) => {
      if (!chainId || tokenId === null) return;
      writeStored(chainId, tokenId, patch);
      setCache({ key: cacheKey, value: { ...cache.value, ...patch } });
    },
    [chainId, tokenId, cacheKey, cache.value]
  );

  const { address: recoveredRegistry } = useDeployedContractAddress(done ? undefined : cache.value.registryTxHash);
  const newRegistryAddress: `0x${string}` | null = done && chainState ? chainState.currentSubregistry : recoveredRegistry;

  const deployAction = useDeployAction();
  const linkAction = useTxAction();

  const deploy = useCallback(async () => {
    if (!address || !chainState?.labelStore) return;
    const { permissionedRegistryBytecode } = await import("@/lib/contracts/bytecode");
    const hash = await deployAction.deploy({
      abi: permissionedRegistryAbi,
      bytecode: permissionedRegistryBytecode,
      args: [chainState.labelStore, address, ROOT_OWNER_BITMAP],
    });
    persist({ registryTxHash: hash });
  }, [address, chainState, deployAction, persist]);

  const link = useCallback(async () => {
    if (!newRegistryAddress || !registry || tokenId === null) return;
    await linkAction.send({
      address: registry,
      abi: ethRegistryAbi,
      functionName: "setSubregistry",
      args: [tokenId, newRegistryAddress],
    });
  }, [newRegistryAddress, registry, tokenId, linkAction]);

  return {
    loading: chainQuery.isLoading || !chainState,
    done,
    blockedReason: !hasSubregistryRole ? "missing ROLE_SET_SUBREGISTRY on this name" : null,
    newRegistryAddress,
    deploy: { run: deploy, ...deployAction },
    link: { run: link, state: linkAction.state, txHash: linkAction.txHash, error: linkAction.error },
  };
}
