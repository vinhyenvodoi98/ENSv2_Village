import { usePublicClient } from "wagmi";
import { agentResolverAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";

export type KeyWriterGrant = { key: string; account: `0x${string}` };

/// Task 13's delegate panel/permission matrix source: replays `KeyWriterGranted`/
/// `KeyWriterRevoked` (task 05) for one node on one `AgentResolver` — the per-key OPERATOR
/// delegation table (`grantKeyWriter`/`revokeKeyWriter`). Same "last event per pair wins"
/// reduction `useRoles` uses for `EACRolesChanged`, keyed here by `(keyHash, account)` since a
/// key's plaintext string only appears in the event args, not derivable from `keyHash` alone.
export function useKeyWriters(resolver: `0x${string}` | undefined, node: `0x${string}` | undefined) {
  const publicClient = usePublicClient();

  return useBlockGatedQuery<KeyWriterGrant[]>(
    ["keyWriters", resolver, node],
    async () => {
      if (!publicClient || !resolver || !node) throw new Error("useKeyWriters: missing publicClient/resolver/node");

      const contract = { address: resolver, abi: agentResolverAbi, fromBlock: CONTRACTS.deployBlock, toBlock: "latest" as const };
      const [grants, revokes] = await Promise.all([
        publicClient.getContractEvents({ ...contract, eventName: "KeyWriterGranted", args: { node } }),
        publicClient.getContractEvents({ ...contract, eventName: "KeyWriterRevoked", args: { node } }),
      ]);

      const all = [
        ...grants.map((log) => ({ ...log, granted: true as const })),
        ...revokes.map((log) => ({ ...log, granted: false as const })),
      ].sort((a, b) => (a.blockNumber !== b.blockNumber ? (a.blockNumber < b.blockNumber ? -1 : 1) : a.logIndex - b.logIndex));

      const latest = new Map<string, KeyWriterGrant & { granted: boolean }>();
      for (const log of all) {
        if (!log.args.account || log.args.key === undefined || log.args.keyHash === undefined) continue;
        latest.set(`${log.args.keyHash}:${log.args.account.toLowerCase()}`, {
          key: log.args.key,
          account: log.args.account,
          granted: log.granted,
        });
      }

      return [...latest.values()].filter((v) => v.granted).map(({ key, account }) => ({ key, account }));
    },
    { enabled: !!resolver && !!node }
  );
}
