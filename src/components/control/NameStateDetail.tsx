"use client";

import Link from "next/link";
import { addressPath, ensPath } from "@/lib/ens/name";
import type { EnsChildName, EnsNameChildren } from "@/lib/ens/useNameChildren";
import type { EnsNameState } from "@/lib/ens/useEnsName";
import { AddressValue } from "./AddressValue";
import { DelegationPanel } from "./DelegationPanel";
import { ExpiryCountdown } from "./ExpiryCountdown";
import { Field, Panel } from "./Panel";
import { NameOverviewPanel, RegistryPathPanel } from "./NameOverviewPanel";
import { RecordsPanel } from "./RecordsPanel";
import { RolesSummary } from "./RolesSummary";
import { SubnameManagerPanel } from "./SubnameManagerPanel";

/// The complete read-only truth about one ENSv2 name — task 33's original `/ens/[name]` body,
/// unchanged, now reused as the content of the world view's detail panel (task 34) instead of a
/// full page in its own right. Every panel here still maps to a function ENSv2 itself exposes; only
/// the surrounding chrome changed.
export function NameStateDetail({ state, subnames }: { state: EnsNameState; subnames?: EnsNameChildren }) {
  return (
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
          {state.isPermissionedRegistry ? <DelegationPanel state={state} /> : null}
          {state.isPermissionedRegistry ? <RecordsPanel state={state} /> : null}
          {state.isPermissionedRegistry ? <SubnameManagerPanel state={state} subnames={subnames} /> : null}
        </>
      )}

      <RegistryPathPanel state={state} />

      {/*
        Tasks 37-38 mount their panels here, in order: name lifecycle, activity feed. They each read
        the same `EnsNameState` this page already resolved, and gate their writes on the roles the
        summary above shows. Task 34's delegation panel, task 35's records editor and task 36's
        subname self-service are above, next to the roles summary they read admin bits from.
      */}
    </div>
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
    <Panel title={hasLapsed ? "Registration lapsed" : "Not registered"} actions={<StatusPill label="available" />}>
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

/// Compact card for a clicked *subname* castle — not the page's own subject. Deliberately doesn't
/// try to show roles or registry-path for it: those need a fresh registry walk from `useEnsName`,
/// which is exactly what navigating to the subname's own `/ens/[name]` page does.
export function NameChildDetail({ child }: { child: EnsChildName }) {
  return (
    <Panel
      title={child.fullName}
      subtitle="One level down from this page's own name"
      actions={child.status !== "registered" ? <StatusPill label="lapsed" /> : null}
    >
      <dl>
        <Field label="Owner" hint="getState(tokenId).latestOwner">
          {child.owner ? <AddressValue address={child.owner} /> : <span className="text-sm text-white/35 italic">nobody</span>}
        </Field>
        <Field label="Expiry" hint="getState(tokenId).expiry">
          {child.expiry > 0n ? <ExpiryCountdown expiry={child.expiry} /> : <span className="text-sm text-white/35 italic">—</span>}
        </Field>
        <Field label="Resolver" hint="getResolver(label)">
          <AddressValue address={child.resolver} />
        </Field>
        <Field label="Subregistry" hint="getSubregistry(label)">
          <AddressValue address={child.subregistry} />
        </Field>
      </dl>
      <Link
        href={ensPath(child.fullName)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-white/20"
      >
        Open its own control panel →
      </Link>
    </Panel>
  );
}
