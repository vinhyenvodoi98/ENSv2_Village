"use client";

import { useAccount } from "wagmi";
import { agentResolverAbi } from "@/lib/contracts/abis";
import { useTxAction, type NamespaceNode } from "@/lib/ens";
import { truncateAddress } from "@/lib/format";
import { TxStatus } from "@/components/shared/TxStatus";

const TARGET_KEY = "agent.model";

/// Task 13's centerpiece demo: deliberately write an `AGENT_ADMIN`-gated key
/// (`AgentResolver._checkWrite`, task 05) as whatever wallet is currently connected — this is
/// meant to be clicked while connected as the agent's own key (`AGENT_SELF`, not
/// `AGENT_ADMIN`). Proves EACL is real, not CSS: the revert shown is the chain's own
/// `AgentResolverUnauthorized`, not a client-side check the UI made up.
export function EscalationButton({ node }: { node: NamespaceNode }) {
  const { address, isConnected } = useAccount();
  const { send, state, txHash, error } = useTxAction();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
      <p className="text-xs text-zinc-600 dark:text-zinc-300">
        Deliberately write <code className="font-mono">{TARGET_KEY}</code> (admin-gated) as whatever wallet is
        connected. Connect as the agent&apos;s own key and click — this reverts for real, with the exact on-chain
        reason.
      </p>
      <button
        type="button"
        disabled={!isConnected || state === "signing" || state === "confirming"}
        onClick={() =>
          send({
            address: node.resolver,
            abi: agentResolverAbi,
            functionName: "setText",
            args: [node.labelhash, TARGET_KEY, "pwned-by-demo"],
          }).catch(() => {})
        }
        className="w-fit rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
      >
        Attempt privilege escalation
      </button>
      {!isConnected && <p className="text-xs text-zinc-400">Connect a wallet first.</p>}
      <TxStatus state={state} txHash={txHash} error={error} />
      {state === "confirmed" && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Succeeded — {address ? truncateAddress(address) : "this wallet"} actually holds admin rights on this
          agent, so this wasn&apos;t an escalation after all.
        </p>
      )}
    </div>
  );
}
