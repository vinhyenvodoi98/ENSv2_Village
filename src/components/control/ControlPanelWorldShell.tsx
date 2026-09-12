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
 * `fixed inset-0` container), with the same search box, wallet and deployment footer as the flat
 * shell (`ControlPanelShell.tsx`) floated over it instead of laid out in a scrolling page.
 * `ControlPanelShell` itself stays in place for `/ens` (the no-name landing page), which has no
 * castle to render and is still a normal scrolling page.
 *
 * `/` renders this same shell (the connected wallet's own names, as a portfolio of castles) rather
 * than a fourth bespoke frame — `showBackToWorld` only exists so that root doesn't draw a "Back to
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
          href="/ens"
          className="pointer-events-auto rounded-full bg-black/60 px-4 py-2 text-sm font-semibold tracking-wide text-white/80 uppercase backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
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

      <div className="pointer-events-none absolute bottom-6 left-4 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full bg-black/50 px-4 py-2 text-xs text-white/50 backdrop-blur">
        <span>
          Reading the <span className="text-white/70">{CONTRACTS.deployment}</span> ENSv2 deployment
        </span>
        <span className="pointer-events-auto flex items-center gap-1.5">
          RootRegistry <AddressValue address={CONTRACTS.rootRegistry} />
        </span>
        {showBackToWorld && (
          <Link href="/" className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white/70">
            Back to the world
          </Link>
        )}
      </div>
    </div>
  );
}
