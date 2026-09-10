"use client";

import { useState } from "react";
import { isAddress, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useAccount } from "wagmi";
import { agentRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { AGENT_TIERS, useTxAction, type AgentTier, type LocalWildcardAgent, type NamespaceNode } from "@/lib/ens";
import { TxStatus } from "@/components/shared/TxStatus";

const LEASE_DURATION_SECONDS = 30n * 24n * 60n * 60n;

/**
 * Why a given parent can't host children yet, or null if it can.
 *
 * Task 07's whole claim is that `Sovereign` is a *real* namespace boundary:
 * such an agent owns its own `AgentRegistry`, and minting under it means
 * calling `spawn` on **that** contract. Anything below Sovereign has no
 * sub-registry at all, so there is nothing to mint into — and quietly falling
 * back to the fleet registry would produce a sibling dressed up as a child,
 * which is exactly the lie this check exists to prevent.
 */
export function describeParentBlock(parent: NamespaceNode): string | null {
  if (parent.isLocalPreview) {
    return "this agent is a free wildcard preview — it isn't on-chain yet, so it has no registry to mint into.";
  }
  if (parent.tier !== "Sovereign") {
    return "only a Sovereign agent has its own sub-registry to mint children into — promote it first.";
  }
  if (parent.subregistry === zeroAddress) {
    return "this agent is Sovereign but has no sub-registry attached yet — promote it again with a registry address.";
  }
  return null;
}

/// Task 14's spawn flow, extended by task 29 to spawn *into* a namespace.
///
/// `Wildcard` is still the tier that makes the contrast visible: no
/// `AgentRegistry.spawn` call at all, just a locally-tracked label the parent
/// still fully controls (task 06 — wildcard resolution answers by rule for
/// *any* label, nothing to mint). Every other starting tier is a real `spawn`
/// tx, sent to the fleet registry at the root or to `parent.subregistry`
/// underneath a `Sovereign`.
export function SpawnAgentForm({
  onSpawnedLocally,
  parent,
  onPromoteParent,
}: {
  onSpawnedLocally: (agent: LocalWildcardAgent) => void;
  /// Spawn as a child of this agent. Omitted = spawn at the root, on the fleet registry.
  parent?: NamespaceNode | null;
  /// Opens the parent's own detail panel, where `promote` lives — the way out of a blocked spawn.
  onPromoteParent?: () => void;
}) {
  const { address: connected } = useAccount();
  const [label, setLabel] = useState("");
  const [tier, setTier] = useState<AgentTier>("Wildcard");
  const [agentKey, setAgentKey] = useState("");
  const [revealedPrivateKey, setRevealedPrivateKey] = useState<string | null>(null);
  const { send, state, txHash, error } = useTxAction();

  function generateAgentKey() {
    const pk = generatePrivateKey();
    setAgentKey(privateKeyToAccount(pk).address);
    setRevealedPrivateKey(pk);
  }

  const parentBlock = parent ? describeParentBlock(parent) : null;
  const targetRegistry = parent ? parent.subregistry : CONTRACTS.agentRegistry;
  const parentName = parent ? parent.fullName : CONTRACTS.parentName;

  const trimmedLabel = label.trim();
  const validAgentKey = tier === "Wildcard" || isAddress(agentKey);
  const canSubmit =
    trimmedLabel.length > 0 &&
    !!connected &&
    !parentBlock &&
    validAgentKey &&
    (tier === "Wildcard" || agentKey.length > 0);

  const disabledReason = parentBlock
    ? `Can't spawn here — ${parentBlock}`
    : !connected
      ? "Connect a wallet to spawn."
      : null;

  async function submit() {
    if (!canSubmit || !connected) return;

    if (tier === "Wildcard") {
      onSpawnedLocally({
        label: trimmedLabel,
        owner: connected,
        agentKey: ((agentKey && isAddress(agentKey) ? agentKey : connected) as `0x${string}`),
        createdAt: Date.now(),
        registry: targetRegistry,
        parentFullName: parentName,
        depth: parent ? parent.depth + 1 : 0,
      });
      setLabel("");
      setAgentKey("");
      setRevealedPrivateKey(null);
      return;
    }

    const tierIndex = AGENT_TIERS.indexOf(tier);
    const revocable = tier === "Leased";
    const transferable = tier === "Owned" || tier === "Sovereign";
    const expiry = tier === "Leased" ? BigInt(Math.floor(Date.now() / 1000)) + LEASE_DURATION_SECONDS : 0n;

    try {
      await send({
        // The address that proves a Sovereign really is its own namespace: a
        // child is minted on the parent's registry, never on the fleet's.
        address: targetRegistry,
        abi: agentRegistryAbi,
        functionName: "spawn",
        args: [trimmedLabel, connected, agentKey as `0x${string}`, tierIndex, expiry, revocable, transferable, CONTRACTS.agentResolver],
      });
      setLabel("");
      setAgentKey("");
      setRevealedPrivateKey(null);
    } catch {
      // surfaced via TxStatus
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">
        {parent ? `Spawn child of ${parent.label}` : "Spawn agent"}
      </h2>

      {parentBlock && (
        <div className="flex flex-col items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <p>
            <strong>Can&apos;t spawn under {parent?.label}</strong> — {parentBlock}
          </p>
          {onPromoteParent && parent && !parent.isLocalPreview && (
            <button
              type="button"
              onClick={onPromoteParent}
              className="rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700"
            >
              Open {parent.label} to promote it
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="label, e.g. scout-02"
          className="min-w-0 flex-1 rounded border border-black/10 bg-white px-2 py-1.5 font-mono text-sm dark:border-white/10 dark:bg-zinc-950"
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as AgentTier)}
          className="rounded border border-black/10 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-950"
        >
          {AGENT_TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* The exact name that's about to exist, shown before signing — the dotted
          form is the only place the namespace hierarchy is legible as text. */}
      <p className="break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {trimmedLabel ? `${trimmedLabel}.${parentName}` : `<label>.${parentName}`}
      </p>

      {tier === "Wildcard" ? (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
          <strong>0 gas, not yet on-chain</strong> — the parent has full control until this agent is minted for
          real. No transaction is sent; a ghost castle appears on the map immediately.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={agentKey}
            onChange={(e) => setAgentKey(e.target.value)}
            placeholder="agent key address (0x…)"
            className="min-w-0 flex-1 rounded border border-black/10 bg-white px-2 py-1.5 font-mono text-xs dark:border-white/10 dark:bg-zinc-950"
          />
          <button
            type="button"
            onClick={generateAgentKey}
            className="rounded-md border border-black/10 px-2 py-1.5 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            Generate
          </button>
        </div>
      )}

      {revealedPrivateKey && (
        <p className="break-all rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Private key (save this now — it&apos;s the agent&apos;s own key, never shown again):{" "}
          <span className="font-mono">{revealedPrivateKey}</span>
        </p>
      )}

      <button
        type="button"
        disabled={!canSubmit || state === "signing" || state === "confirming"}
        title={disabledReason ?? undefined}
        onClick={submit}
        className="w-fit rounded-md bg-black px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {tier === "Wildcard" ? "Spawn (free)" : "Spawn"}
      </button>

      {disabledReason && <p className="text-xs text-zinc-500 dark:text-zinc-400">{disabledReason}</p>}

      <TxStatus state={state} txHash={txHash} error={error} />
    </div>
  );
}
