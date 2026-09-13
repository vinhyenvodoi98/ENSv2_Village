"use client";

import Link from "next/link";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { AddressValue } from "./AddressValue";
import { NameSearchBox } from "./NameSearchBox";
import { TipCelebrationToast } from "@/components/tip/TipCelebrationToast";

/**
 * Full-bleed frame for the world-styled control panel (`/ens/[name]`, `/address/[addr]`) —
 * `WorldCanvas` fills the screen exactly like the `/` root does (`WorldRoot.tsx`'s own
 * `fixed inset-0` container). There is no no-name `/ens` landing page anymore — every route this
 * shell serves already has a name or address to render.
 *
 * `/` renders this same shell (the connected wallet's own names, as a portfolio of castles) rather
 * than a second bespoke frame — `showBackToWorld` only exists so that root doesn't draw a "Back to
 * the world" link pointing at itself.
 */
export function ControlPanelWorldShell({
  searchValue,
  showBackToWorld = true,
  children,
}: {
  searchValue?: string;
  showBackToWorld?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 h-dvh w-dvw overflow-hidden bg-[#0b1020] text-white">
      {children}
      <TipCelebrationToast />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-center gap-3 p-4">
        <Link
          href="/"
          className="pointer-events-auto rounded-sm border border-[#c9a15a]/60 bg-[#1c130a]/80 px-4 py-2 font-cinzel text-xs font-bold tracking-wide text-[#d9b66f] uppercase backdrop-blur transition-colors hover:bg-[#1c130a] hover:text-[#f3e6c8]"
        >
          ENS control panel
        </Link>
        <div className="pointer-events-auto flex min-w-0 max-w-md flex-1">
          <NameSearchBox initialValue={searchValue} />
        </div>
        <div className="pointer-events-auto">
          <ConnectWallet />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-4 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-[#c9a15a]/40 bg-[#1c130a]/80 px-4 py-2 text-xs text-[#ddcfb3]/60 backdrop-blur">
        <span>
          Reading the <span className="text-[#d9b66f]">{CONTRACTS.deployment}</span> ENSv2 deployment
        </span>
        <span className="pointer-events-auto flex items-center gap-1.5">
          RootRegistry <AddressValue address={CONTRACTS.rootRegistry} />
        </span>
        {showBackToWorld && (
          <Link href="/" className="pointer-events-auto underline decoration-[#c9a15a]/30 underline-offset-2 hover:text-[#f3e6c8]">
            Back to the world
          </Link>
        )}
      </div>
    </div>
  );
}
