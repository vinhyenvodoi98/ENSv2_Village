"use client";

import { useCallback } from "react";
import { zeroAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { enhancedAccessControlAbi, ethRegistryAbi } from "@/lib/contracts/abis";
import { resolverResource } from "./registryRoles";
import { subnameRegistryBitmap, subnameResolverBitmap, type SubnamePreset } from "./subnamePresets";
import { nameNode } from "./name";
import { useTxAction } from "./useTxAction";

export type RegisterSubnameParams = {
  subregistry: Address;
  label: string;
  owner: Address;
  resolver: Address | null;
  preset: SubnamePreset;
  expiry: bigint;
  parentName: string;
};

/// Task 36's "register a subname" action: one `register()` call carrying the preset's registry-scope
/// bitmap, per the acceptance criteria ("registering with the records only preset → that child's
/// owner can setText"). A resolver that supports `IEnhancedAccessControl` gets a *second*, best-effort
/// `grantRoles` for the preset's resolver-scope roles right after — attempted only when the resolver
/// actually answers `roles()` (a plain read, so failure never blocks the registration itself) and
/// reported separately, since `register()` succeeding and the resolver grant succeeding are two
/// different facts a caller might need to act on independently (e.g. no resolver chosen at all).
export function useRegisterSubname() {
  const publicClient = usePublicClient();
  const registerAction = useTxAction();
  const grantAction = useTxAction();

  const register = useCallback(
    async (params: RegisterSubnameParams) => {
      const registryBitmap = subnameRegistryBitmap(params.preset);
      const resolverBitmap = subnameResolverBitmap(params.preset);
      const resolver = params.resolver ?? zeroAddress;

      // The `registry` argument is the *child's own* subregistry, not the contract this call is
      // made on — a fresh subname is minted with none (`address(0)`); it gets one later, through
      // this same "found your own registry" flow one level down, which is exactly the recursion
      // the task describes ("a child can itself become a registry").
      await registerAction.send({
        address: params.subregistry,
        abi: ethRegistryAbi,
        functionName: "register",
        args: [params.label, params.owner, zeroAddress, resolver, registryBitmap, params.expiry],
      });

      if (resolverBitmap === 0n || resolver === zeroAddress || !publicClient) {
        return { resolverGrantAttempted: false, resolverGrantOk: false };
      }

      const childNode = nameNode(`${params.label}.${params.parentName}`);
      const resource = resolverResource(childNode);

      // Feature-detect: a resolver without `IEnhancedAccessControl` (this project's own
      // `WildcardResolver`, notably) simply has no `roles()`/`grantRoles()` to call — that's a fact
      // about the resolver, not a failed grant, so it's checked for up front rather than let a
      // `grantRoles` revert stand in for "not supported".
      const supportsEacl = await publicClient
        .readContract({ address: resolver, abi: enhancedAccessControlAbi, functionName: "roles", args: [resource, params.owner] })
        .then(() => true)
        .catch(() => false);
      if (!supportsEacl) return { resolverGrantAttempted: false, resolverGrantOk: false };

      try {
        await grantAction.send({
          address: resolver,
          abi: enhancedAccessControlAbi,
          functionName: "grantRoles",
          args: [resource, resolverBitmap, params.owner],
        });
        return { resolverGrantAttempted: true, resolverGrantOk: true };
      } catch {
        return { resolverGrantAttempted: true, resolverGrantOk: false };
      }
    },
    [publicClient, registerAction, grantAction]
  );

  return { register, registerAction, grantAction };
}
