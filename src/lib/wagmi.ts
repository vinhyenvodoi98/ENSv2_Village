import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

import { CONTRACTS } from "@/lib/contracts/addresses";

const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
if (!rpcUrl) {
  throw new Error(
    "NEXT_PUBLIC_SEPOLIA_RPC_URL is not set — see .env.example. The frontend never falls back " +
      "to a public/default RPC so every read demonstrably comes from the real Sepolia deployment."
  );
}

// Sepolia hosts two ENSv2 deployments side by side (task 30) — viem's built-in `sepolia` chain
// ships the *standard Beta* Universal Resolver address, which resolves nothing for names
// registered on the hackathon set. Overriding `contracts.ensUniversalResolver` here (exactly as
// the ENS docs' hackathon deployment snippet shows) is the only way viem's `getEnsAddress`/ENS
// helpers point at the right one; `CONTRACTS.universalResolver` itself comes from
// `deployments.json`, written by `Deploy.s.sol` from `contracts/deployments/hackathon.json`.
const hackathonSepolia = {
  ...sepolia,
  contracts: {
    ...sepolia.contracts,
    ensUniversalResolver: {
      address: CONTRACTS.universalResolver,
    },
  },
} as const;

export const wagmiConfig = createConfig({
  chains: [hackathonSepolia],
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
