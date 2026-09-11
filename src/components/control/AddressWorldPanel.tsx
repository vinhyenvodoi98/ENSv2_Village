"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { ensPath } from "@/lib/ens/name";
import { useOwnedEthNames, type OwnedEthName } from "@/lib/ens/useOwnedEthNames";
import { useReverseName } from "@/lib/ens/useReverseName";
import { explorerAddressUrl } from "@/lib/explorer";
import { createPortfolioFortressSource } from "@/world/adapters/ensControlWorldSource";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectSelectedFortressId } from "@/world/state/selectors";
import { BuildBar } from "@/world/ui/BuildBar";
import { AddressEntryDetail } from "./AddressEntryDetail";
import { ControlPanelWorldShell } from "./ControlPanelWorldShell";
import { Panel } from "./Panel";
import { WorldDetailPanel } from "./WorldDetailPanel";

const WorldCanvas = dynamic(() => import("@/world/components/Scene/WorldCanvas").then((mod) => mod.WorldCanvas), {
  ssr: false,
});

/// `/address/[addr]`, redesigned onto the same map (task 34): one castle per name this address
/// owns, scattered with no hierarchy between them — an address is a portfolio, not a namespace
/// (task 33's routing decision), so there is deliberately no "address castle" at the center the way
/// `/ens/[name]` has one. Clicking a castle opens the same read-only summary the flat page showed;
/// the full state for that name lives one click further, at its own `/ens/[name]`.
export function AddressWorldPanel({ address }: { address: `0x${string}` }) {
  const { address: connected } = useAccount();
  const { data: names, isPending, isError, error } = useOwnedEthNames(address);
  const { data: reverse } = useReverseName(address);
  const isSelf = !!connected && connected.toLowerCase() === address.toLowerCase();

  // Same reasoning as task 33's flat version: a block-gated query can hand back the *previous*
  // address's names while this one loads, and a list of someone else's names under this address is
  // worse than a spinner. Every row carries its re-verified `owner`, so the check is exact.
  const isStale = !!names && names.some((owned) => owned.owner.toLowerCase() !== address.toLowerCase());
  const resolvedNames = isStale ? undefined : names;

  const setMode = useWorldStore((store) => store.setMode);
  const syncFortresses = useWorldStore((store) => store.syncFortressesFromEns);
  const selectFortress = useWorldStore((store) => store.selectFortress);
  const selectedFortressId = useWorldStore(selectSelectedFortressId);

  useEffect(() => {
    setMode("control-panel");
    return () => setMode("ens");
  }, [setMode]);

  const fortressPlan = useMemo(() => {
    if (!resolvedNames) return null;
    const source = createPortfolioFortressSource(
      resolvedNames.map((owned) => ({
        ensKey: `0x${owned.tokenId.toString(16)}`,
        label: owned.label,
        fullName: owned.name,
        derelict: owned.status !== 2, // IPermissionedRegistry.Status.REGISTERED
      }))
    );
    return { fortresses: source.loadFortresses(), worldRadius: source.requiredWorldRadius() };
  }, [resolvedNames]);

  useEffect(() => {
    if (fortressPlan) syncFortresses(fortressPlan.fortresses, fortressPlan.worldRadius);
  }, [fortressPlan, syncFortresses]);

  const byKey = useMemo(() => {
    const map = new Map<string, OwnedEthName>();
    for (const owned of resolvedNames ?? []) map.set(`0x${owned.tokenId.toString(16)}`, owned);
    return map;
  }, [resolvedNames]);

  const selectedOwned = selectedFortressId ? (byKey.get(selectedFortressId) ?? null) : null;
  const closePanel = () => selectFortress(null);

  return (
    <ControlPanelWorldShell searchValue={address}>
      <WorldCanvas />
      <BuildBar />

      <div className="pointer-events-none absolute left-4 top-20 z-20 w-full max-w-sm">
        <div className="pointer-events-auto">
          <Panel
            title="Address"
            subtitle="Every castle here is a name it owns"
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
                  </Link>
                </>
              ) : (
                "No reverse record set."
              )}
            </p>
            {isError ? (
              <p className="mt-2 text-sm text-red-300">{error?.message ?? "Could not read the registry."}</p>
            ) : isPending || !resolvedNames ? (
              <p className="mt-2 text-sm text-white/40">Reading the registry…</p>
            ) : resolvedNames.length === 0 ? (
              <p className="mt-2 text-sm text-white/50">
                Owns no <code>.eth</code> name on this deployment right now.
              </p>
            ) : (
              <p className="mt-2 font-mono text-xs text-white/40">
                {resolvedNames.length} name{resolvedNames.length === 1 ? "" : "s"} on the map
              </p>
            )}
          </Panel>
        </div>
      </div>

      <WorldDetailPanel open={!!selectedOwned} onClose={closePanel}>
        {selectedOwned ? <AddressEntryDetail owned={selectedOwned} /> : null}
      </WorldDetailPanel>
    </ControlPanelWorldShell>
  );
}
