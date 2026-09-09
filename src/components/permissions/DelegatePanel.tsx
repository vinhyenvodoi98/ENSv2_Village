"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { agentResolverAbi } from "@/lib/contracts/abis";
import { hasRole, ROLE, useEffectiveRoles, useKeyWriters, useTxAction, type NamespaceNode } from "@/lib/ens";
import { truncateAddress } from "@/lib/format";
import { TxStatus } from "@/components/shared/TxStatus";

/// Task 13's delegate panel: "letting an account edit only certain text records" — grants write
/// access to exactly one record key via `AgentResolver.grantKeyWriter`, the same per-key OPERATOR
/// mechanism the permission matrix's custom-key columns read back.
export function DelegatePanel({ node }: { node: NamespaceNode }) {
  const resource = BigInt(node.labelhash);
  const { connected } = useEffectiveRoles(node.registry, resource);
  const { data: keyWriters } = useKeyWriters(node.resolver, node.labelhash);
  const { send, state, txHash, error, reset } = useTxAction();

  const [address, setAddress] = useState("");
  const [key, setKey] = useState("");

  const canDelegate = hasRole(connected, ROLE.AGENT_ADMIN);
  const validAddress = isAddress(address);
  const canSubmit = canDelegate && validAddress && key.trim().length > 0;

  async function grant() {
    if (!canSubmit) return;
    await send({
      address: node.resolver,
      abi: agentResolverAbi,
      functionName: "grantKeyWriter",
      args: [node.labelhash, key.trim(), address as `0x${string}`],
    }).catch(() => {});
  }

  async function revoke(grantKey: string, account: `0x${string}`) {
    reset();
    await send({
      address: node.resolver,
      abi: agentResolverAbi,
      functionName: "revokeKeyWriter",
      args: [node.labelhash, grantKey, account],
    }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="flex flex-wrap gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x… account to delegate to"
            className="min-w-0 flex-1 rounded border border-black/10 bg-white px-2 py-1 font-mono text-xs dark:border-white/10 dark:bg-zinc-900"
          />
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="record key, e.g. bio"
            className="w-40 rounded border border-black/10 bg-white px-2 py-1 font-mono text-xs dark:border-white/10 dark:bg-zinc-900"
          />
          <button
            type="button"
            disabled={!canSubmit || state === "signing" || state === "confirming"}
            onClick={grant}
            title={!canDelegate ? "connected wallet needs AGENT_ADMIN to delegate" : undefined}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Delegate
          </button>
        </div>
        {address.length > 0 && !validAddress && <p className="text-xs text-red-500">Not a valid address.</p>}
        <TxStatus state={state} txHash={txHash} error={error} />
      </div>

      {keyWriters && keyWriters.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {keyWriters.map((grant) => (
            <li
              key={`${grant.key}:${grant.account}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-1.5 text-xs dark:border-white/10"
            >
              <span className="font-mono">
                {truncateAddress(grant.account)} → <span className="text-indigo-500">{grant.key}</span>
              </span>
              <button
                type="button"
                disabled={!canDelegate}
                onClick={() => revoke(grant.key, grant.account)}
                className="text-red-500 hover:underline disabled:opacity-50"
              >
                revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
