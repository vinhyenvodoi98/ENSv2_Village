"use client";

import Link from "next/link";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { AddressValue } from "./AddressValue";
import { NameSearchBox } from "./NameSearchBox";
import { ConnectWallet } from "@/components/wallet/connect-wallet";

/// The frame every control-panel route renders inside: the search box that gets you to a name, the
/// wallet whose roles decide what you may do to it, and a footer stating which of Sepolia's two
/// side-by-side ENSv2 deployments (task 30) is being read. Tasks 34–38 add panels to the page body;
/// none of them needs to touch this.
export function ControlPanelShell({
  breadcrumb,
  searchValue,
  children,
}: {
  breadcrumb?: React.ReactNode;
  searchValue?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex-1 bg-[#0b1020] text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1020]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-5 py-3">
          <Link
            href="/ens"
            className="text-sm font-semibold tracking-wide text-white/80 uppercase transition-colors hover:text-white"
          >
            ENS control panel
          </Link>
          <NameSearchBox initialValue={searchValue} />
          <ConnectWallet />
        </div>
        {breadcrumb ? (
          <div className="mx-auto max-w-5xl px-5 pb-3 font-mono text-xs text-white/40">{breadcrumb}</div>
        ) : null}
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-8 text-xs text-white/35">
        <span>
          Reading the <span className="text-white/60">{CONTRACTS.deployment}</span> ENSv2 deployment on chain{" "}
          {CONTRACTS.chainId}
        </span>
        <span className="flex items-center gap-1.5">
          RootRegistry <AddressValue address={CONTRACTS.rootRegistry} />
        </span>
        <span className="flex items-center gap-1.5">
          UniversalResolver <AddressValue address={CONTRACTS.universalResolver} />
        </span>
        <Link href="/" className="underline decoration-white/20 underline-offset-2 hover:text-white/60">
          Back to the world
        </Link>
      </footer>
    </div>
  );
}
