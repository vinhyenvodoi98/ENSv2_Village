"use client";

import { zeroAddress } from "viem";
import { CONTRACTS } from "@/lib/contracts/addresses";
import type { EnsNameState } from "@/lib/ens/useEnsName";
import { AddressValue } from "./AddressValue";
import { Field, Panel } from "./Panel";
import { StatusPill, type StatusTone } from "./ui/StatusPill";

const STATUS_TONE: Record<string, StatusTone> = {
  registered: "registered",
  reserved: "reserved",
  available: "available",
};

/// The read-only truth about one name, entirely from `IPermissionedRegistry` on whichever registry
/// governs it. Every row names the function behind it, and every address links out to the explorer,
/// so nothing here can be mistaken for a value the frontend made up.
///
/// Owner and expiry are deliberately *not* rows here (task 39): the identity header above this tab
/// already shows both as one of the four facts a user re-checks constantly, and having them appear
/// a second time here is exactly the "same truth printed twice" defect task 39 set out to remove.
export function NameOverviewPanel({ state }: { state: EnsNameState }) {
  const status = state.status;

  return (
    <Panel
      title="Name"
      subtitle={
        <>
          governed by the registry at{" "}
          {state.registry ? <AddressValue address={state.registry} /> : "—"}
        </>
      }
      actions={status ? <StatusPill label={status} tone={STATUS_TONE[status]} /> : null}
    >
      <dl>
        <Field label="Name">
          <span className="font-mono text-base text-white">{state.name}</span>
        </Field>

        <Field label="Resolver" hint="getResolver(label)">
          <AddressValue address={state.resolver} />
        </Field>

        <Field label="Subregistry" hint="getSubregistry(label)">
          <AddressValue address={state.subregistry} />
        </Field>

        {state.isPermissionedRegistry ? (
          <Field label="Token id" hint="getTokenId(labelhash)">
            <span className="font-mono text-xs break-all text-white/60">
              {state.tokenId !== null ? `0x${state.tokenId.toString(16)}` : "—"}
            </span>
          </Field>
        ) : null}

        {state.isPermissionedRegistry ? (
          <Field label="EACL resource" hint="getResource(labelhash)">
            <span className="font-mono text-xs break-all text-white/60">
              {state.resource !== null ? `0x${state.resource.toString(16)}` : "—"}
            </span>
          </Field>
        ) : null}

        <Field label="Labelhash" hint="LibLabel.id(label)">
          <span className="font-mono text-xs break-all text-white/60">0x{state.labelhash.toString(16)}</span>
        </Field>
      </dl>

      {state.resolver === zeroAddress || state.subregistry === zeroAddress ? (
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/50">
          {state.resolver === zeroAddress && state.subregistry === zeroAddress
            ? "No resolver and no subregistry are set: this name currently answers no queries and issues no subnames."
            : state.resolver === zeroAddress
              ? "No resolver is set, so this name answers no record queries yet."
              : "No subregistry is set, so this name cannot issue subnames yet."}
        </p>
      ) : null}
    </Panel>
  );
}

/// The `getSubregistry` walk that found the governing registry, shown as a trail from the root.
/// This is the panel's own proof that no registry address was hardcoded: `CONTRACTS.rootRegistry`
/// is the only fixed point, and every hop after it came off the chain.
export function RegistryPathPanel({ state }: { state: EnsNameState }) {
  return (
    <Panel title="Registry path" subtitle={<code>IRegistry.getSubregistry(label)</code>}>
      <ol className="space-y-1">
        <li className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-white/5 py-2">
          <span className="text-sm text-white/70">RootRegistry</span>
          <AddressValue address={CONTRACTS.rootRegistry} />
        </li>
        {state.path.map((hop) => (
          <li
            key={`${hop.parentRegistry}-${hop.label}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-white/5 py-2"
          >
            <span className="font-mono text-sm text-white/70">
              ↳ getSubregistry(&quot;{hop.label}&quot;)
            </span>
            <AddressValue address={hop.subregistry} notSetLabel="address(0) — walk ends here" />
          </li>
        ))}
        {state.registry ? (
          <li className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <span className="text-sm text-white/70">
              ↳ label <span className="font-mono text-white/90">{state.label}</span> lives in
            </span>
            <AddressValue address={state.registry} />
          </li>
        ) : null}
      </ol>
    </Panel>
  );
}
