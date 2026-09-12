"use client";

import { useState } from "react";
import Link from "next/link";
import { addressPath, ensPath } from "@/lib/ens/name";
import type { EnsChildName, EnsNameChildren } from "@/lib/ens/useNameChildren";
import { useEnsNameRoles, type EnsNameState } from "@/lib/ens/useEnsName";
import { AddressValue } from "./AddressValue";
import { ActivityFeedPanel } from "./ActivityFeedPanel";
import { DelegationPanel } from "./DelegationPanel";
import { ExpiryCountdown } from "./ExpiryCountdown";
import { Field, Panel } from "./Panel";
import { LifecyclePanel } from "./LifecyclePanel";
import { NameOverviewPanel, RegistryPathPanel } from "./NameOverviewPanel";
import { RecordsPanel } from "./RecordsPanel";
import { useYourRoleVerdict, YourRoleBadges } from "./RolesSummary";
import { SubnameManagerPanel } from "./SubnameManagerPanel";
import { StatusPill, type StatusTone } from "./ui/StatusPill";
import { EmptyState } from "./ui/EmptyState";
import { NAME_TABS, type NameTab } from "./useNameTab";
import { TipExperience } from "@/components/tip/TipExperience";

const TAB_LABEL: Record<NameTab, string> = {
  overview: "Overview",
  permissions: "Permissions",
  records: "Records",
  subnames: "Subnames",
  lifecycle: "Lifecycle",
  activity: "Activity",
};

/// Whether the leaf-status pill the header shows, and the reason non-Overview tabs are disabled —
/// task 33's four first-class states, decided once here so every tab and the header agree on them.
function nameHeaderStatus(state: EnsNameState): { label: string; tone: StatusTone; blocked: string | null } {
  if (state.registry === null) {
    return { label: "unreachable", tone: "unreachable", blocked: "No registry governs this name — there is nothing to act on." };
  }
  if (!state.isPermissionedRegistry) {
    return {
      label: "custom registry",
      tone: "custom",
      blocked: "This name's registry doesn't implement IPermissionedRegistry, so it has no roles, records or lifecycle for this tab to act on.",
    };
  }
  if (state.status === "available") {
    const lapsed = !!state.latestOwner || (state.expiry !== null && state.expiry > 0n);
    return { label: lapsed ? "lapsed" : "available", tone: lapsed ? "lapsed" : "available", blocked: null };
  }
  return { label: state.status ?? "unknown", tone: (state.status as StatusTone) ?? "neutral", blocked: null };
}

/// The complete read-only-and-writable truth about one ENSv2 name, task 33's original body redrawn
/// as task 39 asked: a sticky identity header (the facts a user re-checks constantly) above six
/// tabs, each mounted only once first selected and kept mounted after — so opening the drawer no
/// longer fires the records/delegation/subname/event-log reads for every panel at once.
export function NameStateDetail({
  state,
  subnames,
  avatar,
  tab,
  onTabChange,
  targetFortressId,
}: {
  state: EnsNameState;
  subnames?: EnsNameChildren;
  avatar?: string;
  tab: NameTab;
  onTabChange: (tab: NameTab) => void;
  targetFortressId: string;
}) {
  const [visited, setVisited] = useState<Set<NameTab>>(() => new Set([tab]));
  const { data: roles } = useEnsNameRoles(state);
  const verdict = useYourRoleVerdict(state);

  function selectTab(next: NameTab) {
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    onTabChange(next);
  }

  const header = nameHeaderStatus(state);
  const owner = state.owner ?? state.latestOwner;

  const registryAnyWrite = !!roles && (roles.registryRoles.some((r) => r.held) || roles.registryRootRoles.some((r) => r.held));
  const registryAnyAdmin = !!roles && (roles.registryRoles.some((r) => r.isAdmin) || roles.registryRootRoles.some((r) => r.isAdmin));
  const resolverAnyWrite = !!roles && !!roles.resolverRoles?.some((r) => r.held);
  const resolverAnyAdmin = !!roles && !!roles.resolverRoles?.some((r) => r.isAdmin);

  const locked: Partial<Record<NameTab, boolean>> = {
    permissions: !!roles && !registryAnyAdmin && !resolverAnyAdmin,
    records: !!roles && !resolverAnyWrite,
    lifecycle: !!roles && !registryAnyWrite,
  };

  const disabledReason: Partial<Record<NameTab, string>> = header.blocked
    ? { permissions: header.blocked, records: header.blocked, subnames: header.blocked, lifecycle: header.blocked, activity: header.blocked }
    : {};

  return (
    <div className="flex h-full flex-col">
      {/* Identity header — never scrolls, the four facts re-checked constantly */}
      <div className="shrink-0 border-b border-white/10 px-5 pt-14 pb-4">
        <div className="flex items-center gap-3">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover" />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate font-mono text-lg text-white">{state.name}</h1>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={header.label} tone={header.tone} />
            {state.expiry !== null && state.expiry > 0n ? <ExpiryCountdown expiry={state.expiry} /> : null}
          </div>
          <TipExperience state={state} targetFortressId={targetFortressId} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-white/50">
          <span className="flex items-center gap-1.5">
            Owner: {owner ? <AddressValue address={owner} /> : <span className="text-white/35 italic">nobody</span>}
          </span>
          <span className="text-white/70">{verdict}</span>
        </div>
      </div>

      {/* Tab strip — never scrolls */}
      <div className="shrink-0 flex flex-wrap gap-1 border-b border-white/10 bg-black/10 px-3 py-2">
        {NAME_TABS.map((key) => {
          const active = tab === key;
          const isLocked = locked[key];
          const blockedReason = disabledReason[key];
          const count = key === "subnames" && subnames?.enumerable ? subnames.children.length : null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectTab(key)}
              disabled={!!blockedReason}
              title={blockedReason ?? (isLocked ? "Connected wallet holds no write role here" : undefined)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                active ? "border-white/60 bg-white/15 text-white" : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
            >
              {TAB_LABEL[key]}
              {count !== null ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">{count}</span>
              ) : null}
              {isLocked && !blockedReason ? <span aria-hidden>🔒</span> : null}
            </button>
          );
        })}
      </div>

      {/* Tab body — each tab owns its own scroll container, and mounts only once first selected */}
      <div className="relative min-h-0 flex-1">
        {NAME_TABS.map((key) => {
          if (!visited.has(key)) return null;
          return (
            <div key={key} hidden={tab !== key} className="h-full overflow-y-auto p-5">
              <TabBody tabKey={key} state={state} subnames={subnames} onTabChange={selectTab} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabBody({
  tabKey,
  state,
  subnames,
  onTabChange,
}: {
  tabKey: NameTab;
  state: EnsNameState;
  subnames?: EnsNameChildren;
  onTabChange: (tab: NameTab) => void;
}) {
  if (state.registry === null) {
    if (tabKey !== "overview") return null;
    return (
      <Panel title="Nothing governs this name" actions={<StatusPill label="unreachable" tone="unreachable" />}>
        <p className="text-sm text-white/60">
          The walk down from the root registry stopped at{" "}
          <span className="font-mono text-white/80">{state.brokenAt?.label}</span>: its <code>getSubregistry</code>{" "}
          returns <code>address(0)</code>, so no registry issues <span className="font-mono text-white/80">{state.name}</span>{" "}
          and there is no on-chain state to read.
        </p>
        <div className="mt-4">
          <RegistryPathPanel state={state} />
        </div>
      </Panel>
    );
  }

  if (!state.isPermissionedRegistry) {
    if (tabKey !== "overview") return null;
    return (
      <div className="space-y-4">
        <CustomRegistryPanel state={state} />
        <NameOverviewPanel state={state} />
        <RegistryPathPanel state={state} />
      </div>
    );
  }

  switch (tabKey) {
    case "overview":
      return (
        <div className="space-y-4">
          {state.status === "available" ? (
            <NotRegisteredPanel name={state.name} hadOwner={state.latestOwner} expiry={state.expiry} />
          ) : null}
          <NameOverviewPanel state={state} />
          <RegistryPathPanel state={state} />
        </div>
      );
    case "permissions":
      return (
        <>
          <YourRoleBadges state={state} />
          <DelegationPanel state={state} />
        </>
      );
    case "records":
      return <RecordsPanel state={state} />;
    case "subnames":
      return <SubnameManagerPanel state={state} subnames={subnames} />;
    case "lifecycle":
      return <LifecyclePanel state={state} onTabChange={onTabChange} />;
    case "activity":
      return <ActivityFeedPanel state={state} />;
  }
}

/// A parent can point `setSubregistry` at *any* `IRegistry` — which only promises
/// `getResolver`/`getSubregistry`. A custom registry that isn't a `PermissionedRegistry` therefore has
/// no `getState`, no expiry, no ERC-1155 token and no EACL resource for this name, so the panels that
/// operate on those have nothing to operate on. Saying so beats showing an error, and beats showing
/// zeroes as if they were read values.
function CustomRegistryPanel({ state }: { state: EnsNameState }) {
  return (
    <Panel title="Custom registry" actions={<StatusPill label="non-standard" tone="custom" />}>
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
    <Panel title={hasLapsed ? "Registration lapsed" : "Not registered"} actions={<StatusPill label="available" tone="available" />}>
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

/// Compact card for a clicked *subname* castle — not the page's own subject. Deliberately doesn't
/// try to show roles or registry-path for it: those need a fresh registry walk from `useEnsName`,
/// which is exactly what navigating to the subname's own `/ens/[name]` page does.
export function NameChildDetail({ child }: { child: EnsChildName }) {
  return (
    <div className="h-full overflow-y-auto p-5 pt-14">
      <Panel
        title={child.fullName}
        subtitle="One level down from this page's own name"
        actions={child.status !== "registered" ? <StatusPill label="lapsed" tone="lapsed" /> : null}
      >
        <dl>
          <Field label="Owner" hint="getState(tokenId).latestOwner">
            {child.owner ? <AddressValue address={child.owner} /> : <EmptyState className="italic">nobody</EmptyState>}
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
    </div>
  );
}
