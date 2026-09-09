"use client";

import { useAccount } from "wagmi";
import { useRoles } from "./useRoles";

/// EACL's real authorization surface for one resource: a resource-scoped grant OR'd with
/// whatever's granted at `ROOT_RESOURCE` (`EnhancedAccessControl`'s root fallback — see
/// `useRoles`'s own doc comment). Shared by task 13's permission matrix and task 14's lifecycle
/// actions, both of which need "does the connected wallet actually have authority here" plus,
/// for the matrix, the same computation for every other account with a stake in this agent.
export function useEffectiveRoles(registry: `0x${string}`, resource: bigint) {
  const { address } = useAccount();
  const { data: resourceRoles } = useRoles(resource, registry);
  const { data: rootRoles } = useRoles(0n, registry);

  const byAccount = new Map<string, bigint>();
  for (const grant of resourceRoles ?? []) {
    const key = grant.account.toLowerCase();
    byAccount.set(key, (byAccount.get(key) ?? 0n) | grant.roleBitmap);
  }
  for (const grant of rootRoles ?? []) {
    const key = grant.account.toLowerCase();
    byAccount.set(key, (byAccount.get(key) ?? 0n) | grant.roleBitmap);
  }

  const connected = address ? (byAccount.get(address.toLowerCase()) ?? 0n) : 0n;

  return { byAccount, connected, resourceRoles, rootRoles };
}
