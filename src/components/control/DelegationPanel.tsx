"use client";

import { useState } from "react";
import { isAddress, zeroAddress, type Address } from "viem";
import { enhancedAccessControlAbi } from "@/lib/contracts/abis";
import { EACL_PRESETS, type EaclPreset, type EaclTarget } from "@/lib/ens/eaclPresets";
import {
  REGISTRY_ROLES,
  RESOLVER_ROLES,
  decodeRoles,
  resolverResource,
  type DecodedRole,
  type EnsRoleDef,
} from "@/lib/ens/registryRoles";
import { useTxAction } from "@/lib/ens/useTxAction";
import type { EnsNameState } from "@/lib/ens/useEnsName";
import { useEnsNameRoles } from "@/lib/ens/useEnsName";
import { useRoleAssignees, type RoleAssignee } from "@/lib/ens/useRoleAssignees";
import { truncateAddress } from "@/lib/format";
import { AddressValue } from "./AddressValue";
import { Panel } from "./Panel";
import { TxStatus } from "@/components/shared/TxStatus";
import { ActionButton } from "./ui/ActionButton";

const REGISTRY_TOKEN_ROLES = REGISTRY_ROLES.filter((role) => role.scope === "token" && !role.adminOnly);

/// Task 34: the headline panel of the control panel. Grants and revokes one specific
/// `IEnhancedAccessControl` role bitmap to one specific address — never more than the sender
/// intends, never hidden from what it will or won't allow.
///
/// Task 39 restyled this onto the shell's usual dark-glass `Panel`/`ActionButton`, the language
/// every other panel in the drawer already uses — the serif "scroll" this used to render as
/// belonged to the 3D world layer, not to this instrument, and gave the single most important
/// panel in Phase 8 a different skin from its eight neighbours. The semantics (held / not-held /
/// admin, revoke affordance, raw bitmap on screen) are unchanged.
export function DelegationPanel({ state }: { state: EnsNameState }) {
  const { data: connectedRoles } = useEnsNameRoles(state);
  const { data: assignees, isPending: assigneesPending } = useRoleAssignees(state);

  const node = state.node;
  const resolverAddress = state.resolver && state.resolver !== zeroAddress ? state.resolver : null;
  const resolverResourceValue = resolverAddress ? resolverResource(node) : null;

  const [addressInput, setAddressInput] = useState("");
  const [registrySelected, setRegistrySelected] = useState<Set<string>>(new Set());
  const [resolverSelected, setResolverSelected] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<EaclPreset | null>(null);

  const grant = useTxAction();
  const revoke = useTxAction();
  const [revokeTarget, setRevokeTarget] = useState<{ account: Address; target: EaclTarget; def: EnsRoleDef } | null>(
    null
  );

  if (state.registry === null || !state.isPermissionedRegistry || state.resource === null) return null;

  const connectedRegistryRoles = connectedRoles?.registryRoles ?? [];
  const connectedResolverRoles = connectedRoles?.resolverRoles ?? [];

  const isAdminOf = (target: EaclTarget, def: EnsRoleDef): boolean => {
    const list = target === "registry" ? connectedRegistryRoles : connectedResolverRoles;
    return !!list.find((r) => r.def.key === def.key)?.isAdmin;
  };

  const anyAdmin =
    connectedRegistryRoles.some((r) => r.isAdmin) || connectedResolverRoles.some((r) => r.isAdmin);

  function toggleRole(target: EaclTarget, key: string) {
    setActivePreset(null);
    const setState = target === "registry" ? setRegistrySelected : setResolverSelected;
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyPreset(preset: EaclPreset) {
    setActivePreset(preset);
    if (preset.target === "registry") {
      setRegistrySelected(new Set(preset.roleKeys));
      setResolverSelected(new Set());
    } else {
      setResolverSelected(new Set(preset.roleKeys));
      setRegistrySelected(new Set());
    }
  }

  const registryBitmap = REGISTRY_TOKEN_ROLES.filter((r) => registrySelected.has(r.key)).reduce(
    (bm, r) => bm | r.bit,
    0n
  );
  const resolverBitmap = RESOLVER_ROLES.filter((r) => resolverSelected.has(r.key)).reduce((bm, r) => bm | r.bit, 0n);

  const validAddress = isAddress(addressInput);
  const willList = activePreset
    ? activePreset.will
    : [
        ...REGISTRY_TOKEN_ROLES.filter((r) => registrySelected.has(r.key)).map((r) => r.description),
        ...RESOLVER_ROLES.filter((r) => resolverSelected.has(r.key)).map((r) => r.description),
      ];
  const willNotList = activePreset
    ? activePreset.willNot
    : [
        ...REGISTRY_TOKEN_ROLES.filter((r) => !registrySelected.has(r.key)).map((r) => r.description),
        ...RESOLVER_ROLES.filter((r) => !resolverSelected.has(r.key)).map((r) => r.description),
      ];

  async function submitGrant() {
    if (!validAddress) return;
    const account = addressInput as Address;
    if (registryBitmap !== 0n) {
      await grant
        .send({
          address: state.registry as Address,
          abi: enhancedAccessControlAbi,
          functionName: "grantRoles",
          args: [state.resource as bigint, registryBitmap, account],
        })
        .catch(() => {});
    }
    if (resolverBitmap !== 0n && resolverAddress && resolverResourceValue !== null) {
      await grant
        .send({
          address: resolverAddress,
          abi: enhancedAccessControlAbi,
          functionName: "grantRoles",
          args: [resolverResourceValue, resolverBitmap, account],
        })
        .catch(() => {});
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    const { account, target, def } = revokeTarget;
    const address = target === "registry" ? (state.registry as Address) : (resolverAddress as Address);
    const resource = target === "registry" ? (state.resource as bigint) : (resolverResourceValue as bigint);
    revoke.reset();
    await revoke
      .send({
        address,
        abi: enhancedAccessControlAbi,
        functionName: "revokeRoles",
        args: [resource, def.bit, account],
      })
      .catch(() => {});
    setRevokeTarget(null);
  }

  return (
    <>
      <Panel
        title="Grants & delegation"
        subtitle={
          <>
            <code>grantRoles(resource, roleBitmap, account)</code> · one role, one address, one bitmap — never one
            transaction per role.
          </>
        }
      >
        {!anyAdmin ? (
          <p className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/50">
            Your connected wallet holds no admin bit on this name&apos;s registry or resolver, so the rows below are
            shown for reference — every grant/revoke control stays inert until an admin address connects.
          </p>
        ) : null}

        {/* — Grant a new capability — */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={addressInput}
              onChange={(e) => {
                setAddressInput(e.target.value);
              }}
              placeholder="0x… address to grant to"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30"
            />
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {EACL_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                disabled={!preset.roleKeys.every((key) => isAdminOf(preset.target, findDef(preset.target, key)))}
                title={
                  !preset.roleKeys.every((key) => isAdminOf(preset.target, findDef(preset.target, key)))
                    ? "Connected wallet lacks the admin bit for one or more roles in this preset"
                    : undefined
                }
                className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                  activePreset?.key === preset.key
                    ? "border-white/60 bg-white/15 text-white"
                    : "border-white/10 text-white/60 hover:bg-white/5"
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <details className="mb-3 text-xs">
            <summary className="cursor-pointer font-semibold tracking-wide text-white/60 uppercase">
              Or choose exact roles
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <RoleCheckboxGroup
                heading="Registry"
                defs={REGISTRY_TOKEN_ROLES}
                selected={registrySelected}
                isAdmin={(def) => isAdminOf("registry", def)}
                onToggle={(key) => toggleRole("registry", key)}
              />
              <RoleCheckboxGroup
                heading="Resolver"
                defs={RESOLVER_ROLES}
                selected={resolverSelected}
                isAdmin={(def) => isAdminOf("resolver", def)}
                onToggle={(key) => toggleRole("resolver", key)}
                disabled={!resolverAddress}
                disabledReason="No resolver set on this name yet."
              />
            </div>
          </details>

          {willList.length > 0 || willNotList.length > 0 ? (
            <div className="mb-3 grid gap-3 rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs sm:grid-cols-2">
              <div>
                <p className="mb-1 font-semibold tracking-wide text-emerald-300 uppercase">Will be able to</p>
                <ul className="list-inside list-disc space-y-0.5 text-white/70">
                  {willList.length > 0 ? willList.map((w) => <li key={w}>{w}</li>) : <li className="italic">Nothing yet — pick a role.</li>}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-semibold tracking-wide text-red-300 uppercase">Will NOT be able to</p>
                <ul className="list-inside list-disc space-y-0.5 text-white/70">
                  {willNotList.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              label="Grant"
              tone="primary"
              enabled={validAddress && (registryBitmap !== 0n || resolverBitmap !== 0n) && anyAdmin}
              onClick={submitGrant}
              pending={grant.state === "signing" || grant.state === "confirming"}
              reason={!anyAdmin ? "Connected wallet holds no admin role to grant with" : undefined}
            />
            {addressInput.length > 0 && !validAddress ? (
              <span className="text-xs text-red-300">Not a valid address.</span>
            ) : null}
            <TxStatus state={grant.state} txHash={grant.txHash} error={grant.error} />
          </div>
        </div>

        {/* — The matrix — */}
        <div className="overflow-x-auto">
          {assigneesPending ? (
            <p className="text-xs text-white/40 italic">Reading role assignees…</p>
          ) : !assignees || assignees.length === 0 ? (
            <p className="text-xs text-white/40 italic">No address holds a role on this name yet.</p>
          ) : (
            <table className="w-full min-w-max border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border-b border-white/10 px-2 py-1.5 text-left text-white/60">Address</th>
                  {REGISTRY_TOKEN_ROLES.map((def) => (
                    <ColHeader key={def.key} def={def} />
                  ))}
                  {resolverAddress
                    ? RESOLVER_ROLES.map((def) => <ColHeader key={def.key} def={def} />)
                    : null}
                </tr>
              </thead>
              <tbody>
                {assignees.map((row) => (
                  <MatrixRow
                    key={row.account}
                    row={row}
                    hasResolver={!!resolverAddress}
                    isAdminOf={isAdminOf}
                    onCellClick={(target, def, held) => {
                      if (!held || !isAdminOf(target, def)) return;
                      revoke.reset();
                      setRevokeTarget({ account: row.account, target, def });
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      {revokeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b1020] p-4 text-white shadow-2xl">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-white uppercase">Revoke a role</h3>
            <p className="mb-3 text-xs text-white/60">
              Revoke <span className="font-semibold text-white">{revokeTarget.def.label}</span> (
              <code>{revokeTarget.def.key}</code>) from{" "}
              <span className="font-mono">{truncateAddress(revokeTarget.account)}</span>. This calls{" "}
              <code>revokeRoles</code> on the {revokeTarget.target === "registry" ? "registry" : "resolver"}{" "}
              immediately upon signing.
            </p>
            <TxStatus state={revoke.state} txHash={revoke.txHash} error={revoke.error} />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold tracking-wide text-white/70 uppercase hover:bg-white/10"
              >
                Cancel
              </button>
              <ActionButton
                label="Confirm revoke"
                tone="danger"
                enabled={revoke.state !== "signing" && revoke.state !== "confirming"}
                onClick={confirmRevoke}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function findDef(target: EaclTarget, key: string): EnsRoleDef {
  const defs = target === "registry" ? REGISTRY_TOKEN_ROLES : RESOLVER_ROLES;
  const def = defs.find((d) => d.key === key);
  if (!def) throw new Error(`DelegationPanel: unknown role key ${key}`);
  return def;
}

function ColHeader({ def }: { def: EnsRoleDef }) {
  return (
    <th
      title={`${def.key} — ${def.description}`}
      className="border-b border-white/10 px-2 py-1.5 text-left font-semibold whitespace-nowrap text-white/60"
    >
      {def.label}
    </th>
  );
}

function RoleCheckboxGroup({
  heading,
  defs,
  selected,
  isAdmin,
  onToggle,
  disabled,
  disabledReason,
}: {
  heading: string;
  defs: readonly EnsRoleDef[];
  selected: Set<string>;
  isAdmin: (def: EnsRoleDef) => boolean;
  onToggle: (key: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div>
      <p className="mb-1 font-semibold tracking-wide text-white/60 uppercase">{heading}</p>
      {disabled ? (
        <p className="text-white/40 italic">{disabledReason}</p>
      ) : (
        <ul className="space-y-1 text-white/80">
          {defs.map((def) => {
            const admin = isAdmin(def);
            return (
              <li key={def.key}>
                <label
                  className={`flex items-center gap-1.5 ${admin ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}
                  title={admin ? def.description : `Connected wallet lacks ${def.key}_ADMIN`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(def.key)}
                    disabled={!admin}
                    onChange={() => onToggle(def.key)}
                  />
                  {def.label}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MatrixRow({
  row,
  hasResolver,
  isAdminOf,
  onCellClick,
}: {
  row: RoleAssignee;
  hasResolver: boolean;
  isAdminOf: (target: EaclTarget, def: EnsRoleDef) => boolean;
  onCellClick: (target: EaclTarget, def: EnsRoleDef, held: boolean) => void;
}) {
  const registryDecoded = decodeRoles(row.registryBitmap, REGISTRY_TOKEN_ROLES);
  const resolverDecoded = decodeRoles(row.resolverBitmap, RESOLVER_ROLES);

  return (
    <tr className="border-b border-white/5">
      <td className="px-2 py-1.5 font-mono">
        <AddressValue address={row.account} />
      </td>
      {registryDecoded.map((decoded) => (
        <Cell
          key={decoded.def.key}
          decoded={decoded}
          canRevoke={isAdminOf("registry", decoded.def)}
          onClick={() => onCellClick("registry", decoded.def, decoded.held)}
        />
      ))}
      {hasResolver
        ? resolverDecoded.map((decoded) => (
            <Cell
              key={decoded.def.key}
              decoded={decoded}
              canRevoke={isAdminOf("resolver", decoded.def)}
              onClick={() => onCellClick("resolver", decoded.def, decoded.held)}
            />
          ))
        : null}
    </tr>
  );
}

function Cell({ decoded, canRevoke, onClick }: { decoded: DecodedRole; canRevoke: boolean; onClick: () => void }) {
  const held = decoded.held;
  const clickable = held && canRevoke;
  return (
    <td className="px-2 py-1.5 text-center">
      <button
        type="button"
        disabled={!clickable}
        onClick={onClick}
        title={
          held
            ? clickable
              ? `Revoke ${decoded.def.key}`
              : `Held, but your wallet cannot revoke ${decoded.def.key} (no admin bit)`
            : `Not held`
        }
        className={[
          "inline-flex h-4 w-4 items-center justify-center rounded-full border",
          held
            ? clickable
              ? "border-emerald-400/50 bg-emerald-400/60 hover:bg-emerald-300 cursor-pointer"
              : "border-emerald-400/30 bg-emerald-400/30 cursor-default"
            : "border-white/15 bg-transparent cursor-default",
        ].join(" ")}
      />
    </td>
  );
}
