"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ensPath } from "@/lib/ens/name";
import { useOwnedEthNames } from "@/lib/ens/useOwnedEthNames";
import { useReverseName } from "@/lib/ens/useReverseName";
import { explorerAddressUrl } from "@/lib/explorer";
import { formatAbsoluteTime, formatDuration } from "@/lib/format";
import { useNowTicker } from "@/lib/useNowTicker";
import { ControlPanelShell } from "./ControlPanelShell";
import { Panel } from "./Panel";

/// `/address/[addr]` — an **index**, not a detail page. An address is a portfolio: it holds names
/// today and may hold different ones tomorrow, so nothing here is presented as a property *of* the
/// address. Every row links into `/ens/[name]`, where the name's own state actually lives.
export function AddressPortfolio({ address }: { address: `0x${string}` }) {
  const { address: connected } = useAccount();
  const { data: names, isPending, isError, error } = useOwnedEthNames(address);
  const { data: reverse } = useReverseName(address);
  const now = useNowTicker(10_000);

  const isSelf = !!connected && connected.toLowerCase() === address.toLowerCase();

  // Same reason as elsewhere: the block-gated query keeps the previously-viewed address's names on
  // screen while this one loads, and a list of someone else's names under this address is worse than
  // a spinner. Every row carries its re-verified `owner`, so the check is exact.
  const isStale = !!names && names.some((owned) => owned.owner.toLowerCase() !== address.toLowerCase());

  return (
    <ControlPanelShell searchValue={address} breadcrumb={<span>/address/{address}</span>}>
      <div className="space-y-4">
        <Panel
          title="Address"
          subtitle={<code>ETHRegistry.getOwner / getExpiry / getStatus</code>}
          actions={
            isSelf ? (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-200 uppercase">
                connected wallet
              </span>
            ) : null
          }
        >
          <a
            href={explorerAddressUrl(address)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm break-all text-sky-300 underline decoration-sky-300/30 underline-offset-2 hover:text-sky-200"
          >
            {address}
          </a>
          <p className="mt-2 text-sm text-white/50">
            {reverse ? (
              <>
                Primary name{" "}
                <Link
                  href={ensPath(reverse.name)}
                  className="font-mono text-white/80 underline decoration-white/20 underline-offset-2 hover:text-white"
                >
                  {reverse.name}
                </Link>{" "}
                <span className="text-xs text-white/30">(coinType {reverse.coinType.toString()})</span>
              </>
            ) : (
              "No reverse record set, so this address has no primary name to redirect to."
            )}
          </p>
        </Panel>

        <Panel
          title="Names owned"
          subtitle="Registered through this deployment's ETHRegistrar, re-verified against the registry"
          actions={
            names ? (
              <span className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-white/60">{names.length}</span>
            ) : null
          }
        >
          {isError ? (
            <p className="text-sm text-red-300">{error?.message ?? "Could not read the registry."}</p>
          ) : isPending || !names || isStale ? (
            <p className="text-sm text-white/40">Reading the registry…</p>
          ) : names.length === 0 ? (
            <p className="text-sm text-white/50">
              This address owns no <code>.eth</code> name on this deployment right now.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {names.map((owned) => {
                const secondsLeft = Number(owned.expiry) - Math.floor(now / 1000);
                return (
                  <li key={owned.tokenId.toString()} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <Link
                      href={ensPath(owned.name)}
                      className="font-mono text-sm text-white underline decoration-white/20 underline-offset-2 hover:decoration-white"
                    >
                      {owned.name}
                    </Link>
                    <span className="flex items-baseline gap-3 text-xs">
                      <span
                        className={`font-mono tabular-nums ${secondsLeft <= 0 ? "text-red-300" : "text-white/60"}`}
                        title={formatAbsoluteTime(owned.expiry)}
                      >
                        {secondsLeft <= 0 ? "expired" : `expires in ${formatDuration(secondsLeft)}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </ControlPanelShell>
  );
}
