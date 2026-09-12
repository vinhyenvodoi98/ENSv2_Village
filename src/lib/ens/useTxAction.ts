"use client";

import { useCallback, useState } from "react";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { useAccount, useDeployContract, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

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
  const publicClient = usePublicClient();
  const { address } = useAccount();
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
      // Simulate first: a call that would revert on-chain otherwise reaches the wallet, which
      // asks its own RPC for `eth_estimateGas`/fee data on a doomed call and — depending on
      // wallet/version — surfaces that as an opaque "Unable to estimate network fee" instead of
      // the actual revert reason. Catching it here via `publicClient` (the app's own RPC, already
      // relied on everywhere else) turns that into the same decoded `describeError` message every
      // other failure in this hook produces, and never opens the wallet for a tx that can't land.
      if (publicClient && address) {
        try {
          const { address: to, abi, functionName, args, value } = config;
          await publicClient.simulateContract({ address: to, abi, functionName, args, value, account: address } as Parameters<
            typeof publicClient.simulateContract
          >[0]);
        } catch (err) {
          setPhase("signFailed");
          setSignError(describeError(err));
          throw err;
        }
      }
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
    [writeContractAsync, publicClient, address]
  );

  const reset = useCallback(() => {
    setTxHash(undefined);
    setPhase("idle");
    setSignError(null);
    resetWrite();
  }, [resetWrite]);

  return { send, reset, state, txHash, error };
}

/// Task 32's found-a-kingdom flow deploys its own contracts (`AgentRegistry`,
/// `WildcardStateStore`, `WildcardResolver`) straight from the connected wallet — `useTxAction`
/// can't cover that (it's built on `useWriteContract`, which calls an existing address, not
/// `useDeployContract`). Same status shape as `useTxAction` so `<TxStatus>` and the rest of the
/// disabled/reason plumbing work unchanged; the one addition is `contractAddress`, read off the
/// deployment receipt once it confirms.
export function useDeployAction() {
  const { deployContractAsync } = useDeployContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [signError, setSignError] = useState<string | null>(null);

  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const { state, error } = deriveState(phase, signError, {
    status: receipt.data?.status,
    isError: receipt.isError,
    error: receipt.error,
  });

  const deploy = useCallback(
    async (config: Parameters<typeof deployContractAsync>[0]) => {
      setPhase("signing");
      setSignError(null);
      try {
        const hash = await deployContractAsync(config);
        setTxHash(hash);
        setPhase("sent");
        return hash;
      } catch (err) {
        setPhase("signFailed");
        setSignError(describeError(err));
        throw err;
      }
    },
    [deployContractAsync]
  );

  const reset = useCallback(() => {
    setTxHash(undefined);
    setPhase("idle");
    setSignError(null);
  }, []);

  return { deploy, reset, state, txHash, error, contractAddress: receipt.data?.contractAddress ?? null };
}

/// Recovers a deployed contract's address from a **persisted** tx hash — the piece
/// `useDeployAction` alone can't do after a reload, since a fresh instance's own `txHash` state
/// starts at `undefined` and knows nothing about a deploy sent in an earlier session. Mirrors task
/// 31's commit-recovery pattern: the hash is the durable record, the address is always
/// re-derived from its receipt rather than cached separately.
export function useDeployedContractAddress(txHash: `0x${string}` | undefined) {
  const receipt = useWaitForTransactionReceipt({ hash: txHash });
  return { address: receipt.data?.contractAddress ?? null, isLoading: receipt.isLoading, isError: receipt.isError };
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
