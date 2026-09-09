import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
if (!rpcUrl) {
  throw new Error(
    "NEXT_PUBLIC_SEPOLIA_RPC_URL is not set — see .env.example. The frontend never falls back " +
      "to a public/default RPC so every read demonstrably comes from the real Sepolia deployment."
  );
}

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(rpcUrl),
  },
  // Short block-polling interval so new blocks (and the agent heartbeats they carry) reach the
  // UI quickly — `useBlockNumber({ watch: true })` in `src/lib/ens/query.ts` rides this to
  // auto-refresh every read hook without a manual reload.
  pollingInterval: 4_000,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
