"use client";

import Link from "next/link";
import { addressPath } from "@/lib/ens/name";
import { useEnsName, type EnsNameState } from "@/lib/ens/useEnsName";
import { ControlPanelShell } from "./ControlPanelShell";
import { NameOverviewPanel, RegistryPathPanel } from "./NameOverviewPanel";
import { Panel } from "./Panel";
import { RolesSummary } from "./RolesSummary";

/// `/ens/[name]` — the canonical page for one ENSv2 name, and the shell tasks 34–38 mount their
/// panels into. The name is the entity here, not the address: expiry, resolver, subregistry and every
/// role are keyed by label inside a registry, and the owner can change hands, so this page stays
/// correct across a transfer where an address-keyed URL would not.
///
/// The three states below are all first-class, per task 33 — a name nobody registered is a normal
/// answer from the chain, not an error to blow up on.
export function NameControlPanel({ name }: { name: string }) {
  const { data: state, isPending, isError, error } = useEnsName(name);

  // Block-gated queries keep the previous key's data visible while the new one loads. Across a
  // navigation that previous data is a *different name*, so it is treated as still-loading rather
  // than rendered under this name's heading.
  const isStale = !!state && state.name !== name;

  return (
    <ControlPanelShell searchValue={name} breadcrumb={<span>/ens/{name}</span>}>
      {isError ? (
        <Panel title="Could not read this name">
          <p className="text-sm text-red-300">{error?.message ?? "The registry read failed."}</p>
        </Panel>
      ) : isPending || !state || isStale ? (
        <Panel title="Resolving">
          <p className="text-sm text-white/40">Walking the registries for {name}…</p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {state.registry === null ? (
            <Panel title="Nothing governs this name" actions={<StatusPill label="unreachable" />}>
              <p className="text-sm text-white/60">
                The walk down from the root registry stopped at{" "}
                <span className="font-mono text-white/80">{state.brokenAt?.label}</span>: its
                <code className="mx-1">getSubregistry</code> returns <code>address(0)</code>, so no registry issues{" "}
                <span className="font-mono text-white/80">{state.name}</span> and there is no on-chain state to read.
              </p>
            </Panel>
          ) : (
            <>
              {!state.isPermissionedRegistry ? (
                <CustomRegistryPanel state={state} />
              ) : state.status === "available" ? (
                <NotRegisteredPanel name={state.name} hadOwner={state.latestOwner} expiry={state.expiry} />
              ) : null}
              <NameOverviewPanel state={state} />
              {state.isPermissionedRegistry ? <RolesSummary state={state} /> : null}
            </>
          )}

          <RegistryPathPanel state={state} />

          {/*
            Tasks 34–38 mount their panels here, in order: EACL delegation, the records editor,
            subname self-service, name lifecycle, activity feed. They each read the same
            `EnsNameState` this page already resolved, and gate their writes on the roles the
            summary above shows.
          */}
        </div>
      )}
    </ControlPanelShell>
  );
}

/// A parent can point `setSubregistry` at *any* `IRegistry` — which only promises
/// `getResolver`/`getSubregistry`. A custom registry that isn't a `PermissionedRegistry` therefore has
/// no `getState`, no expiry, no ERC-1155 token and no EACL resource for this name, so the panels that
/// operate on those have nothing to operate on. Saying so beats showing an error, and beats showing
/// zeroes as if they were read values.
function CustomRegistryPanel({ state }: { state: EnsNameState }) {
  return (
    <Panel title="Custom registry" actions={<StatusPill label="non-standard" />}>
      <p className="text-sm text-white/60">
        <span className="font-mono text-white/80">{state.parent}</span> delegates its subnames to a registry that does not
        implement <code>IPermissionedRegistry</code>: <code>getState</code> reverts there. Its resolver and subregistry
        below are still real reads (<code>IRegistry</code> guarantees those), but this name has no expiry, no ERC-1155
        token and no EACL resource for the control panel to act on.
      </p>
    </Panel>
  );
}

/// `Status.AVAILABLE` covers both "never registered" and "registered once, then expired" —
/// `PermissionedRegistry._constructStatus` collapses the two, and only `latestOwner`/`expiry`
/// distinguish them. Worth telling apart on screen: one name is free to claim, the other just
/// slipped out of someone's hands.
function NotRegisteredPanel({
  name,
  hadOwner,
  expiry,
}: {
  name: string;
  hadOwner: `0x${string}` | null;
  expiry: bigint | null;
}) {
  const hasLapsed = !!hadOwner || (expiry !== null && expiry > 0n);

  return (
    <Panel
      title={hasLapsed ? "Registration lapsed" : "Not registered"}
      actions={<StatusPill label="available" />}
    >
      <p className="text-sm text-white/60">
        {hasLapsed ? (
          <>
            <span className="font-mono text-white/80">{name}</span> exists in the registry but its expiry has passed, so{" "}
            <code>getStatus</code> reports it as <code>AVAILABLE</code> again and its owner, resolver and subregistry all
            read as unset.
          </>
        ) : (
          <>
            No one has registered <span className="font-mono text-white/80">{name}</span> on this deployment. The registry
            answered — there is simply nothing recorded under this label.
          </>
        )}
      </p>
      {hadOwner ? (
        <p className="mt-2 text-sm text-white/50">
          Last held by{" "}
          <Link
            href={addressPath(hadOwner)}
            className="font-mono text-sky-300 underline decoration-sky-300/30 underline-offset-2 hover:text-sky-200"
          >
            {hadOwner}
          </Link>
        </p>
      ) : null}
    </Panel>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-white/60 uppercase">
      {label}
    </span>
  );
}
