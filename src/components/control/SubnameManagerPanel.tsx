"use client";

import { useState } from "react";
import { isAddress, zeroAddress, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { ethRegistryAbi } from "@/lib/contracts/abis";
import { CLAIM_DURATION_OPTIONS } from "@/lib/ens/useClaimName";
import type { EnsChildName, EnsNameChildren } from "@/lib/ens/useNameChildren";
import type { EnsNameState } from "@/lib/ens/useEnsName";
import { useBlockGatedQuery } from "@/lib/ens/query";
import { useChildRoles } from "@/lib/ens/useChildRoles";
import { useFoundSubregistry } from "@/lib/ens/useFoundSubregistry";
import { useRegisterSubname } from "@/lib/ens/useRegisterSubname";
import { SUBNAME_PRESETS, type SubnamePreset } from "@/lib/ens/subnamePresets";
import { REGISTRY_ROLES, ROOT_RESOURCE } from "@/lib/ens/registryRoles";
import { useTxAction } from "@/lib/ens/useTxAction";
import { ensPath } from "@/lib/ens/name";
import { TxStatus } from "@/components/shared/TxStatus";
import Link from "next/link";
import { AddressValue } from "./AddressValue";
import { ExpiryCountdown } from "./ExpiryCountdown";
import { Panel } from "./Panel";

/// Task 36: "an owner deploys their own `PermissionedRegistry`, points their name at it, and from
/// then on issues subnames permissionlessly." One screen, three parts, each gated on chain state
/// rather than on "a tx just confirmed": found-your-own-registry (steps 1-2), the register form
/// (step 3, and every subname minted after), and the children list this registry now enumerates.
export function SubnameManagerPanel({ state, subnames }: { state: EnsNameState; subnames?: EnsNameChildren }) {
  const subregistry = state.subregistry && state.subregistry !== zeroAddress ? state.subregistry : null;

  return (
    <>
      {!subregistry ? <FoundSubregistryPanel state={state} /> : <RegisterSubnamePanel state={state} subregistry={subregistry} />}
      <ChildrenPanel parentName={state.name} subregistry={subregistry} subnames={subnames} />
    </>
  );
}

/// Step 1-2: deploy a dedicated `PermissionedRegistry`, then `ETHRegistry.setSubregistry` it onto
/// this name. A wallet that already did this in an earlier session resumes wherever it left off —
/// `useFoundSubregistry` reads both steps live off chain, never off "a tx was just sent".
function FoundSubregistryPanel({ state }: { state: EnsNameState }) {
  const flow = useFoundSubregistry(state);

  if (flow.loading) {
    return (
      <Panel title="Found your own registry">
        <p className="text-sm text-white/40">Reading registry state…</p>
      </Panel>
    );
  }

  const step1Done = !!flow.newRegistryAddress;
  const step2Done = flow.done;

  return (
    <Panel
      title="Found your own registry"
      subtitle={
        <>
          This name has no subregistry yet — deploy a <code>PermissionedRegistry</code> of its own to start issuing
          subnames permissionlessly.
        </>
      }
    >
      {flow.blockedReason ? (
        <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Cannot finish this flow: connected wallet is {flow.blockedReason}.
        </p>
      ) : null}

      <ol className="space-y-3">
        <StepRow
          n={1}
          label="Deploy a PermissionedRegistry"
          done={step1Done}
          action={
            !step1Done ? (
              <button
                type="button"
                onClick={() => void flow.deploy.run()}
                disabled={flow.deploy.state === "signing" || flow.deploy.state === "confirming"}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Deploy
              </button>
            ) : null
          }
        >
          <TxStatus state={flow.deploy.state} txHash={flow.deploy.txHash} error={flow.deploy.error} />
        </StepRow>
        <StepRow
          n={2}
          label="Point this name at it"
          done={step2Done}
          action={
            step1Done && !step2Done ? (
              <button
                type="button"
                onClick={() => void flow.link.run()}
                disabled={!!flow.blockedReason || flow.link.state === "signing" || flow.link.state === "confirming"}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                setSubregistry
              </button>
            ) : null
          }
        >
          <TxStatus state={flow.link.state} txHash={flow.link.txHash} error={flow.link.error} />
        </StepRow>
        <StepRow n={3} label="Register your first subname" done={false}>
          <p className="text-xs text-white/40">Unlocks once step 2 confirms.</p>
        </StepRow>
      </ol>
    </Panel>
  );
}

function StepRow({
  n,
  label,
  done,
  action,
  children,
}: {
  n: number;
  label: string;
  done: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          done ? "bg-emerald-500 text-black" : "bg-white/10 text-white/60"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm ${done ? "text-white/50 line-through" : "text-white/90"}`}>{label}</span>
          {action}
        </div>
        {children}
      </div>
    </li>
  );
}

/// Step 3 and every subname after: `register(label, owner, registry, resolver, roleBitmap, expiry)`
/// with `roleBitmap` chosen from a named preset, never a raw number, per task 36's spec.
function RegisterSubnamePanel({ state, subregistry }: { state: EnsNameState; subregistry: `0x${string}` }) {
  const { address } = useAccount();
  const { register, registerAction, grantAction } = useRegisterSubname();
  const canRegister = useCanRegister(subregistry, address);

  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [resolver, setResolver] = useState(state.resolver && state.resolver !== zeroAddress ? state.resolver : "");
  const [duration, setDuration] = useState<bigint>(CLAIM_DURATION_OPTIONS[0].seconds);
  const [preset, setPreset] = useState<SubnamePreset>(SUBNAME_PRESETS[0]);
  const [result, setResult] = useState<{ resolverGrantAttempted: boolean; resolverGrantOk: boolean } | null>(null);

  const validLabel = /^[a-z0-9-]+$/.test(label);
  const ownerAddress = owner || address || "";
  const validOwner = isAddress(ownerAddress);
  const validResolver = resolver === "" || isAddress(resolver);

  async function submit() {
    if (!validLabel || !validOwner || !validResolver) return;
    setResult(null);
    const expiry = BigInt(Math.floor(Date.now() / 1000)) + duration;
    try {
      const outcome = await register({
        subregistry,
        label,
        owner: ownerAddress as Address,
        resolver: resolver ? (resolver as Address) : null,
        preset,
        expiry,
        parentName: state.name,
      });
      setResult(outcome);
      setLabel("");
    } catch {
      // registerAction/grantAction already carry the failure state shown below
    }
  }

  return (
    <Panel title="Register a subname" subtitle={<code>register(label, owner, registry, resolver, roleBitmap, expiry)</code>}>
      {!canRegister.holds ? (
        <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Connected wallet is missing <code>ROLE_REGISTRAR</code> on this registry — only the address that founded it (or
          someone it delegated to) can register subnames.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-white/60">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value.toLowerCase())}
            placeholder="e.g. alice"
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-sm text-white placeholder:text-white/25"
          />
          <span className="mt-0.5 block text-[11px] text-white/30">
            {label ? `${label}.${state.name}` : `<label>.${state.name}`}
          </span>
        </label>
        <label className="text-xs text-white/60">
          Owner
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder={address ?? "0x…"}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-sm text-white placeholder:text-white/25"
          />
        </label>
        <label className="text-xs text-white/60">
          Resolver
          <input
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
            placeholder="0x… (optional)"
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-sm text-white placeholder:text-white/25"
          />
        </label>
        <label className="text-xs text-white/60">
          Duration
          <select
            value={duration.toString()}
            onChange={(e) => setDuration(BigInt(e.target.value))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
          >
            {CLAIM_DURATION_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.seconds.toString()}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUBNAME_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase transition-colors ${
              preset.key === p.key ? "border-white/60 bg-white/15 text-white" : "border-white/10 text-white/60 hover:bg-white/5"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs sm:grid-cols-2">
        <div>
          <p className="mb-1 font-semibold tracking-wide text-emerald-300 uppercase">Will be able to</p>
          <ul className="list-inside list-disc space-y-0.5 text-white/70">
            {preset.will.length > 0 ? preset.will.map((w) => <li key={w}>{w}</li>) : <li className="italic">Nothing.</li>}
          </ul>
        </div>
        <div>
          <p className="mb-1 font-semibold tracking-wide text-red-300 uppercase">Will NOT be able to</p>
          <ul className="list-inside list-disc space-y-0.5 text-white/70">
            {preset.willNot.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={
            !canRegister.holds ||
            !validLabel ||
            !validOwner ||
            !validResolver ||
            registerAction.state === "signing" ||
            registerAction.state === "confirming"
          }
          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold tracking-wide text-black uppercase transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Register subname
        </button>
        {label.length > 0 && !validLabel ? <span className="text-xs text-red-300">Lowercase letters, digits, hyphens only.</span> : null}
      </div>
      <div className="mt-2 space-y-1">
        <TxStatus state={registerAction.state} txHash={registerAction.txHash} error={registerAction.error} />
        {result?.resolverGrantAttempted ? (
          <TxStatus state={grantAction.state} txHash={grantAction.txHash} error={grantAction.error} />
        ) : result && !result.resolverGrantAttempted && preset.resolverRoleKeys.length > 0 ? (
          <p className="text-xs text-white/40">
            Registered without the resolver-side role grant: no resolver was set, or it doesn&apos;t support{" "}
            <code>IEnhancedAccessControl</code>. The new owner can still be granted those roles later once a compatible
            resolver is set.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

const ROLE_REGISTRAR_BIT = REGISTRY_ROLES.find((r) => r.key === "ROLE_REGISTRAR")!.bit;

function useCanRegister(subregistry: `0x${string}`, account: `0x${string}` | undefined) {
  const publicClient = usePublicClient();
  const query = useBlockGatedQuery<boolean>(
    ["subregistryCanRegister", subregistry, account],
    async () => {
      if (!publicClient || !account) return false;
      const bitmap = await publicClient.readContract({
        address: subregistry,
        abi: ethRegistryAbi,
        functionName: "roles",
        args: [ROOT_RESOURCE, account],
      });
      return (bitmap & ROLE_REGISTRAR_BIT) !== 0n;
    },
    { enabled: !!publicClient && !!account }
  );
  return { holds: query.data ?? false };
}

/// The children list, with the actions the connected wallet's roles actually permit — read live off
/// `useChildRoles`, never assumed from having registered the parent.
function ChildrenPanel({
  parentName,
  subregistry,
  subnames,
}: {
  parentName: string;
  subregistry: `0x${string}` | null;
  subnames?: EnsNameChildren;
}) {
  const { address } = useAccount();
  const roleMap = useChildRoles(subregistry, subnames?.children ?? [], address).data;

  return (
    <Panel
      title="Subnames"
      subtitle={<code>IPermissionedRegistry.LabelRegistered</code>}
      actions={
        subnames?.enumerable ? (
          <span className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-white/60">{subnames.children.length}</span>
        ) : null
      }
    >
      {!subregistry ? (
        <p className="text-sm text-white/50">No subregistry wired yet — found one above first.</p>
      ) : !subnames ? (
        <p className="text-sm text-white/40">Reading subnames…</p>
      ) : !subnames.enumerable ? (
        <p className="text-sm text-white/50">
          <span className="font-mono text-white/80">{parentName}</span>&apos;s subregistry does not implement{" "}
          <code>IPermissionedRegistry</code>, so there is no standard way to list what it holds.
        </p>
      ) : subnames.children.length === 0 ? (
        <p className="text-sm text-white/50">No subnames registered under this name yet.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {subnames.children.map((child) => (
            <ChildRow
              key={child.ensKey}
              child={child}
              subregistry={subregistry}
              roles={roleMap?.get(child.tokenId.toString()) ?? []}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ChildRow({
  child,
  subregistry,
  roles,
}: {
  child: EnsChildName;
  subregistry: `0x${string}`;
  roles: { def: { key: string }; held: boolean }[];
}) {
  const [editing, setEditing] = useState<"resolver" | "subregistry" | null>(null);
  const held = (key: string) => roles.some((r) => r.def.key === key && r.held);

  const renewAction = useTxAction();
  const unregisterAction = useTxAction();

  async function renew() {
    const newExpiry = child.expiry + CLAIM_DURATION_OPTIONS[0].seconds;
    await renewAction
      .send({ address: subregistry, abi: ethRegistryAbi, functionName: "renew", args: [child.tokenId, newExpiry] })
      .catch(() => {});
  }

  async function unregister() {
    if (!window.confirm(`Unregister ${child.fullName}? This cannot be undone.`)) return;
    await unregisterAction.send({ address: subregistry, abi: ethRegistryAbi, functionName: "unregister", args: [child.tokenId] }).catch(() => {});
  }

  const hasResolver = !!child.resolver && child.resolver !== zeroAddress;
  const hasSubregistry = !!child.subregistry && child.subregistry !== zeroAddress;

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={ensPath(child.fullName)}
          className="font-mono text-sm text-white underline decoration-white/20 underline-offset-2 hover:decoration-white"
        >
          {child.fullName}
        </Link>
        <span className="flex items-baseline gap-3 text-xs">
          {child.status !== "registered" ? (
            <span className="text-white/40 italic">lapsed</span>
          ) : child.expiry > 0n ? (
            <ExpiryCountdown expiry={child.expiry} />
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
        <span>
          Owner: <AddressValue address={child.owner} />
        </span>
        <span>Resolver: {hasResolver ? "set" : "not set"}</span>
        <span>
          Subregistry:{" "}
          {hasSubregistry ? (
            <Link href={ensPath(child.fullName)} className="text-sky-300 underline decoration-sky-300/30 underline-offset-2">
              one level deeper →
            </Link>
          ) : (
            "not set"
          )}
        </span>
      </div>
      {roles.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton label="Renew +1y" enabled={held("ROLE_RENEW")} onClick={renew} pending={renewAction.state === "signing" || renewAction.state === "confirming"} />
          <ActionButton label="Unregister" enabled={held("ROLE_UNREGISTER")} onClick={unregister} pending={unregisterAction.state === "signing" || unregisterAction.state === "confirming"} tone="danger" />
          <ActionButton label="Set resolver" enabled={held("ROLE_SET_RESOLVER")} onClick={() => setEditing(editing === "resolver" ? null : "resolver")} />
          <ActionButton label="Set subregistry" enabled={held("ROLE_SET_SUBREGISTRY")} onClick={() => setEditing(editing === "subregistry" ? null : "subregistry")} />
        </div>
      ) : null}
      <TxStatus state={renewAction.state} txHash={renewAction.txHash} error={renewAction.error} />
      <TxStatus state={unregisterAction.state} txHash={unregisterAction.txHash} error={unregisterAction.error} />
      {editing ? (
        <InlineAddressAction
          kind={editing}
          tokenId={child.tokenId}
          subregistry={subregistry}
          onDone={() => setEditing(null)}
        />
      ) : null}
    </li>
  );
}

function ActionButton({
  label,
  enabled,
  onClick,
  pending,
  tone = "default",
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
  pending?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled || pending}
      title={enabled ? undefined : "Connected wallet lacks the role this action needs"}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        tone === "danger" ? "border-red-400/30 text-red-300 hover:bg-red-400/10" : "border-white/15 text-white/70 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function InlineAddressAction({
  kind,
  tokenId,
  subregistry,
  onDone,
}: {
  kind: "resolver" | "subregistry";
  tokenId: bigint;
  subregistry: `0x${string}`;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const action = useTxAction();
  const valid = isAddress(value);
  const functionName = kind === "resolver" ? "setResolver" : "setSubregistry";

  async function submit() {
    if (!valid) return;
    await action
      .send({ address: subregistry, abi: ethRegistryAbi, functionName, args: [tokenId, value as Address] })
      .catch(() => {});
    if (action.state !== "failed") onDone();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`0x… new ${kind}`}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-white placeholder:text-white/25"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!valid || action.state === "signing" || action.state === "confirming"}
        className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Set
      </button>
      <TxStatus state={action.state} txHash={action.txHash} error={action.error} />
    </div>
  );
}
