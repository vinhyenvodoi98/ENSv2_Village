"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, parseEther, zeroAddress } from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import type { EnsNameState } from "@/lib/ens/useEnsName";
import { useResolve } from "@/lib/ens/useResolve";
import { useSendTip } from "@/lib/ens/useSendTip";
import { explorerTxUrl } from "@/lib/explorer";
import { truncateAddress } from "@/lib/format";
import { useWorldStore, type TipDeliveryTier } from "@/world/state/useWorldStore";

const TIP_OPTIONS = [
  { value: "0.001", tier: "messenger", icon: "🏹", title: "Forest messenger", copy: "Walks in from the woods and fires your tip arrow." },
  { value: "0.01", tier: "ballista", icon: "🛞", title: "Royal ballista", copy: "Rolls into range with a much bigger bow." },
  { value: "0.05", tier: "catapult", icon: "💥", title: "Golden catapult", copy: "Launches the grand delivery — and a shower of coins." },
] as const satisfies readonly { value: string; tier: TipDeliveryTier; icon: string; title: string; copy: string }[];

function tierForAmount(value: bigint): TipDeliveryTier {
  if (value >= parseEther("0.025")) return "catapult";
  if (value >= parseEther("0.005")) return "ballista";
  return "messenger";
}

export function TipExperience({ state, targetFortressId }: { state: EnsNameState; targetFortressId: string }) {
  const { address, isConnected, chainId } = useAccount();
  const owner = state.owner;
  const isOwnName = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  const canOfferTip = state.status === "registered" && !!owner && !isOwnName;
  const { data: resolution, isPending: isResolving, isError: resolutionFailed } = useResolve(canOfferTip ? state.name : undefined);
  const resolvedAddress = resolution?.address && resolution.address !== zeroAddress ? resolution.address : null;
  // A registered name can legitimately have no `addr` record yet. The current registry owner is
  // still an authoritative, on-chain recipient, so use it as an explicit fallback instead of
  // blocking a tip. Wait for resolution to finish first so an intentionally configured `addr`
  // record always takes precedence over ownership.
  const recipient = resolvedAddress ?? (!isResolving ? owner : null);
  const recipientSource = resolvedAddress ? "record" : recipient ? "owner" : null;
  const [open, setOpen] = useState(false);
  const closeDialog = useCallback(() => setOpen(false), []);

  if (!canOfferTip) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold tracking-wide text-amber-100 uppercase shadow-[0_0_18px_rgba(251,191,36,0.12)] transition hover:-translate-y-0.5 hover:bg-amber-400/20"
      >
        <span aria-hidden>🪙</span> Tip this kingdom
      </button>
      {open ? (
        <TipDialog
          name={state.name}
          recipient={recipient}
          recipientSource={recipientSource}
          targetFortressId={targetFortressId}
          isResolving={isResolving}
          resolutionFailed={resolutionFailed}
          isConnected={isConnected}
          chainId={chainId}
          onClose={closeDialog}
        />
      ) : null}
    </>
  );
}

function TipDialog({
  name,
  recipient,
  recipientSource,
  targetFortressId,
  isResolving,
  resolutionFailed,
  isConnected,
  chainId,
  onClose,
}: {
  name: string;
  recipient: `0x${string}` | null;
  recipientSource: "record" | "owner" | null;
  targetFortressId: string;
  isResolving: boolean;
  resolutionFailed: boolean;
  isConnected: boolean;
  chainId: number | undefined;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("0.01");
  const [custom, setCustom] = useState(false);
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { sendTip, state, txHash, error, reset } = useSendTip();
  const celebrateTip = useWorldStore((world) => world.celebrateTip);
  const selectFortress = useWorldStore((world) => world.selectFortress);
  const celebratedHash = useRef<`0x${string}` | null>(null);

  const parsedAmount = useMemo(() => {
    try {
      const value = parseEther(amount);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  }, [amount]);
  const tier = parsedAmount ? tierForAmount(parsedAmount) : "messenger";
  const busy = state === "signing" || state === "confirming";
  const wrongNetwork = isConnected && chainId !== sepolia.id;

  useEffect(() => {
    if (state !== "confirmed" || !txHash || celebratedHash.current === txHash) return;
    celebratedHash.current = txHash;
    celebrateTip({ targetFortressId, tier, amountEth: amount, recipientName: name });
    onClose();
    selectFortress(null);
  }, [state, txHash, celebrateTip, selectFortress, targetFortressId, tier, amount, name, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const selectPreset = (value: string) => {
    if (busy) return;
    reset();
    setCustom(false);
    setAmount(value);
  };

  const submit = async () => {
    if (!recipient || !parsedAmount || busy) return;
    try {
      await sendTip(recipient, parsedAmount);
    } catch {
      // The hook exposes a wallet-friendly error in the dialog.
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="tip-title">
      <button type="button" aria-label="Close tip dialog" onClick={busy ? undefined : onClose} className="absolute inset-0 bg-[#050814]/75 backdrop-blur-sm" />
      <section className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-amber-200/20 bg-[#11182a]/95 p-5 text-white shadow-[0_24px_90px_rgba(0,0,0,0.65)] motion-safe:animate-[chain-scan-in_180ms_ease-out] sm:p-7">
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30">✕</button>
        <p className="text-xs font-bold tracking-[0.24em] text-amber-300 uppercase">Send a royal tip</p>
        <h2 id="tip-title" className="mt-2 pr-10 font-serif text-2xl font-bold sm:text-3xl">Choose your delivery to {name}</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">The ETH goes to this name’s address record when one is set, otherwise to its current on-chain owner. The spectacle begins only after the transaction is confirmed.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {TIP_OPTIONS.map((option) => {
            const selected = !custom && amount === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={busy}
                onClick={() => selectPreset(option.value)}
                className={`rounded-2xl border p-4 text-left transition disabled:opacity-50 ${selected ? "border-amber-300/70 bg-amber-300/15 shadow-[0_0_28px_rgba(251,191,36,0.10)]" : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]"}`}
              >
                <span className="text-2xl" aria-hidden>{option.icon}</span>
                <span className="mt-3 block text-lg font-bold">{option.value} ETH</span>
                <span className="mt-1 block text-xs font-semibold text-amber-200/80">{option.title}</span>
                <span className="mt-2 block text-xs leading-5 text-white/45">{option.copy}</span>
              </button>
            );
          })}
        </div>

        <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 focus-within:border-amber-300/50">
          <input type="radio" checked={custom} onChange={() => { reset(); setCustom(true); }} disabled={busy} className="accent-amber-400" />
          <span className="text-xs font-bold tracking-wide text-white/60 uppercase">Custom</span>
          <input
            inputMode="decimal"
            value={custom ? amount : ""}
            placeholder="0.02"
            disabled={busy}
            onFocus={() => { if (!custom) { reset(); setCustom(true); setAmount(""); } }}
            onChange={(event) => { reset(); setCustom(true); setAmount(event.target.value); }}
            className="min-w-0 flex-1 bg-transparent text-right font-mono text-base outline-none placeholder:text-white/20"
            aria-label="Custom tip amount in ETH"
          />
          <span className="font-mono text-sm text-white/40">ETH</span>
        </label>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <div className="min-w-0 text-xs text-white/45">
            {isResolving ? (
              "Resolving recipient…"
            ) : recipient ? (
              <>
                To <span className="font-mono text-white/70">{truncateAddress(recipient)}</span>
                <span className="ml-1 text-white/35">({recipientSource === "record" ? "ENS address record" : "current ENS owner fallback"})</span>
              </>
            ) : resolutionFailed ? (
              "Could not resolve this name or read its owner."
            ) : (
              "No safe recipient is available for this name."
            )}
            {parsedAmount ? <span className="ml-2 text-amber-200/70">• {tier === "messenger" ? "messenger" : tier === "ballista" ? "ballista" : "catapult"} delivery</span> : null}
          </div>

          {!isConnected ? (
            <button type="button" disabled={isConnecting || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })} className={primaryButtonClass}>
              {isConnecting ? "Connecting…" : "Connect wallet"}
            </button>
          ) : wrongNetwork ? (
            <button type="button" disabled={isSwitching} onClick={() => switchChain({ chainId: sepolia.id })} className={primaryButtonClass}>
              {isSwitching ? "Switching…" : "Switch to Sepolia"}
            </button>
          ) : (
            <button type="button" disabled={!recipient || !parsedAmount || busy || state === "confirmed"} onClick={submit} className={primaryButtonClass}>
              {state === "signing" ? "Approve in wallet…" : state === "confirming" ? "Crossing the realm…" : state === "confirmed" ? "Tip delivered!" : `Send ${parsedAmount ? formatEther(parsedAmount) : "—"} ETH`}
            </button>
          )}
        </div>

        {state !== "idle" ? (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${state === "failed" ? "border-red-400/20 bg-red-500/10 text-red-200" : "border-amber-300/15 bg-amber-300/5 text-amber-100/70"}`}>
            {error ?? (state === "signing" ? "Waiting for your wallet signature." : state === "confirming" ? "Transaction sent. Waiting for confirmation…" : "Confirmed — watch the kingdom!")}
            {txHash ? <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="ml-2 underline underline-offset-2">View transaction ↗</a> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

const primaryButtonClass = "rounded-full border border-amber-200/30 bg-gradient-to-b from-amber-400 to-amber-600 px-5 py-2.5 text-sm font-black tracking-wide text-[#2b1b08] uppercase shadow-[0_3px_0_#744c0b] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0";
