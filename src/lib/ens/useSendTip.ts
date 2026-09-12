"use client";

import { useCallback, useState } from "react";
import { useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { describeError, type TxState } from "./useTxAction";

type Phase = "idle" | "signing" | "sent" | "signFailed";

/** Native-ETH counterpart to useTxAction, kept separate because this is not a contract write. */
export function useSendTip() {
  const { sendTransactionAsync, reset: resetSend } = useSendTransaction();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const receipt = useWaitForTransactionReceipt({ hash });

  let state: TxState = "idle";
  let error: string | null = null;
  if (phase === "signing") state = "signing";
  if (phase === "signFailed") {
    state = "failed";
    error = sendError;
  }
  if (phase === "sent") {
    state = receipt.data?.status === "success" ? "confirmed" : receipt.data?.status === "reverted" || receipt.isError ? "failed" : "confirming";
    error = receipt.data?.status === "reverted" ? "Transaction reverted on-chain" : receipt.isError ? describeError(receipt.error) : null;
  }

  const sendTip = useCallback(async (to: `0x${string}`, value: bigint) => {
    setPhase("signing");
    setSendError(null);
    try {
      const nextHash = await sendTransactionAsync({ to, value });
      setHash(nextHash);
      setPhase("sent");
      return nextHash;
    } catch (cause) {
      setSendError(describeError(cause));
      setPhase("signFailed");
      throw cause;
    }
  }, [sendTransactionAsync]);

  const reset = useCallback(() => {
    setHash(undefined);
    setPhase("idle");
    setSendError(null);
    resetSend();
  }, [resetSend]);

  return { sendTip, reset, state, txHash: hash, error };
}
