"use client";

import type { OwnedEthName } from "@/lib/ens";
import { ConnectWallet } from "./connect-wallet";

/**
 * Owns the wallet widget's own HUD slot. Kept separate from `WorldRoot` so
 * the top-right corner's layout (wallet above the dev-only debug panel) is
 * defined in one place instead of two ad-hoc `absolute right-4 top-4` divs
 * that happened to land on top of each other.
 *
 * Task 31's kingdom switcher: `ownedNames`/`selectedKingdom` are computed once
 * in `WorldRoot` (which already needs them for the tree/empty-state logic) and
 * passed down as plain props rather than re-fetched here — two independent
 * hook instances disagreeing about "whose kingdom is this" is exactly the
 * state-leak failure mode the task warns looks like a security bug in a demo.
 */
export function WalletHud({
  ownedNames,
  selectedKingdom,
  onSelectKingdom,
}: {
  ownedNames?: OwnedEthName[];
  selectedKingdom?: string | null;
  onSelectKingdom?: (name: string) => void;
}) {
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <ConnectWallet />
      {ownedNames && ownedNames.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 py-1 pl-3 pr-2 text-xs font-semibold text-white shadow-lg shadow-black/30 backdrop-blur">
          <span aria-hidden className="text-[#c9a15a]">
            ⚑
          </span>
          {ownedNames.length > 1 ? (
            <select
              value={selectedKingdom ?? ""}
              onChange={(e) => onSelectKingdom?.(e.target.value)}
              title="Switch kingdom"
              className="cursor-pointer bg-transparent font-mono text-xs font-semibold text-white focus:outline-none [&>option]:bg-zinc-900 [&>option]:font-normal"
            >
              {ownedNames.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-mono">{ownedNames[0].name}</span>
          )}
        </div>
      )}
    </div>
  );
}
