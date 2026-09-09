"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

// Short staleTime so every chain-read hook (`src/lib/ens/`) treats data as fresh only briefly —
// combined with `useBlockNumber({ watch: true })` gating each query's key, this is what makes
// agent heartbeats show up on the UI within a block or two, no reload needed.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
