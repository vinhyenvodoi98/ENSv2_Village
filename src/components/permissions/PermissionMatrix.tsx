"use client";

import { useMemo, useState } from "react";
import { agentRegistryAbi, agentResolverAbi } from "@/lib/contracts/abis";
import {
  canManageKey,
  canWriteKey,
  ROLE,
  STANDARD_RECORD_KEYS,
  useEffectiveRoles,
  useKeyWriters,
  useTxAction,
  type NamespaceNode,
  type RecordKeyDef,
} from "@/lib/ens";
import { truncateAddress } from "@/lib/format";
import { TxStatus } from "@/components/shared/TxStatus";

/// Task 13's account × record-key matrix. Columns are `AgentResolver`'s key -> role table
/// (`STANDARD_RECORD_KEYS`) plus whatever custom keys `grantKeyWriter` has ever touched for this
/// node; rows are every account with a stake in the agent — owner, `agentKey`, anyone holding an
/// EACL role on this resource, and anyone with a per-key delegation. Cell state is computed
/// straight from that on-chain history (`canWriteKey`), never a hardcoded table.
export function PermissionMatrix({ node }: { node: NamespaceNode }) {
  const resource = BigInt(node.labelhash);
  const { byAccount, connected } = useEffectiveRoles(node.registry, resource);
  const { data: keyWriters } = useKeyWriters(node.resolver, node.labelhash);

  const columns: RecordKeyDef[] = useMemo(() => {
    const known = new Set(STANDARD_RECORD_KEYS.map((k) => k.key));
    const custom = new Set<string>();
    for (const grant of keyWriters ?? []) if (!known.has(grant.key)) custom.add(grant.key);
    return [...STANDARD_RECORD_KEYS, ...[...custom].sort().map((key) => ({ key, kind: "operator" as const }))];
  }, [keyWriters]);

  const keyWriterSet = useMemo(() => {
    const set = new Set<string>();
    for (const grant of keyWriters ?? []) set.add(`${grant.key}:${grant.account.toLowerCase()}`);
    return set;
  }, [keyWriters]);

  const accounts = useMemo(() => {
    const set = new Set<string>();
    set.add(node.owner.toLowerCase());
    set.add(node.agentKey.toLowerCase());
    for (const account of byAccount.keys()) set.add(account);
    for (const grant of keyWriters ?? []) set.add(grant.account.toLowerCase());
    return [...set];
  }, [node.owner, node.agentKey, byAccount, keyWriters]);

  const { send, state, txHash, error, reset } = useTxAction();
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  async function toggle(account: string, keyDef: RecordKeyDef, nextGrant: boolean) {
    reset();
    setPendingCell(`${keyDef.key}:${account}`);
    try {
      if (keyDef.kind === "self" || keyDef.kind === "admin") {
        const role = keyDef.kind === "self" ? ROLE.AGENT_SELF : ROLE.AGENT_ADMIN;
        await send({
          address: node.registry,
          abi: agentRegistryAbi,
          functionName: nextGrant ? "grantAgentRole" : "revokeAgentRole",
          args: [node.label, role, account as `0x${string}`],
        });
      } else if (keyDef.kind === "operator") {
        await send({
          address: node.resolver,
          abi: agentResolverAbi,
          functionName: nextGrant ? "grantKeyWriter" : "revokeKeyWriter",
          args: [node.labelhash, keyDef.key, account as `0x${string}`],
        });
      }
    } catch {
      // surfaced via TxStatus below
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-black/[.03] text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/[.04] dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-2 text-center font-mono text-[10px] normal-case">
                  {c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {accounts.map((account) => {
              const isAgentKey = account === node.agentKey.toLowerCase();
              const isOwner = account === node.owner.toLowerCase();
              const effective = byAccount.get(account) ?? 0n;
              return (
                <tr key={account} className={isAgentKey ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {truncateAddress(account)}
                    {isAgentKey && (
                      <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        agentKey
                      </span>
                    )}
                    {isOwner && (
                      <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        owner
                      </span>
                    )}
                  </td>
                  {columns.map((keyDef) => {
                    const isWriter = keyWriterSet.has(`${keyDef.key}:${account}`);
                    const canWrite = canWriteKey(keyDef, effective, isWriter);
                    const canManage = canManageKey(keyDef, connected);
                    const busy = pendingCell === `${keyDef.key}:${account}` && (state === "signing" || state === "confirming");
                    return (
                      <td key={keyDef.key} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={keyDef.kind === "reserved" || !canManage || busy}
                          title={
                            keyDef.kind === "reserved"
                              ? "reserved — never writable via the resolver"
                              : !canManage
                                ? "connected wallet lacks admin rights for this key"
                                : canWrite
                                  ? "click to revoke"
                                  : "click to grant"
                          }
                          onClick={() => toggle(account, keyDef, !canWrite)}
                          className={[
                            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-opacity",
                            keyDef.kind === "reserved"
                              ? "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                              : canWrite
                                ? "bg-emerald-500 text-white"
                                : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                            canManage && keyDef.kind !== "reserved" ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed opacity-60",
                            busy ? "animate-pulse" : "",
                          ].join(" ")}
                        >
                          {keyDef.kind === "reserved" ? "—" : canWrite ? "✓" : "✕"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TxStatus state={state} txHash={txHash} error={error} />
    </div>
  );
}
