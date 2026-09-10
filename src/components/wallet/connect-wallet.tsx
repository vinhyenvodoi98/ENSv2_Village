"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected, chain, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (isConnected && address) {
    const networkName = chain?.name ?? (chainId ? `Chain ${chainId}` : "Unknown network");
    const isWrongNetwork = chainId !== sepolia.id;

    return (
      <div className="flex items-center gap-2 rounded-full bg-black/60 p-1 pl-3 text-white shadow-lg shadow-black/30 backdrop-blur">
        <span className="flex items-center gap-2 font-mono text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              isWrongNetwork
                ? "bg-red-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.7)]"
                : "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)]"
            }`}
          />
          {truncateAddress(address)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
            isWrongNetwork ? "bg-red-500/30 text-red-200" : "bg-white/10 text-white/80"
          }`}
        >
          {networkName}
        </span>
        {isWrongNetwork ? (
          <button
            onClick={() => switchChain({ chainId: sepolia.id })}
            disabled={isSwitching}
            className="rounded-full bg-red-500/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSwitching ? "Switching..." : "Switch to Sepolia"}
          </button>
        ) : null}
        <button
          onClick={() => disconnect()}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-white/20"
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
      className="flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 text-sm font-bold text-black shadow-lg shadow-orange-500/30 ring-1 ring-white/40 transition-transform hover:scale-105 hover:shadow-orange-500/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
      {isPending ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
