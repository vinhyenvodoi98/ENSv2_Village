import { usePublicClient } from "wagmi";
import { agentRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";

export type RoleGrant = {
  account: `0x${string}`;
  /// Nybble-packed EACL bitmap (`docs/ensv2-reference.md` §3 / `src/Roles.sol`) — the caller
  /// decodes individual `Roles.*` bits, this hook only reports what's currently held.
  roleBitmap: bigint;
};

/// Builds the account × role table for one EACL `resource` (task 04) by replaying
/// `EACRolesChanged` — `EnhancedAccessControl`'s single source of truth for role state, which
/// `AgentRegistry` inherits directly (no separate "roles" read function exists on-chain).
///
/// Each event's `newRoleBitmap` is already the *full* post-change bitmap for that
/// `(resource, account)` pair, not a delta (see the constructor/`spawn` traces from task 09's
/// deploy) — so the last event per account, in block order, is that account's current roles.
/// Accounts whose latest bitmap is `0` (fully revoked) are dropped from the result.
///
/// `resource` is `0n` for `ROOT_RESOURCE` (fleet-wide roles, e.g. `FLEET_ADMIN`) or
/// `uint256(labelhash)` for a single agent's resource.
export function useRoles(resource: bigint, registry: `0x${string}` = CONTRACTS.agentRegistry) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<RoleGrant[]>(["roles", registry, resource.toString()], async () => {
    if (!publicClient) throw new Error("useRoles: missing publicClient");

    const logs = await publicClient.getContractEvents({
      address: registry,
      abi: agentRegistryAbi,
      eventName: "EACRolesChanged",
      args: { resource },
      fromBlock: CONTRACTS.deployBlock,
      toBlock: "latest",
    });

    const latestByAccount = new Map<`0x${string}`, bigint>();
    for (const log of logs) {
      if (!log.args.account) continue;
      latestByAccount.set(log.args.account, log.args.newRoleBitmap ?? 0n);
    }

    return [...latestByAccount.entries()]
      .filter(([, roleBitmap]) => roleBitmap !== 0n)
      .map(([account, roleBitmap]) => ({ account, roleBitmap }));
  });
}
