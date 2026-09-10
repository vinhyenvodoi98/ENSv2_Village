"use client";

import { useState } from "react";
import { CONTRACTS } from "@/lib/contracts/addresses";

export type EmptyStateKind = "not-connected" | "no-name" | "no-agents";

/// Task 31: replaces task 29's single sidebar "no agents yet" line with three distinct messages,
/// rendered as a centered plate — this is a new user's first screen, the landing page, not a
/// footnote tucked in a corner. The RPC-error state is deliberately *not* one of `kind` here: it
/// stays the existing sidebar red banner so it can never be mistaken for "you own no name."
export function KingdomEmptyPlate({
  kind,
  isWrongNetwork,
  isSwitchingNetwork,
  isKingdomUnfinished,
  onConnect,
  onSwitchNetwork,
  onClaimLand,
  onSpawnFirst,
  onFoundKingdom,
}: {
  kind: EmptyStateKind;
  isWrongNetwork: boolean;
  isSwitchingNetwork?: boolean;
  /// Task 32: the owned kingdom has no `AgentRegistry` wired yet — "no-agents" reads as "found
  /// your kingdom" instead of "spawn the first agent", since there's nowhere to spawn into yet.
  isKingdomUnfinished?: boolean;
  onConnect: () => void;
  onSwitchNetwork: () => void;
  onClaimLand: () => void;
  onSpawnFirst: () => void;
  onFoundKingdom: () => void;
}) {
  const showcaseHref = `?kingdom=${CONTRACTS.parentName}`;
  // Dismissible so the castle behind it (which the plate visually sits right on top of, at the
  // world origin) stays reachable — clicking it opens the same root-spawn form this plate's own
  // CTA does. Local state, reset by `WorldRoot` remounting this component (via `key={kind}`)
  // whenever the underlying situation actually changes.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center p-4">
      <div className="pointer-events-auto relative flex w-full max-w-sm flex-col items-center gap-3 rounded-sm border-2 border-[#c9a15a] bg-[#ece1c8] px-6 py-8 text-center shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Close"
          className="absolute -right-2 -top-2 rounded-full border border-[#c9a15a] bg-zinc-900 p-1 text-xs leading-none text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          ✕
        </button>

        {kind === "not-connected" && (
          <>
            <h2 className="font-serif text-lg font-bold uppercase tracking-wide text-[#3a2f22]">
              No kingdom, yet
            </h2>
            <p className="text-sm text-[#5c4b32]">Connect a wallet to see your kingdom.</p>
            {isWrongNetwork ? (
              <button type="button" onClick={onSwitchNetwork} disabled={isSwitchingNetwork} className={ctaClass}>
                {isSwitchingNetwork ? "Switching…" : "Switch to Sepolia"}
              </button>
            ) : (
              <button type="button" onClick={onConnect} className={ctaClass}>
                Connect wallet
              </button>
            )}
          </>
        )}

        {kind === "no-name" && (
          <>
            <h2 className="font-serif text-lg font-bold uppercase tracking-wide text-[#3a2f22]">
              You own no land yet
            </h2>
            <p className="text-sm text-[#5c4b32]">
              This wallet owns no ENSv2 name on the hackathon deployment.
            </p>
            {isWrongNetwork ? (
              <button type="button" onClick={onSwitchNetwork} disabled={isSwitchingNetwork} className={ctaClass}>
                {isSwitchingNetwork ? "Switching…" : "Switch to Sepolia"}
              </button>
            ) : (
              <button type="button" onClick={onClaimLand} className={ctaClass}>
                Claim land
              </button>
            )}
          </>
        )}

        {kind === "no-agents" && isKingdomUnfinished && (
          <>
            <h2 className="font-serif text-lg font-bold uppercase tracking-wide text-[#3a2f22]">
              Your land is claimed, unfinished
            </h2>
            <p className="text-sm text-[#5c4b32]">
              No agent registry wired yet — found your kingdom before spawning agents.
            </p>
            <button type="button" onClick={onFoundKingdom} className={ctaClass}>
              Found your kingdom
            </button>
          </>
        )}

        {kind === "no-agents" && !isKingdomUnfinished && (
          <>
            <h2 className="font-serif text-lg font-bold uppercase tracking-wide text-[#3a2f22]">
              Kingdom founded, no agents yet
            </h2>
            <p className="text-sm text-[#5c4b32]">Your castle stands. Spawn your first agent under it.</p>
            <button type="button" onClick={onSpawnFirst} className={ctaClass}>
              Spawn the first agent
            </button>
          </>
        )}

        <a href={showcaseHref} className="text-xs text-[#8f7652] underline hover:text-[#6b5d45]">
          View the showcase kingdom
        </a>
      </div>
    </div>
  );
}

const ctaClass = [
  "w-fit rounded-sm border-2 px-5 py-1.5 font-serif text-sm font-bold uppercase tracking-wide",
  "transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-[2px]",
  "border-[#c9a15a] bg-gradient-to-b from-[#8e1f2b] to-[#4c0f16] text-[#f3e6c8]",
  "shadow-[0_3px_0_0_#3d0d13] active:shadow-[0_1px_0_0_#3d0d13]",
].join(" ");
