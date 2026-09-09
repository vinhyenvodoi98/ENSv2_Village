"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useAccount } from "wagmi";
import { agentRegistryAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { AGENT_TIERS, useTxAction, type AgentTier, type LocalWildcardAgent } from "@/lib/ens";
import { TxStatus } from "@/components/shared/TxStatus";

const LEASE_DURATION_SECONDS = 30n * 24n * 60n * 60n;

/// Task 14's spawn flow. `Wildcard` is the tier that makes the contrast the task wants visible:
/// no `AgentRegistry.spawn` call at all, just a locally-tracked label the parent still fully
/// controls (task 06 — wildcard resolution answers by rule for *any* label, nothing to mint).
/// Every other starting tier is a real `spawn` tx.
export function SpawnAgentForm({ onSpawnedLocally }: { onSpawnedLocally: (agent: LocalWildcardAgent) => void }) {
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

  const trimmedLabel = label.trim();
  const validAgentKey = tier === "Wildcard" || isAddress(agentKey);
  const canSubmit = trimmedLabel.length > 0 && !!connected && validAgentKey && (tier === "Wildcard" || agentKey.length > 0);

  async function submit() {
    if (!canSubmit || !connected) return;

    if (tier === "Wildcard") {
      onSpawnedLocally({
        label: trimmedLabel,
        owner: connected,
        agentKey: ((agentKey && isAddress(agentKey) ? agentKey : connected) as `0x${string}`),
        createdAt: Date.now(),
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
        address: CONTRACTS.agentRegistry,
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
      <h2 className="text-sm font-semibold">Spawn agent</h2>

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

      {tier === "Wildcard" ? (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
          <strong>0 gas, not yet on-chain</strong> — the parent has full control until this agent is minted for
          real. No transaction is sent.
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
        onClick={submit}
        className="w-fit rounded-md bg-black px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {tier === "Wildcard" ? "Spawn (free)" : "Spawn"}
      </button>

      <TxStatus state={state} txHash={txHash} error={error} />
    </div>
  );
}
