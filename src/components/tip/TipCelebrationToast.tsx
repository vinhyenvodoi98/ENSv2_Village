"use client";

import { useWorldStore } from "@/world/state/useWorldStore";

export function TipCelebrationToast() {
  const tip = useWorldStore((state) => state.tipCelebration);
  if (!tip) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-4" role="status" aria-live="polite">
      <div className="rounded-full border border-amber-200/30 bg-[#241807]/80 px-5 py-2.5 text-center text-sm font-bold text-amber-100 shadow-[0_8px_35px_rgba(0,0,0,0.35)] backdrop-blur motion-safe:animate-[chain-scan-in_180ms_ease-out]">
        <span aria-hidden>🪙</span> {tip.amountEth} ETH is arriving at <span className="font-mono">{tip.recipientName}</span>!
      </div>
    </div>
  );
}
