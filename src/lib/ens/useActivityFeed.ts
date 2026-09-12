import { hexToBytes, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";
import { enhancedAccessControlAbi, ethRegistryAbi, permissionedResolverAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { truncateAddress, formatAbsoluteTime } from "@/lib/format";
import { fetchContractEventsChunked } from "./logs";
import { useBlockGatedQuery } from "./query";
import { ADMIN_ROLE_SHIFT, REGISTRY_ROLES, RESOLVER_ROLES, hasRoleBit, resolverResource, type EnsRoleDef } from "./registryRoles";
import type { EnsNameState } from "./useEnsName";

export type ActivityEvent = {
  blockNumber: bigint;
  logIndex: number;
  timestamp: bigint;
  txHash: `0x${string}`;
  summary: string;
};

type PendingEvent = { blockNumber: bigint; logIndex: number; txHash: `0x${string}`; summary: string };

function push(list: PendingEvent[], log: { blockNumber: bigint; logIndex: number; transactionHash: `0x${string}` }, summary: string) {
  list.push({ blockNumber: log.blockNumber, logIndex: log.logIndex, txHash: log.transactionHash, summary });
}

/// Diffs one `EACRolesChanged` bitmap pair against a role vocabulary and renders the bits that
/// actually flipped as named grants/revokes — task 38's one hard requirement: "a raw bitmap in the
/// feed is a bug." A preset grant (`eaclPresets.ts`) ORs several bits into one `grantRoles` call, so
/// one log can carry several role names; they're joined into the same line rather than one line each.
function describeRoleDiff(defs: readonly EnsRoleDef[], oldBitmap: bigint, newBitmap: bigint, account: `0x${string}`): string {
  const granted: string[] = [];
  const revoked: string[] = [];

  for (const def of defs) {
    const wasHeld = hasRoleBit(oldBitmap, def.bit);
    const isHeld = hasRoleBit(newBitmap, def.bit);
    if (wasHeld !== isHeld) (isHeld ? granted : revoked).push(def.key);

    const wasAdmin = hasRoleBit(oldBitmap, def.bit << ADMIN_ROLE_SHIFT);
    const isAdmin = hasRoleBit(newBitmap, def.bit << ADMIN_ROLE_SHIFT);
    if (wasAdmin !== isAdmin) (isAdmin ? granted : revoked).push(`${def.key}_ADMIN`);
  }

  const who = truncateAddress(account);
  const parts: string[] = [];
  if (granted.length > 0) parts.push(`granted ${granted.join(", ")} to ${who}`);
  if (revoked.length > 0) parts.push(`revoked ${revoked.join(", ")} from ${who}`);
  return parts.length > 0 ? parts.join("; ") : `role bitmap updated for ${who}`;
}

/// DNS-wire name (length-prefixed labels, zero-terminated) → dotted string — `AliasChanged`'s
/// `fromName`/`toName` are packet-encoded, not the plain string every other event here already is.
function decodeDnsWireName(packet: `0x${string}`): string {
  const bytes = hexToBytes(packet);
  const labels: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i];
    if (!len) break;
    labels.push(new TextDecoder().decode(bytes.slice(i + 1, i + 1 + len)));
    i += len + 1;
  }
  return labels.join(".");
}

/// The name's full on-chain history, task 38: every registry/EACL/resolver event `IRegistryEvents`,
/// `IPermissionedRegistry`, `IEnhancedAccessControl` and `IPermissionedResolver` can emit about this
/// specific token/resource/node, merged and time-ordered — the same "read straight from logs, never
/// hand-typed" contract `useAgentEvents` already established for AgentVillage's own timeline.
///
/// Scans start at `CONTRACTS.ethRegistrarFirstBlock` when the governing registry is the shared
/// `ethRegistry`, or the deployment-wide `CONTRACTS.ensDeploymentFirstBlock` floor otherwise — there
/// is no stored per-subregistry deploy block to scan from instead (`useRoleAssignees`/task 34 hit the
/// same gap and made the same call).
export function useActivityFeed(state: EnsNameState | null | undefined) {
  const publicClient = usePublicClient();

  const registry = state?.registry ?? null;
  const tokenId = state?.tokenId ?? null;
  const resource = state?.resource ?? null;
  const label = state?.label ?? null;
  const name = state?.name ?? null;
  const node = state?.node ?? null;
  const resolver = state?.resolver && state.resolver !== zeroAddress ? state.resolver : null;

  return useBlockGatedQuery<ActivityEvent[]>(
    ["activityFeed", name, registry, tokenId?.toString(), resource?.toString(), resolver],
    async () => {
      if (!publicClient || !registry || tokenId === null || resource === null || label === null || node === null) return [];

      const toBlock = await publicClient.getBlockNumber();
      const fromBlock = registry === CONTRACTS.ethRegistry ? CONTRACTS.ethRegistrarFirstBlock : CONTRACTS.ensDeploymentFirstBlock;
      const registryContract = { publicClient, address: registry, fromBlock, toBlock } as const;

      const [
        labelRegisteredLogs,
        labelReservedLogs,
        labelUnregisteredLogs,
        expiryUpdatedLogs,
        subregistryUpdatedLogs,
        resolverUpdatedLogs,
        tokenResourceLogs,
        tokenRegeneratedFromLogs,
        tokenRegeneratedToLogs,
        transferSingleLogs,
        parentUpdatedLogs,
        registryRoleLogs,
      ] = await Promise.all([
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "LabelRegistered", args: { tokenId } }),
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "LabelReserved", args: { tokenId } }),
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "LabelUnregistered", args: { tokenId } }),
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "ExpiryUpdated", args: { tokenId } }),
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "SubregistryUpdated", args: { tokenId } }),
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "ResolverUpdated", args: { tokenId } }),
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "TokenResource", args: { tokenId } }),
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "TokenRegenerated", args: { oldTokenId: tokenId } }),
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "TokenRegenerated", args: { newTokenId: tokenId } }),
        // `id`/`value` aren't indexed on `TransferSingle` (plain ERC-1155), so this can't be
        // narrowed server-side — filtered below by `args.id === tokenId` instead.
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "TransferSingle" }),
        // `label` isn't indexed either; filtered below by `args.label === label`.
        fetchContractEventsChunked({ ...registryContract, abi: ethRegistryAbi, eventName: "ParentUpdated" }),
        fetchContractEventsChunked({ ...registryContract, abi: enhancedAccessControlAbi, eventName: "EACRolesChanged", args: { resource } }),
      ]);

      const resolverResourceValue = resolver ? resolverResource(node) : null;
      const [resolverRoleLogs, aliasChangedLogs] = resolver
        ? await Promise.all([
            fetchContractEventsChunked({
              publicClient,
              address: resolver,
              fromBlock,
              toBlock,
              abi: enhancedAccessControlAbi,
              eventName: "EACRolesChanged",
              args: { resource: resolverResourceValue! },
            }),
            fetchContractEventsChunked({ publicClient, address: resolver, fromBlock, toBlock, abi: permissionedResolverAbi, eventName: "AliasChanged" }),
          ])
        : [[], []];

      const events: PendingEvent[] = [];

      for (const log of labelRegisteredLogs) push(events, log, `Registered to ${truncateAddress(log.args.owner!)}, expires ${formatAbsoluteTime(log.args.expiry!)}`);
      for (const log of labelReservedLogs) push(events, log, `Reserved until ${formatAbsoluteTime(log.args.expiry!)}`);
      for (const log of labelUnregisteredLogs) push(events, log, `Unregistered by ${truncateAddress(log.args.sender!)}`);
      for (const log of expiryUpdatedLogs) push(events, log, `Renewed — expiry now ${formatAbsoluteTime(log.args.newExpiry!)}`);
      for (const log of subregistryUpdatedLogs) push(events, log, `Subregistry set to ${truncateAddress(log.args.subregistry!)}`);
      for (const log of resolverUpdatedLogs) push(events, log, `Resolver set to ${truncateAddress(log.args.resolver!)}`);
      for (const log of tokenResourceLogs) push(events, log, `EACL resource assigned: ${log.args.resource!.toString()}`);
      for (const log of tokenRegeneratedFromLogs) push(events, log, `Token regenerated — replaced by token ${log.args.newTokenId!.toString()}`);
      for (const log of tokenRegeneratedToLogs) push(events, log, `Token regenerated — replaces token ${log.args.oldTokenId!.toString()}`);

      for (const log of transferSingleLogs) {
        if (log.args.id !== tokenId) continue;
        // The mint's own `TransferSingle` (`from: address(0)`) is the same moment `LabelRegistered`
        // already reports — skipped here so registering a name doesn't also read as a transfer.
        if (log.args.from === zeroAddress) continue;
        push(events, log, `Transferred from ${truncateAddress(log.args.from!)} to ${truncateAddress(log.args.to!)}`);
      }

      for (const log of parentUpdatedLogs) {
        if (log.args.label !== label) continue;
        push(events, log, `Registry re-parented under ${truncateAddress(log.args.parent!)}`);
      }

      for (const log of registryRoleLogs) {
        push(events, log, describeRoleDiff(REGISTRY_ROLES, log.args.oldRoleBitmap!, log.args.newRoleBitmap!, log.args.account!));
      }

      for (const log of resolverRoleLogs) {
        push(events, log, describeRoleDiff(RESOLVER_ROLES, log.args.oldRoleBitmap!, log.args.newRoleBitmap!, log.args.account!));
      }

      for (const log of aliasChangedLogs) {
        const fromName = decodeDnsWireName(log.args.fromName!);
        const toName = decodeDnsWireName(log.args.toName!);
        if (fromName !== name && toName !== name) continue;
        push(events, log, toName ? `Records aliased to ${toName}` : `Alias cleared`);
      }

      events.sort((a, b) => (a.blockNumber !== b.blockNumber ? (a.blockNumber < b.blockNumber ? -1 : 1) : a.logIndex - b.logIndex));
      if (events.length === 0) return [];

      const uniqueBlocks = [...new Set(events.map((event) => event.blockNumber))];
      const blocks = await Promise.all(uniqueBlocks.map((blockNumber) => publicClient.getBlock({ blockNumber })));
      const timestampByBlock = new Map(uniqueBlocks.map((blockNumber, i) => [blockNumber, blocks[i].timestamp]));

      return events.map((event) => ({ ...event, timestamp: timestampByBlock.get(event.blockNumber) ?? 0n }));
    },
    { enabled: !!publicClient && !!registry && tokenId !== null && resource !== null }
  );
}
