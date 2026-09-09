"use client";

import { useCallback, useState } from "react";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

export type TxState = "idle" | "signing" | "confirming" | "confirmed" | "failed";

type Phase = "idle" | "signing" | "sent" | "signFailed";

/// Shared write+wait wrapper for every on-chain action task 13/14 add (grant/revoke roles,
/// key-writer delegation, spawn/promote/renew/revoke) — one place that turns a wagmi write into
/// pending/confirmed/failed status plus a human-readable revert reason, so every button in the
/// app reports tx state the same way (task 14: "every tx: pending / confirmed / failed status,
/// with an Etherscan hash link"). `state`/`error` are derived at render time from `phase` +
/// `useWaitForTransactionReceipt`'s own query state rather than mirrored into local state via an
/// effect, so there's nothing to keep in sync by hand.
export function useTxAction() {
  const { writeContractAsync, reset: resetWrite } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [signError, setSignError] = useState<string | null>(null);

  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const { state, error } = deriveState(phase, signError, {
    status: receipt.data?.status,
    isError: receipt.isError,
    error: receipt.error,
  });

  const send = useCallback(
    async (config: Parameters<typeof writeContractAsync>[0]) => {
      setPhase("signing");
      setSignError(null);
      try {
        const hash = await writeContractAsync(config);
        setTxHash(hash);
        setPhase("sent");
        return hash;
      } catch (err) {
        setPhase("signFailed");
        setSignError(describeError(err));
        throw err;
      }
    },
    [writeContractAsync]
  );

  const reset = useCallback(() => {
    setTxHash(undefined);
    setPhase("idle");
    setSignError(null);
    resetWrite();
  }, [resetWrite]);

  return { send, reset, state, txHash, error };
}

function deriveState(
  phase: Phase,
  signError: string | null,
  receipt: { status: "success" | "reverted" | undefined; isError: boolean; error: Error | null }
): { state: TxState; error: string | null } {
  if (phase === "idle") return { state: "idle", error: null };
  if (phase === "signing") return { state: "signing", error: null };
  if (phase === "signFailed") return { state: "failed", error: signError };

  // phase === "sent"
  if (receipt.status === "success") return { state: "confirmed", error: null };
  if (receipt.status === "reverted") return { state: "failed", error: "Transaction reverted on-chain" };
  if (receipt.isError) return { state: "failed", error: describeError(receipt.error) };
  return { state: "confirming", error: null };
}

/// Decodes a viem/wagmi write error down to the on-chain revert reason where possible — task
/// 13's "attempt privilege escalation" button needs the *real* contract error
/// (e.g. `AgentResolverUnauthorized(node, keyHash, account)`), not a generic RPC message.
export function describeError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason ?? "execution reverted";
      const args = revert.data?.args?.length ? `(${revert.data.args.join(", ")})` : "";
      return `${name}${args}`;
    }
    return err.shortMessage ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
