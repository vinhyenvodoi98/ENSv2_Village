"use client";

import { ConnectWallet } from "./connect-wallet";

/**
 * Owns the wallet widget's own HUD slot. Kept separate from `WorldRoot` so
 * the top-right corner's layout (wallet above the dev-only debug panel) is
 * defined in one place instead of two ad-hoc `absolute right-4 top-4` divs
 * that happened to land on top of each other.
 */
export function WalletHud() {
  return (
    <div className="pointer-events-auto">
      <ConnectWallet />
    </div>
  );
}
