"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, parseEther, zeroAddress } from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import type { EnsNameState } from "@/lib/ens/useEnsName";
import { useResolve } from "@/lib/ens/useResolve";
import { useSendTip } from "@/lib/ens/useSendTip";
import { explorerTxUrl } from "@/lib/explorer";
import { truncateAddress } from "@/lib/format";
import { useWorldStore, type TipDeliveryTier, type TipUnitCounts } from "@/world/state/useWorldStore";

// Next replaces this at build time, so the preview controls and code path are removed from the
// production client bundle. A fake tip must never be reachable on a deployed build.
const TIP_PREVIEW_ENABLED = process.env.NODE_ENV === "development";
const MAX_FORMATION_SIZE = 12;
const UNIT_OPTIONS = [
  { tier: "messenger", icon: "🏹", title: "Archer", price: parseEther("0.001"), max: 12 },
  { tier: "ballista", icon: "🛞", title: "Ballista", price: parseEther("0.01"), max: 8 },
  { tier: "catapult", icon: "💥", title: "Catapult", price: parseEther("0.05"), max: 6 },
] as const satisfies readonly { tier: TipDeliveryTier; icon: string; title: string; price: bigint; max: number }[];

const INITIAL_UNITS: TipUnitCounts = { messenger: 1, ballista: 0, catapult: 0 };

function formationLabel(units: TipUnitCounts) {
  const labels = UNIT_OPTIONS.flatMap((option) => {
    const count = units[option.tier];
    return count > 0 ? [`${count} ${option.title}${count === 1 ? "" : "s"}`] : [];
  });
  return labels.join(" · ");
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
        className="rounded-sm border-2 border-[#c9a15a] bg-gradient-to-b from-[#f2e5c5] to-[#d8c08a] px-3 py-1.5 font-serif text-xs font-black tracking-[0.12em] text-[#3a2918] uppercase shadow-[0_3px_0_#69461f,0_8px_18px_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:shadow-[0_1px_0_#69461f]"
      >
        <span aria-hidden>⚔</span> Muster a tip
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
  const [units, setUnits] = useState<TipUnitCounts>(INITIAL_UNITS);
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { sendTip, state, txHash, error, reset } = useSendTip();
  const celebrateTip = useWorldStore((world) => world.celebrateTip);
  const selectFortress = useWorldStore((world) => world.selectFortress);
  const celebratedHash = useRef<`0x${string}` | null>(null);

  const totalUnits = units.messenger + units.ballista + units.catapult;
  const amountWei = UNIT_OPTIONS.reduce((total, option) => total + option.price * BigInt(units[option.tier]), 0n);
  const amount = formatEther(amountWei);
  const deliveryLabel = formationLabel(units);
  const busy = state === "signing" || state === "confirming";
  const wrongNetwork = isConnected && chainId !== sepolia.id;

  useEffect(() => {
    if (state !== "confirmed" || !txHash || celebratedHash.current === txHash) return;
    celebratedHash.current = txHash;
    celebrateTip({ targetFortressId, units, amountEth: amount, recipientName: name });
    onClose();
    selectFortress(null);
  }, [state, txHash, celebrateTip, selectFortress, targetFortressId, units, amount, name, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const adjustUnit = (tier: TipDeliveryTier, direction: -1 | 1) => {
    if (busy) return;
    reset();
    setUnits((current) => {
      const option = UNIT_OPTIONS.find((entry) => entry.tier === tier)!;
      const currentTotal = current.messenger + current.ballista + current.catapult;
      if (direction > 0 && (currentTotal >= MAX_FORMATION_SIZE || current[tier] >= option.max)) return current;
      if (direction < 0 && current[tier] <= 0) return current;
      return { ...current, [tier]: current[tier] + direction };
    });
  };

  const submit = async () => {
    if (!recipient || amountWei === 0n || busy) return;
    try {
      await sendTip(recipient, amountWei);
    } catch {
      // The hook exposes a wallet-friendly error in the dialog.
    }
  };

  const previewDelivery = () => {
    if (!TIP_PREVIEW_ENABLED || amountWei === 0n || busy) return;
    celebrateTip({
      targetFortressId,
      units,
      amountEth: amount,
      recipientName: name,
      simulated: true,
    });
    onClose();
    selectFortress(null);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="tip-title">
      <button type="button" aria-label="Close tip dialog" onClick={busy ? undefined : onClose} className="absolute inset-0 bg-[#090704]/80 backdrop-blur-[3px]" />
      <section className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-sm border-2 border-[#c8a15a] bg-[#e9dcc0] text-[#352719] shadow-[0_28px_100px_rgba(0,0,0,0.72),inset_0_0_0_4px_#5d4026,inset_0_0_45px_rgba(91,55,24,0.18)] motion-safe:animate-[chain-scan-in_180ms_ease-out]">
        <span className="pointer-events-none absolute left-2 top-2 z-10 size-5 border-l-2 border-t-2 border-[#d0aa62]" aria-hidden />
        <span className="pointer-events-none absolute right-2 top-2 z-10 size-5 border-r-2 border-t-2 border-[#d0aa62]" aria-hidden />
        <span className="pointer-events-none absolute bottom-2 left-2 z-10 size-5 border-b-2 border-l-2 border-[#9a7436]" aria-hidden />
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 size-5 border-b-2 border-r-2 border-[#9a7436]" aria-hidden />

        <header className="relative border-b-2 border-[#b58a45] bg-[linear-gradient(135deg,#2d251d_0%,#493621_52%,#251c15_100%)] px-6 py-5 text-[#f3e6c8] shadow-[inset_0_-5px_12px_rgba(0,0,0,0.25)] sm:px-8">
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-[#d1ae68]/40 bg-black/20 text-[#ead8b3]/70 transition hover:border-[#d1ae68] hover:bg-black/35 hover:text-white disabled:opacity-30">✕</button>
          <div className="flex items-center gap-4 pr-10">
            <div className="grid size-12 shrink-0 place-items-center border border-[#d1ae68]/70 bg-[#741f24] text-2xl shadow-[inset_0_0_0_2px_#321318,0_3px_8px_rgba(0,0,0,0.4)]" aria-hidden>♜</div>
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-[0.3em] text-[#d9b66f] uppercase">Royal war council</p>
              <h2 id="tip-title" className="mt-1 break-words font-serif text-2xl font-black tracking-wide sm:text-3xl">Muster aid for {name}</h2>
            </div>
          </div>
          <p className="mt-3 max-w-2xl font-serif text-sm leading-5 text-[#ddcfb3]/70">Choose your forces. Their individual levy is converted into ETH and sent to the kingdom only after your command is confirmed.</p>
        </header>

        <div className="p-5 sm:p-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="font-serif text-xs font-black tracking-[0.18em] text-[#755329] uppercase">I · Muster the company</p>
              <p className="mt-1 text-xs text-[#735f47]">Select up to {MAX_FORMATION_SIZE} units. The battlefield capacity keeps the 3D campaign smooth across devices.</p>
            </div>
            <p className="shrink-0 rounded-sm border border-[#98713b]/40 bg-[#d7c59f]/60 px-2 py-1 font-mono text-xs font-bold text-[#62451f]" title="Performance-safe battlefield capacity">♜ {totalUnits} / {MAX_FORMATION_SIZE}</p>
          </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {UNIT_OPTIONS.map((option) => {
            const count = units[option.tier];
            const cannotAdd = totalUnits >= MAX_FORMATION_SIZE || count >= option.max;
            return (
              <div key={option.tier} className={`relative overflow-hidden rounded-sm border-2 p-4 shadow-[0_3px_8px_rgba(62,40,18,0.14)] transition ${count > 0 ? "border-[#9b6c2f] bg-[#f4ead1] ring-2 ring-[#ba914f]/20" : "border-[#b8a27b] bg-[#dfd0ae]/65 hover:border-[#9b7849]"}`}>
                {count > 0 ? <span className="absolute right-0 top-0 border-b-[24px] border-l-[24px] border-b-transparent border-l-[#8a2630]" aria-hidden /> : null}
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-11 place-items-center rounded-full border border-[#a88046] bg-[#3e3023] text-2xl shadow-[inset_0_0_0_2px_#211912]" aria-hidden>{option.icon}</span>
                  <span className="border-b border-[#9c7b49] pb-0.5 font-mono text-[11px] font-bold text-[#704c22]">{formatEther(option.price)} ETH</span>
                </div>
                <p className="mt-3 font-serif text-base font-black tracking-wide text-[#352719]">{option.title}</p>
                <p className="mt-0.5 text-[10px] font-bold tracking-[0.16em] text-[#846946] uppercase">Per unit levy</p>
                <div className="mt-4 flex items-center justify-between rounded-sm border border-[#927044] bg-[#cdbb95]/55 p-1 shadow-inner">
                  <button
                    type="button"
                    aria-label={`Remove one ${option.title}`}
                    disabled={busy || count === 0}
                    onClick={() => adjustUnit(option.tier, -1)}
                    className="grid size-9 place-items-center rounded-sm border border-transparent font-serif text-xl font-black text-[#503820] transition hover:border-[#8f6c3f] hover:bg-[#eee2c8] disabled:cursor-not-allowed disabled:opacity-20"
                  >−</button>
                  <span className="min-w-9 text-center font-serif text-2xl font-black text-[#5f1e25]" aria-label={`${count} ${option.title}s selected`}>{count}</span>
                  <button
                    type="button"
                    aria-label={`Add one ${option.title}`}
                    disabled={busy || cannotAdd}
                    onClick={() => adjustUnit(option.tier, 1)}
                    className="grid size-9 place-items-center rounded-sm border border-[#69451f] bg-gradient-to-b from-[#a77a38] to-[#805624] font-serif text-xl font-black text-[#fff2d2] shadow-[0_2px_0_#4e3219] transition hover:brightness-110 active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-20"
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 border-y-2 border-[#a67b3c] bg-[linear-gradient(90deg,#37291d,#564022,#37291d)] px-4 py-3 text-[#f2e3c1] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" aria-live="polite">
          <div className="min-w-0">
            <p className="font-serif text-[10px] font-black tracking-[0.22em] text-[#d6b36c] uppercase">II · Royal muster</p>
            <p className="mt-1 truncate font-serif text-sm text-[#f2e3c1]/85">{deliveryLabel || "Choose at least one unit"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-2xl font-black text-[#f2cb73]">{amount} <span className="text-sm">ETH</span></p>
            <p className="text-[9px] font-black tracking-[0.18em] text-[#d9c7a3]/55 uppercase">Total tribute</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 text-xs leading-5 text-[#735f47]">
            {isResolving ? (
              "Resolving recipient…"
            ) : recipient ? (
              <>
                Treasury: <span className="font-mono font-bold text-[#4b3420]">{truncateAddress(recipient)}</span>
                <span className="ml-1 text-[#8a755b]">({recipientSource === "record" ? "ENS record" : "current owner"})</span>
              </>
            ) : resolutionFailed ? (
              "Could not resolve this name or read its owner."
            ) : (
              "No safe recipient is available for this name."
            )}
            {totalUnits > 0 ? <span className="ml-2 font-semibold text-[#7a5629]">• random campaign route</span> : null}
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
            <button type="button" disabled={!recipient || totalUnits === 0 || busy || state === "confirmed"} onClick={submit} className={primaryButtonClass}>
              {state === "signing" ? "Approve in wallet…" : state === "confirming" ? "Crossing the realm…" : state === "confirmed" ? "Tip delivered!" : `Send ${amount} ETH`}
            </button>
          )}
        </div>

        {state !== "idle" ? (
          <div className={`mt-4 rounded-sm border px-3 py-2 text-xs ${state === "failed" ? "border-[#9e4242] bg-[#8a2630]/10 text-[#7a1f28]" : "border-[#9c7a48] bg-[#d5c39f]/45 text-[#654923]"}`}>
            {error ?? (state === "signing" ? "Waiting for your wallet signature." : state === "confirming" ? "Transaction sent. Waiting for confirmation…" : "Confirmed — watch the kingdom!")}
            {txHash ? <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="ml-2 underline underline-offset-2">View transaction ↗</a> : null}
          </div>
        ) : null}

        {TIP_PREVIEW_ENABLED ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-dashed border-[#8c704b] bg-[#d5c39f]/35 px-4 py-3">
            <div>
              <p className="font-serif text-xs font-black tracking-[0.18em] text-[#5d4225] uppercase">Scribe&apos;s rehearsal · development only</p>
              <p className="mt-1 text-xs text-[#806c52]">Preview the campaign without opening a wallet or sending ETH.</p>
            </div>
            <button
              type="button"
              disabled={busy || totalUnits === 0}
              onClick={previewDelivery}
              className="rounded-sm border border-[#765329] bg-[#efe2c5] px-4 py-2 font-serif text-xs font-black tracking-wide text-[#4a331d] uppercase shadow-[0_2px_0_#806039] transition hover:-translate-y-0.5 hover:bg-[#f7ecd5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              Preview campaign
            </button>
          </div>
        ) : null}
        </div>
      </section>
    </div>
  );
}

const primaryButtonClass = "rounded-sm border-2 border-[#c39a50] bg-gradient-to-b from-[#8d2932] to-[#641c23] px-5 py-2.5 font-serif text-sm font-black tracking-[0.1em] text-[#fff0cf] uppercase shadow-[0_3px_0_#3d1418,0_7px_16px_rgba(62,24,19,0.24)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:shadow-[0_1px_0_#3d1418] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0";
