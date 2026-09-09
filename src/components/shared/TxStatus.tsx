"use client";

import type { TxState } from "@/lib/ens";
import { explorerTxUrl } from "@/lib/explorer";

const LABEL: Record<TxState, string> = {
  idle: "",
  signing: "Waiting for signature…",
  confirming: "Confirming…",
  confirmed: "Confirmed",
  failed: "Failed",
};

const DOT: Record<TxState, string> = {
  idle: "",
  signing: "bg-amber-400 animate-pulse",
  confirming: "bg-amber-400 animate-pulse",
  confirmed: "bg-emerald-500",
  failed: "bg-red-500",
};

/// One tx-status pill, shared by every write flow task 13/14 add — pending / confirmed / failed
/// plus an Etherscan link, exactly what task 14 asks every tx to show.
export function TxStatus({
  state,
  txHash,
  error,
}: {
  state: TxState;
  txHash?: `0x${string}`;
  error?: string | null;
}) {
  if (state === "idle") return null;

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="inline-flex items-center gap-1.5">
        {DOT[state] && <span className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} aria-hidden />}
        <span className={state === "failed" ? "text-red-500" : "text-zinc-600 dark:text-zinc-300"}>{LABEL[state]}</span>
        {txHash && (
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">
            view tx ↗
          </a>
        )}
      </span>
      {error && <p className="max-w-xs break-words text-red-500">{error}</p>}
    </div>
  );
}
