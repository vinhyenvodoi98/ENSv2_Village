import { CONTRACTS } from "@/lib/contracts/addresses";

const EXPLORER_BASE_BY_CHAIN: Record<number, string> = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
};

/// Etherscan link for one tx hash, on whatever chain `deployments.json` says we're deployed to
/// — task 12 wants this on every timeline entry as "proof against accusations of hardcoding".
export function explorerTxUrl(txHash: string): string {
  const base = EXPLORER_BASE_BY_CHAIN[CONTRACTS.chainId] ?? EXPLORER_BASE_BY_CHAIN[11155111];
  return `${base}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  const base = EXPLORER_BASE_BY_CHAIN[CONTRACTS.chainId] ?? EXPLORER_BASE_BY_CHAIN[11155111];
  return `${base}/address/${address}`;
}
