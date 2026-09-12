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
      <div className="flex items-center gap-2 rounded-sm border-2 border-[#c9a15a] bg-[#ece1c8] p-1 pl-3 shadow-[0_3px_0_0_#5c4b32]">
        <span className="flex items-center gap-2 font-serif text-sm text-[#3a2f22]">
          <span
            className={`h-2 w-2 rounded-full ${
              isWrongNetwork
                ? "bg-red-700 shadow-[0_0_6px_2px_rgba(140,20,20,0.5)]"
                : "bg-emerald-700 shadow-[0_0_6px_2px_rgba(6,95,70,0.5)]"
            }`}
          />
          {truncateAddress(address)}
        </span>
        <span
          className={`rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
            isWrongNetwork ? "bg-red-900/20 text-red-900" : "bg-[#c9a15a]/30 text-[#5c4b32]"
          }`}
        >
          {networkName}
        </span>
        {isWrongNetwork ? (
          <button onClick={() => switchChain({ chainId: sepolia.id })} disabled={isSwitching} className={ctaClass}>
            {isSwitching ? "Switching..." : "Switch to Sepolia"}
          </button>
        ) : null}
        <button
          onClick={() => disconnect()}
          className="rounded-sm border-2 border-[#c9a15a] bg-[#ece1c8] px-3 py-1.5 font-serif text-xs font-bold uppercase tracking-wide text-[#3a2f22] transition-colors hover:bg-[#dccb9e]"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const connector = connectors[0];

  return (
    <button onClick={() => connector && connect({ connector })} disabled={!connector || isPending} className={ctaClass}>
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

const ctaClass = [
  "flex h-11 items-center justify-center gap-2 rounded-sm border-2 px-5 font-serif text-sm font-bold uppercase tracking-wide",
  "transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-[2px]",
  "border-[#c9a15a] bg-gradient-to-b from-[#8e1f2b] to-[#4c0f16] text-[#f3e6c8]",
  "shadow-[0_3px_0_0_#3d0d13] active:shadow-[0_1px_0_0_#3d0d13]",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
].join(" ");
