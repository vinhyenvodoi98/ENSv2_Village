"use client";

import { zeroAddress } from "viem";
import { useAccount } from "wagmi";
import type { DecodedRole } from "@/lib/ens/registryRoles";
import { useEnsNameRoles, type EnsNameState } from "@/lib/ens/useEnsName";
import { truncateAddress } from "@/lib/format";
import { AddressValue } from "./AddressValue";

/// What the **connected wallet** may actually do to this name, read from
/// `IEnhancedAccessControl.roles(resource, account)` on the governing registry (and on the resolver,
/// when it has roles at all). This is the gate every write button in tasks 34–37 enables against, so
/// it deliberately shows the raw bitmap too: the decoded pills are only trustworthy if the number
/// behind them is on screen next to them.
///
/// Task 39 split this out of its own `Panel` card: the pills now sit as the Permissions tab's header
/// row ("what **you** hold"), above `DelegationPanel`'s matrix ("what **everyone** holds"), rather
/// than saying the same thing in a second card of its own shape.
///
/// `useEnsNameRoles` keys its query on the connected address, so connecting or switching accounts
/// re-reads on its own — a summary from the previous wallet never lingers.
export function YourRoleBadges({ state }: { state: EnsNameState }) {
  const { address, isConnected } = useAccount();
  const { data: roles, isPending, isError } = useEnsNameRoles(state);

  // `useBlockGatedQuery` keeps the previous key's data on screen while the new key fetches (so the
  // UI doesn't blank out every Sepolia block). Harmless for most reads, unsafe for this one: right
  // after a wallet switch that previous data belongs to the *old* account, and showing one wallet's
  // permissions under another wallet's address is the exact mistake this panel exists to prevent.
  // So the summary is only trusted once its `account` matches the connected one.
  const isStale = !!roles && !!address && roles.account.toLowerCase() !== address.toLowerCase();

  const isOwner = !!address && !!state.owner && address.toLowerCase() === state.owner.toLowerCase();

  return (
    <div className="mb-5 border-b border-white/10 pb-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-white/70 uppercase">Your permissions</h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-white/30">
            <code>roles(resource, account)</code> on{" "}
            {state.registry ? <AddressValue address={state.registry} /> : "—"}
          </span>
          {isConnected && address ? (
            <span className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-white/70">
              {truncateAddress(address)}
              {isOwner ? (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-200 uppercase">
                  owner
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      {!isConnected || !address ? (
        <p className="text-sm text-white/50">
          Connect a wallet to see which ENSv2 roles it holds on <span className="text-white/80">{state.name}</span>.
        </p>
      ) : !state.registry ? (
        <p className="text-sm text-white/50">No registry governs this name yet, so there is no resource to hold roles on.</p>
      ) : state.resource === null ? (
        <p className="text-sm text-white/50">
          This name&apos;s registry exposes no EACL resource for it, so there are no ENSv2 roles to read.
        </p>
      ) : isError ? (
        <p className="text-sm text-red-300">Could not read roles from the registry.</p>
      ) : isPending || !roles || isStale ? (
        <p className="text-sm text-white/40">Reading roles…</p>
      ) : (
        <div className="space-y-5">
          <RoleGroup
            heading="On this name"
            note={`resource 0x${state.resource?.toString(16) ?? "0"}`}
            bitmap={roles.registryBitmap}
            roles={roles.registryRoles}
            showAll
            emptyLabel="This wallet holds no registry roles on this name."
          />

          {roles.registryRootRoles.some((role) => role.held || role.isAdmin) ? (
            <RoleGroup
              heading="On the whole registry"
              note="ROOT_RESOURCE — applies to every name in this registry"
              bitmap={roles.registryRootBitmap}
              roles={roles.registryRootRoles}
              emptyLabel=""
            />
          ) : null}

          {roles.resolverRoles ? (
            <RoleGroup
              heading="On the resolver"
              note="PermissionedResolver roles for this name's node"
              bitmap={roles.resolverBitmap ?? 0n}
              roles={roles.resolverRoles}
              emptyLabel="This wallet holds no record-writing roles on the resolver."
            />
          ) : state.resolver && state.resolver !== zeroAddress ? (
            <p className="text-xs text-white/40">
              This name&apos;s resolver does not implement <code>IEnhancedAccessControl</code>, so it has no
              per-name roles to report.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/// The one-line verdict the identity header shows next to the name — one of the four facts a user
/// re-checks constantly, so it never scrolls away with the rest of the Permissions tab.
export function useYourRoleVerdict(state: EnsNameState): string {
  const { address, isConnected } = useAccount();
  const { data: roles, isPending } = useEnsNameRoles(state);

  const isOwner = !!address && !!state.owner && address.toLowerCase() === state.owner.toLowerCase();

  if (!isConnected || !address) return "connect a wallet";
  if (!state.registry || state.resource === null) return "no roles to hold here";
  if (isOwner) return "you are the owner";
  if (isPending || !roles || roles.account.toLowerCase() !== address.toLowerCase()) return "reading roles…";

  const all = [...roles.registryRoles, ...roles.registryRootRoles, ...(roles.resolverRoles ?? [])];
  const held = all.filter((role) => role.held || role.isAdmin);
  if (held.length === 0) return "read-only";
  return `you hold ${held.length} of ${all.length} roles`;
}

/// `showAll` spells out the registry's whole per-name role vocabulary with the ones this wallet
/// lacks dimmed, rather than only listing what it holds — for the name's own roles that absence is
/// the interesting part ("you cannot renew this" is why a button in task 37 will be disabled).
function RoleGroup({
  heading,
  note,
  bitmap,
  roles,
  emptyLabel,
  showAll = false,
}: {
  heading: string;
  note: string;
  bitmap: bigint;
  roles: DecodedRole[];
  emptyLabel: string;
  showAll?: boolean;
}) {
  const anyHeld = roles.some((role) => role.held || role.isAdmin);
  const shown = showAll ? roles : roles.filter((role) => role.held || role.isAdmin);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-white/70 uppercase">{heading}</h3>
        <span className="font-mono text-[11px] text-white/30">{note}</span>
      </div>
      {shown.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {shown.map((role) => {
            const held = role.held || role.isAdmin;
            return (
              <li
                key={role.def.key}
                title={`${role.def.key} — ${role.def.description}`}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                  held
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-white/10 bg-white/[0.02] text-white/30 line-through decoration-white/20"
                }`}
              >
                {role.def.label}
                {role.isAdmin ? (
                  <span className="rounded-full bg-emerald-300/20 px-1.5 text-[10px] font-semibold tracking-wide uppercase">
                    +admin
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {!anyHeld && emptyLabel ? <p className="mt-2 text-sm text-white/40">{emptyLabel}</p> : null}
      <p className="mt-2 font-mono text-[11px] break-all text-white/25">raw bitmap 0x{bitmap.toString(16)}</p>
    </div>
  );
}
