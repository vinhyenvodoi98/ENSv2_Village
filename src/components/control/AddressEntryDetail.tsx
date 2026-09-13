"use client";

import Link from "next/link";
import { ensPath } from "@/lib/ens/name";
import type { OwnedEthName } from "@/lib/ens/useOwnedEthNames";
import { ExpiryCountdown } from "./ExpiryCountdown";
import { Field, Panel } from "./Panel";

/// Compact card for a clicked portfolio castle — an address is a portfolio, not a namespace (task
/// 33's routing decision), so this never tries to show a second name's full roles/registry-path
/// inline. Opening those is what the link at the bottom is for.
export function AddressEntryDetail({ owned }: { owned: OwnedEthName }) {
  return (
    <div className="h-full overflow-y-auto p-5 pt-14">
      <Panel title={owned.name} subtitle="One name this address currently owns">
        <dl>
          <Field label="Expiry" hint="ETHRegistry.getExpiry(tokenId)">
            <ExpiryCountdown expiry={owned.expiry} />
          </Field>
          <Field label="Token id" hint="ETHRegistry.getTokenId(labelhash)">
            <span className="font-mono text-xs break-all text-[#6b5636]">0x{owned.tokenId.toString(16)}</span>
          </Field>
        </dl>
        <Link
          href={ensPath(owned.name)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#c9a15a]/15 px-4 py-2 text-xs font-semibold tracking-wide text-[#3a2918] uppercase transition-colors hover:bg-[#c9a15a]/25"
        >
          Open its control panel →
        </Link>
      </Panel>
    </div>
  );
}
