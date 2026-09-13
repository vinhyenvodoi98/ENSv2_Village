"use client";

import { useWorldStore } from "@/world/state/useWorldStore";

export function TipCelebrationToast() {
  const tip = useWorldStore((state) => state.tipCelebration);
  if (!tip) return null;
  const formation = [
    tip.units.messenger > 0 ? `${tip.units.messenger} archer${tip.units.messenger === 1 ? "" : "s"}` : null,
    tip.units.ballista > 0 ? `${tip.units.ballista} ballista${tip.units.ballista === 1 ? "" : "s"}` : null,
    tip.units.catapult > 0 ? `${tip.units.catapult} catapult${tip.units.catapult === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-4" role="status" aria-live="polite">
      <div className="rounded-full border border-amber-200/30 bg-[#241807]/80 px-5 py-2.5 text-center text-sm font-bold text-amber-100 shadow-[0_8px_35px_rgba(0,0,0,0.35)] backdrop-blur motion-safe:animate-[chain-scan-in_180ms_ease-out]">
        {tip.simulated ? (
          <>
            <span className="mr-2 rounded-full bg-sky-300/15 px-2 py-1 text-[10px] tracking-[0.14em] text-sky-200 uppercase">Dev preview</span>
            <span aria-hidden>🪙</span> Previewing {formation} surrounding <span className="font-mono">{tip.recipientName}</span>
          </>
        ) : (
          <><span aria-hidden>🪙</span> {formation} are delivering {tip.amountEth} ETH to <span className="font-mono">{tip.recipientName}</span>!</>
        )}
      </div>
    </div>
  );
}
