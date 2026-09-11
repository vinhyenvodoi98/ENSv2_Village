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
import { TxStatus } from "@/components/shared/TxStatus";

const REGISTRY_TOKEN_ROLES = REGISTRY_ROLES.filter((role) => role.scope === "token" && !role.adminOnly);

/// A parchment-and-iron scroll, standing apart from the shell's usual dark glass `Panel` on
/// purpose: this is the one card in the whole control panel where a click moves real power over a
/// real name to a real address, and it should never be mistaken for a read-only summary.
function ScrollPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-sm border-2 border-[#5c4326] bg-gradient-to-b from-[#e8d5a8] to-[#d8bd8a] shadow-[0_0_0_1px_#2b1d0e,0_10px_25px_-5px_rgba(0,0,0,0.6)]"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <div className="pointer-events-none absolute inset-2 rounded-sm border border-[#8a6a3a]/60" />
      <header className="relative border-b-2 border-[#5c4326]/70 bg-[#5c4326]/10 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-[#3a2812] uppercase">
          <span aria-hidden>🛡️</span>
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-xs text-[#5c4326]">{subtitle}</p> : null}
      </header>
      <div className="relative px-5 py-4 text-[#2b1d0e]">{children}</div>
    </section>
  );
}

function SealButton({
  children,
  onClick,
  disabled,
  title,
  tone = "grant",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "grant" | "revoke";
}) {
  const palette =
    tone === "grant"
      ? "border-[#5c4326] bg-gradient-to-b from-[#8a1f1f] to-[#5c1414] text-[#f2e2c4] hover:from-[#a02525]"
      : "border-[#5c4326] bg-gradient-to-b from-[#3a2812] to-[#2b1d0e] text-[#e8d5a8] hover:from-[#4a3418]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-sm border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase shadow-[0_2px_0_#000] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${palette}`}
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      {children}
    </button>
  );
}

/// Task 34: the headline panel of the control panel. Grants and revokes one specific
/// `IEnhancedAccessControl` role bitmap to one specific address — never more than the sender
/// intends, never hidden from what it will or won't allow.
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
    <ScrollPanel
      title="Grants & delegation"
      subtitle={
        <>
          <code>grantRoles(resource, roleBitmap, account)</code> · one role, one address, one bitmap —
          never one transaction per role.
        </>
      }
    >
      {!anyAdmin ? (
        <p className="mb-4 rounded-sm border border-[#8a6a3a]/50 bg-[#5c4326]/10 px-3 py-2 text-xs">
          Your connected wallet holds no admin bit on this name&apos;s registry or resolver, so the rows below are
          shown for reference — every grant/revoke control stays inert until an admin address connects.
        </p>
      ) : null}

      {/* — Grant a new capability — */}
      <div className="mb-6 rounded-sm border border-[#8a6a3a]/50 bg-[#f2e2c4]/40 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span aria-hidden>📜</span>
          <input
            value={addressInput}
            onChange={(e) => {
              setAddressInput(e.target.value);
            }}
            placeholder="0x… address to hire"
            className="min-w-0 flex-1 rounded-sm border border-[#8a6a3a] bg-[#fbf3e0] px-2 py-1.5 font-mono text-xs text-[#2b1d0e] placeholder:text-[#8a6a3a]"
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
                  ? "border-[#5c4326] bg-[#5c4326] text-[#f2e2c4]"
                  : "border-[#8a6a3a] bg-[#fbf3e0] text-[#5c4326] hover:bg-[#e8d5a8]"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <details className="mb-3 text-xs">
          <summary className="cursor-pointer font-semibold tracking-wide text-[#5c4326] uppercase">
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

        {(willList.length > 0 || willNotList.length > 0) && (
          <div className="mb-3 grid gap-3 rounded-sm border border-[#8a6a3a]/40 bg-[#fbf3e0]/60 p-2.5 text-xs sm:grid-cols-2">
            <div>
              <p className="mb-1 font-bold tracking-wide text-emerald-900 uppercase">Will be able to</p>
              <ul className="list-inside list-disc space-y-0.5">
                {willList.length > 0 ? willList.map((w) => <li key={w}>{w}</li>) : <li className="italic">Nothing yet — pick a role.</li>}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-bold tracking-wide text-[#8a1f1f] uppercase">Will NOT be able to</p>
              <ul className="list-inside list-disc space-y-0.5">
                {willNotList.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SealButton
            onClick={submitGrant}
            disabled={
              !validAddress ||
              (registryBitmap === 0n && resolverBitmap === 0n) ||
              grant.state === "signing" ||
              grant.state === "confirming"
            }
            title={!anyAdmin ? "Connected wallet holds no admin role to grant with" : undefined}
          >
            Seal the grant
          </SealButton>
          {addressInput.length > 0 && !validAddress ? (
            <span className="text-xs text-[#8a1f1f]">Not a valid address.</span>
          ) : null}
          <TxStatus state={grant.state} txHash={grant.txHash} error={grant.error} />
        </div>
      </div>

      {/* — The matrix — */}
      <div className="overflow-x-auto">
        {assigneesPending ? (
          <p className="text-xs italic">Reading the rolls of the keep…</p>
        ) : !assignees || assignees.length === 0 ? (
          <p className="text-xs italic">No address holds a role on this name yet.</p>
        ) : (
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr>
                <th className="border-b-2 border-[#5c4326] px-2 py-1.5 text-left">Address</th>
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

      {revokeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="w-full max-w-sm rounded-sm border-2 border-[#5c4326] bg-[#e8d5a8] p-4 text-[#2b1d0e] shadow-2xl"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase">
              <span aria-hidden>⚔️</span> Strip a capability
            </h3>
            <p className="mb-3 text-xs">
              Revoke <span className="font-semibold">{revokeTarget.def.label}</span> (
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
                className="rounded-sm border border-[#8a6a3a] px-3 py-1.5 text-xs font-semibold uppercase"
              >
                Stand down
              </button>
              <SealButton tone="revoke" onClick={confirmRevoke} disabled={revoke.state === "signing" || revoke.state === "confirming"}>
                Confirm revoke
              </SealButton>
            </div>
          </div>
        </div>
      ) : null}
    </ScrollPanel>
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
      className="border-b-2 border-[#5c4326] px-2 py-1.5 text-left font-semibold whitespace-nowrap"
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
      <p className="mb-1 font-semibold tracking-wide text-[#5c4326] uppercase">{heading}</p>
      {disabled ? (
        <p className="text-[#8a6a3a] italic">{disabledReason}</p>
      ) : (
        <ul className="space-y-1">
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
    <tr className="border-b border-[#8a6a3a]/30">
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
              ? "border-[#5c4326] bg-[#8a1f1f] hover:bg-[#a02525] cursor-pointer"
              : "border-[#5c4326] bg-[#8a1f1f]/50 cursor-default"
            : "border-[#8a6a3a]/40 bg-transparent cursor-default",
        ].join(" ")}
      />
    </td>
  );
}
