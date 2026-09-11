import { zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { enhancedAccessControlAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { fetchContractEventsChunked } from "./logs";
import { useBlockGatedQuery } from "./query";
import type { EnsNameState } from "./useEnsName";
import { resolverResource } from "./registryRoles";

export type RoleAssignee = {
  account: `0x${string}`;
  registryBitmap: bigint;
  resolverBitmap: bigint;
};

/// Task 34's matrix rows: "every address that currently holds any role on this name, discovered
/// from `EACRolesChanged` logs, then confirmed against `roles(resource, account)` — logs give the
/// candidate set, chain state decides what is true now."
///
/// `EACRolesChanged.newRoleBitmap` is already the full post-change bitmap for that
/// `(resource, account)` pair (mirrors `useRoles`'s reduction for `AgentRegistry`), so the last log
/// per account is a candidate — but only a candidate: a role revoked, then a *different* role
/// granted back, still leaves a log with a non-zero bitmap that later moved. The live re-read below
/// is what actually decides the row's contents.
export function useRoleAssignees(state: EnsNameState | null | undefined) {
  const publicClient = usePublicClient();

  const registry = state?.registry ?? null;
  const resource = state?.resource ?? null;
  const resolver = state?.resolver && state.resolver !== zeroAddress ? state.resolver : null;
  const node = state?.node ?? null;

  return useBlockGatedQuery<RoleAssignee[]>(
    ["roleAssignees", state?.name, registry, resource?.toString(), resolver],
    async () => {
      if (!publicClient || !registry || resource === null) return [];

      const toBlock = await publicClient.getBlockNumber();
      const registryLogsPromise = fetchContractEventsChunked({
        publicClient,
        address: registry,
        abi: enhancedAccessControlAbi,
        eventName: "EACRolesChanged",
        fromBlock: CONTRACTS.ethRegistrarFirstBlock,
        toBlock,
      });

      // A resolver that isn't a `PermissionedResolver` has no `EACRolesChanged` event at all
      // (`getContractEvents` against it simply returns no logs, since the topic never appears in
      // its receipts — nothing to catch), so this degrades to "no resolver candidates" rather than
      // failing the whole scan.
      const resolverResourceValue = resolver && node ? resolverResource(node) : null;
      const resolverLogsPromise =
        resolver && resolverResourceValue !== null
          ? fetchContractEventsChunked({
              publicClient,
              address: resolver,
              abi: enhancedAccessControlAbi,
              eventName: "EACRolesChanged",
              fromBlock: CONTRACTS.ethRegistrarFirstBlock,
              toBlock,
            })
          : Promise.resolve([]);

      const [registryLogs, resolverLogs] = await Promise.all([registryLogsPromise, resolverLogsPromise]);

      const candidates = new Set<`0x${string}`>();
      for (const log of registryLogs) {
        if (log.args.resource === resource && log.args.account) candidates.add(log.args.account);
      }
      for (const log of resolverLogs) {
        if (log.args.resource === resolverResourceValue && log.args.account) candidates.add(log.args.account);
      }
      if (candidates.size === 0) return [];

      const accounts = [...candidates];
      const registryContract = { address: registry, abi: enhancedAccessControlAbi } as const;
      const registryBitmaps = await publicClient.multicall({
        allowFailure: false,
        contracts: accounts.map(
          (account) => ({ ...registryContract, functionName: "roles", args: [resource, account] }) as const
        ),
      });

      let resolverBitmaps: bigint[] = accounts.map(() => 0n);
      if (resolver && resolverResourceValue !== null) {
        const resolverContract = { address: resolver, abi: enhancedAccessControlAbi } as const;
        resolverBitmaps = await publicClient.multicall({
          allowFailure: false,
          contracts: accounts.map(
            (account) =>
              ({ ...resolverContract, functionName: "roles", args: [resolverResourceValue, account] }) as const
          ),
        });
      }

      return accounts
        .map((account, i) => ({ account, registryBitmap: registryBitmaps[i], resolverBitmap: resolverBitmaps[i] }))
        .filter((row) => row.registryBitmap !== 0n || row.resolverBitmap !== 0n)
        .sort((a, b) => a.account.localeCompare(b.account));
    },
    { enabled: !!publicClient && !!registry && resource !== null }
  );
}
