"use client";

import { zeroAddress } from "viem";
import { explorerAddressUrl } from "@/lib/explorer";
import { truncateAddress } from "@/lib/format";

/// One on-chain address, as the control panel always shows them: monospace, truncated, and linked
/// out to the block explorer so every claim on screen can be checked against Etherscan in one
/// click (`src/lib/explorer.ts`, which takes the chain from `deployments.json`).
///
/// `address(0)` is rendered as an explicit "not set" rather than as a link to the zero address —
/// for `resolver` and `subregistry` that value is the whole reason tasks 34 and 36 exist, so it has
/// to read as a state, not as an address that happens to be all zeroes.
export function AddressValue({
  address,
  notSetLabel = "not set",
  full = false,
}: {
  address: `0x${string}` | null | undefined;
  notSetLabel?: string;
  full?: boolean;
}) {
  if (!address || address === zeroAddress) {
    return <span className="font-mono text-sm text-white/35 italic">{notSetLabel}</span>;
  }

  return (
    <a
      href={explorerAddressUrl(address)}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="font-mono text-sm text-sky-300 underline decoration-sky-300/30 underline-offset-2 transition-colors hover:text-sky-200 hover:decoration-sky-200"
    >
      {full ? address : truncateAddress(address)}
    </a>
  );
}
