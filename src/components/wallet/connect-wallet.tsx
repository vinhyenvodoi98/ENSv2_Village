"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-black/[.06] px-4 py-2 font-mono text-sm dark:bg-white/[.08]">
          {truncateAddress(address)}
        </span>
        <button
          onClick={() => disconnect()}
          className="rounded-full border border-solid border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const connector = connectors[0];

  return (
    <button
      onClick={() => connector && connect({ connector })}
      disabled={!connector || isPending}
      className="flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
    >
      {isPending ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
