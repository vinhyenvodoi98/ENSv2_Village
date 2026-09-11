"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { addressPath, ensPath } from "@/lib/ens/name";
import { ControlPanelShell } from "./ControlPanelShell";
import { Panel } from "./Panel";

/// `/ens` — the entry point when no name is in the URL yet. It offers the two starting points that
/// are actually knowable without asking the chain anything: the deployment's own parent name, and
/// the connected wallet's portfolio.
export function ControlPanelLanding() {
  const { address } = useAccount();

  return (
    <ControlPanelShell>
      <Panel title="Open a name" subtitle="Type a name to operate it, or an address to see what it owns">
        <p className="text-sm text-white/60">
          Every panel here maps to a function ENSv2 itself exposes — <code>getOwner</code>,{" "}
          <code>getExpiry</code>, <code>getResolver</code>, <code>getSubregistry</code>,{" "}
          <code>roles(resource, account)</code> — read live from the{" "}
          <span className="text-white/80">{CONTRACTS.deployment}</span> deployment.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={ensPath(CONTRACTS.parentName)}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-sm text-white transition-colors hover:bg-white/10"
          >
            {CONTRACTS.parentName}
          </Link>
          {address ? (
            <Link
              href={addressPath(address)}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-sm text-white transition-colors hover:bg-white/10"
            >
              names you own
            </Link>
          ) : null}
        </div>
      </Panel>
    </ControlPanelShell>
  );
}
