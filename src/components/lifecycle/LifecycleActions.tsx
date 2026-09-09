"use client";

import { useState } from "react";
import { zeroAddress } from "viem";
import { agentRegistryAbi } from "@/lib/contracts/abis";
import { AGENT_TIERS, hasRole, ROLE, useEffectiveRoles, useTxAction, type NamespaceNode } from "@/lib/ens";
import { HEARTBEATS_PER_TIER } from "@/lib/ens/tierStyles";
import { TxStatus } from "@/components/shared/TxStatus";

/// Task 14: the entire agent lifecycle, operable from the UI — spawn lives at the page level
/// (`SpawnAgentForm`, it creates a *new* agent), everything else that acts on an *existing* one
/// (promote/renew/revoke, or "register on-chain" for a still-local wildcard preview) lives here,
/// inside the detail panel.
export function LifecycleActions({ node }: { node: NamespaceNode }) {
  const resource = BigInt(node.labelhash);
  const { connected } = useEffectiveRoles(node.registry, resource);
  const isFleetAdmin = hasRole(connected, ROLE.FLEET_ADMIN);

  if (node.isLocalPreview) {
    return <RegisterOnChain node={node} isFleetAdmin={isFleetAdmin} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PromoteAction node={node} isFleetAdmin={isFleetAdmin} />
      <RenewAction node={node} isFleetAdmin={isFleetAdmin} />
      <RevokeAction node={node} isFleetAdmin={isFleetAdmin} />
    </div>
  );
}

function RegisterOnChain({ node, isFleetAdmin }: { node: NamespaceNode; isFleetAdmin: boolean }) {
  const { send, state, txHash, error } = useTxAction();
  const reason = !isFleetAdmin ? "requires FLEET_ADMIN" : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="text-zinc-600 dark:text-zinc-300">
        This agent is a free wildcard preview — <strong>not yet on-chain</strong>. Nothing to promote, renew, or
        revoke until it&apos;s minted for real.
      </p>
      <button
        type="button"
        disabled={!!reason || state === "signing" || state === "confirming"}
        title={reason ?? undefined}
        onClick={() =>
          send({
            address: node.registry,
            abi: agentRegistryAbi,
            functionName: "spawn",
            args: [node.label, node.owner, node.agentKey, 0, 0n, false, false, zeroAddress],
          }).catch(() => {})
        }
        className="w-fit rounded-md bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        Register on-chain{reason ? ` — ${reason}` : ""}
      </button>
      <TxStatus state={state} txHash={txHash} error={error} />
    </div>
  );
}

function PromoteAction({ node, isFleetAdmin }: { node: NamespaceNode; isFleetAdmin: boolean }) {
  const { send, state, txHash, error, reset } = useTxAction();
  const [confirmSovereign, setConfirmSovereign] = useState(false);
  const [subregistry, setSubregistry] = useState("");
  const [ack, setAck] = useState(false);

  const currentIndex = AGENT_TIERS.indexOf(node.tier);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= AGENT_TIERS.length) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Sovereign — top of the ladder, nothing left to promote to.
      </p>
    );
  }

  const nextTier = AGENT_TIERS[nextIndex];
  const needed = HEARTBEATS_PER_TIER * nextIndex;
  const ready = node.heartbeatCount >= BigInt(needed);
  const toSovereign = nextTier === "Sovereign";

  const reason = !isFleetAdmin
    ? "requires FLEET_ADMIN"
    : !ready
      ? `needs ${needed - Number(node.heartbeatCount)} more heartbeat(s)`
      : null;

  async function doPromote(subregistryAddr: `0x${string}`) {
    await send({
      address: node.registry,
      abi: agentRegistryAbi,
      functionName: "promote",
      args: [node.label, nextIndex, subregistryAddr],
    }).catch(() => {});
    setConfirmSovereign(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Promote to <span className="font-medium text-zinc-700 dark:text-zinc-200">{nextTier}</span>
      </p>
      <button
        type="button"
        disabled={!!reason}
        title={reason ?? undefined}
        onClick={() => (toSovereign ? setConfirmSovereign(true) : doPromote(zeroAddress))}
        className="w-fit rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        Promote{reason ? ` — ${reason}` : ""}
      </button>
      <TxStatus state={state} txHash={txHash} error={error} />

      {confirmSovereign && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Irreversible: promoting to Sovereign permanently strips parent control. This cannot be undone.
          </p>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-300">
            Pre-deployed sub-registry address (IRegistry)
            <input
              value={subregistry}
              onChange={(e) => setSubregistry(e.target.value)}
              placeholder="0x…"
              className="rounded border border-black/10 bg-white px-2 py-1 font-mono text-xs dark:border-white/10 dark:bg-zinc-900"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            I understand this is permanent and irreversible.
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!ack || !subregistry}
              onClick={() => doPromote(subregistry as `0x${string}`)}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirm — promote to Sovereign
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmSovereign(false);
                reset();
              }}
              className="rounded-md border border-black/10 px-3 py-1.5 text-xs dark:border-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RenewAction({ node, isFleetAdmin }: { node: NamespaceNode; isFleetAdmin: boolean }) {
  const { send, state, txHash, error } = useTxAction();
  const [days, setDays] = useState(30);

  const reason = !isFleetAdmin ? "requires FLEET_ADMIN" : node.expiry === 0n ? "this agent has no expiry" : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Renew lease</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-20 rounded border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-zinc-900"
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">days</span>
        <button
          type="button"
          disabled={!!reason || days <= 0}
          title={reason ?? undefined}
          onClick={() =>
            send({
              address: node.registry,
              abi: agentRegistryAbi,
              functionName: "renew",
              args: [node.label, BigInt(Math.floor(days * 86400))],
            }).catch(() => {})
          }
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          Renew{reason ? ` — ${reason}` : ""}
        </button>
      </div>
      <TxStatus state={state} txHash={txHash} error={error} />
    </div>
  );
}

function RevokeAction({ node, isFleetAdmin }: { node: NamespaceNode; isFleetAdmin: boolean }) {
  const { send, state, txHash, error } = useTxAction();
  const [confirm, setConfirm] = useState(false);

  const reason =
    node.tier === "Sovereign"
      ? "the parent cannot revoke this tier"
      : !node.revocable
        ? "not revocable at this tier"
        : !isFleetAdmin
          ? "requires FLEET_ADMIN"
          : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Revoke (kill switch)</p>
      {!confirm ? (
        <button
          type="button"
          disabled={!!reason}
          title={reason ?? undefined}
          onClick={() => setConfirm(true)}
          className="w-fit rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Revoke{reason ? ` — ${reason}` : ""}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              send({ address: node.registry, abi: agentRegistryAbi, functionName: "revoke", args: [node.label] })
                .then(() => setConfirm(false))
                .catch(() => {})
            }
            className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
          >
            Confirm revoke
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="rounded-md border border-black/10 px-3 py-1.5 text-xs dark:border-white/10"
          >
            Cancel
          </button>
        </div>
      )}
      <TxStatus state={state} txHash={txHash} error={error} />
    </div>
  );
}
