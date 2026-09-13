"use client";

import { useState } from "react";
import { isAddress, zeroAddress, type Address } from "viem";
import { enhancedAccessControlAbi } from "@/lib/contracts/abis";
import { formatAbsoluteTime, formatDuration, formatTokenAmount } from "@/lib/format";
import { ADMIN_ROLE_SHIFT, REGISTRY_ROLES } from "@/lib/ens/registryRoles";
import { useNameLifecycle } from "@/lib/ens/useNameLifecycle";
import { useEnsNameRoles, type EnsNameState } from "@/lib/ens/useEnsName";
import { useTxAction } from "@/lib/ens/useTxAction";
import { useNowTicker } from "@/lib/useNowTicker";
import { TxStatus } from "@/components/shared/TxStatus";
import { Panel } from "./Panel";
import { ActionButton } from "./ui/ActionButton";
import type { NameTab } from "./useNameTab";

const ROLE_CAN_TRANSFER = REGISTRY_ROLES.find((r) => r.key === "ROLE_CAN_TRANSFER")!;

/// Task 37: the unglamorous panel every name manager needs — renew, transfer, re-point — kept
/// deliberately thin. Every write here is a function `IPermissionedRegistry`/`IEnhancedAccessControl`
/// already expose; nothing here invents a tier ladder or a lifecycle state ENSv2 doesn't already have.
export function LifecyclePanel({ state, onTabChange }: { state: EnsNameState; onTabChange: (tab: NameTab) => void }) {
  if (!state.isPermissionedRegistry || state.tokenId === null || state.expiry === null) return null;

  return (
    <>
      <ExpiryBanner expiry={state.expiry} />
      <RenewPanel state={state} />
      <TransferPanel state={state} />
      <RepointPanel state={state} onTabChange={onTabChange} />
    </>
  );
}

/// "The loudest thing on the page" for a name close to or past its expiry — the one state here
/// where inaction costs the owner something. Silent for anything more than 30 days out.
function ExpiryBanner({ expiry }: { expiry: bigint }) {
  const now = useNowTicker();
  const secondsLeft = Number(expiry) - Math.floor(now / 1000);
  if (secondsLeft >= 30 * 86400) return null;

  const expired = secondsLeft <= 0;
  return (
    <div
      className={`rounded-sm border-2 px-5 py-4 text-sm font-semibold ${
        expired ? "border-red-400 bg-red-500/15 text-red-200" : "border-amber-400 bg-amber-500/15 text-amber-200"
      }`}
    >
      {expired
        ? `This name expired ${formatDuration(-secondsLeft)} ago. Anyone can register it out from under its former owner until it's renewed.`
        : `This name expires in ${formatDuration(secondsLeft)} — renew below before it lapses.`}
    </div>
  );
}

function RenewPanel({ state }: { state: EnsNameState }) {
  const { data: connectedRoles } = useEnsNameRoles(state);
  const lifecycle = useNameLifecycle(state);

  const canRenew = lifecycle.isEthRegistrarPath || !!connectedRoles?.registryRoles.find((r) => r.def.key === "ROLE_RENEW")?.held;
  const { price } = lifecycle;

  return (
    <Panel
      title="Renew"
      subtitle={
        lifecycle.isEthRegistrarPath ? (
          <code>ETHRegistrar.renew(label, duration, paymentToken, referrer)</code>
        ) : (
          <code>renew(anyId, newExpiry)</code>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-[#6b5636]">
          Duration
          <select
            value={lifecycle.duration.toString()}
            onChange={(e) => lifecycle.setDuration(BigInt(e.target.value))}
            className="mt-1 block w-full rounded-sm border border-[#c9a15a]/40 bg-[#3a2918]/16 px-2 py-1.5 text-sm text-[#3a2918]"
          >
            {lifecycle.durationOptions.map((opt) => (
              <option key={opt.label} value={opt.seconds.toString()}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {lifecycle.resultingExpiry !== null ? (
          <p className="text-xs text-[#8a755b]">
            New expiry: <span className="font-mono text-[#3f2c1a]">{formatAbsoluteTime(lifecycle.resultingExpiry)}</span>
          </p>
        ) : null}
      </div>

      {lifecycle.isEthRegistrarPath ? (
        <p className="mt-3 text-xs text-[#8a755b]">
          This name renews through <code>ETHRegistrar</code>, the same priced path task 31 registers
          through — anyone may pay to renew it, not only the owner.
        </p>
      ) : null}

      {lifecycle.isEthRegistrarPath && price ? (
        <div className="mt-3 rounded-sm border border-[#c9a15a]/40 bg-[#3a2918]/12 p-3 text-xs">
          <p className="text-[#4b3420]">
            Price: <span className="font-mono text-[#3a2918]">{formatTokenAmount(price.total, price.decimals)} mUSDC</span> — read live from{" "}
            <code>getRenewPrice</code>, never assumed.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {lifecycle.mintNeeded ? (
              <ActionButton label="Mint test mUSDC" enabled onClick={lifecycle.mint.run} pending={isPending(lifecycle.mint.state)} />
            ) : null}
            {!lifecycle.mintNeeded && lifecycle.approveNeeded ? (
              <ActionButton label="Approve mUSDC" enabled onClick={lifecycle.approve.run} pending={isPending(lifecycle.approve.state)} />
            ) : null}
          </div>
          <TxStatus state={lifecycle.mint.state} txHash={lifecycle.mint.txHash} error={lifecycle.mint.error} />
          <TxStatus state={lifecycle.approve.state} txHash={lifecycle.approve.txHash} error={lifecycle.approve.error} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ActionButton
          label="Renew"
          enabled={canRenew && !(lifecycle.isEthRegistrarPath && (lifecycle.mintNeeded || lifecycle.approveNeeded))}
          onClick={lifecycle.renew.run}
          pending={isPending(lifecycle.renew.state)}
          reason={!canRenew ? "Connected wallet lacks ROLE_RENEW on this name" : undefined}
        />
        <TxStatus state={lifecycle.renew.state} txHash={lifecycle.renew.txHash} error={lifecycle.renew.error} />
      </div>
    </Panel>
  );
}

function TransferPanel({ state }: { state: EnsNameState }) {
  const { data: connectedRoles } = useEnsNameRoles(state);
  const lifecycle = useNameLifecycle(state);
  const toggleAction = useTxAction();

  const [destination, setDestination] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const transferable = !!connectedRoles?.registryRoles.find((r) => r.def.key === "ROLE_CAN_TRANSFER")?.isAdmin;
  const validDestination = isAddress(destination);
  const confirmed = confirmText.trim().toLowerCase() === destination.trim().toLowerCase() && validDestination;

  async function toggleTransferable(next: boolean) {
    if (!state.registry || state.resource === null || !state.owner) return;
    await toggleAction
      .send({
        address: state.registry,
        abi: enhancedAccessControlAbi,
        functionName: next ? "grantRoles" : "revokeRoles",
        args: [state.resource, ROLE_CAN_TRANSFER.bit << ADMIN_ROLE_SHIFT, state.owner],
      })
      .catch(() => {});
  }

  async function submitTransfer() {
    if (!confirmed) return;
    await lifecycle.transfer.run(destination as Address).catch(() => {});
    if (lifecycle.transfer.state !== "failed") {
      setDestination("");
      setConfirmText("");
    }
  }

  return (
    <Panel title="Transfer" subtitle={<code>safeTransferFrom(from, to, tokenId, 1, &quot;0x&quot;)</code>}>
      <p className="text-sm text-[#6b5636]">
        ENSv2 has no dedicated transfer function — a name is an ERC-1155 token, and moving it to
        another address is the standard <code>safeTransferFrom</code> every 1155 exposes.
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-sm border border-[#c9a15a]/40 bg-[#3a2918]/12 p-3">
        <div>
          <p className="text-sm font-medium text-[#3f2c1a]">Transferable</p>
          <p className="mt-0.5 text-xs text-[#8a755b]">
            Turning this off revokes <code>ROLE_CAN_TRANSFER_ADMIN</code> from the current owner, which is what makes
            this name unsellable — no <code>safeTransferFrom</code> will succeed until it&apos;s granted back.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={transferable}
          onClick={() => void toggleTransferable(!transferable)}
          disabled={toggleAction.state === "signing" || toggleAction.state === "confirming"}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
            transferable ? "bg-emerald-500" : "bg-[#c9a15a]/20"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#ece1c8] transition-transform ${
              transferable ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      <TxStatus state={toggleAction.state} txHash={toggleAction.txHash} error={toggleAction.error} />

      {!transferable ? (
        <p className="mt-3 rounded-sm border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          This name is not transferable — the connected wallet lacks <code>ROLE_CAN_TRANSFER_ADMIN</code>. Turn the
          switch back on above to enable a transfer.
        </p>
      ) : (
        <div className="mt-4 rounded-sm border border-red-400/20 bg-red-500/5 p-3">
          <label className="text-xs text-[#6b5636]">
            Destination address
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="0x…"
              className="mt-1 w-full rounded-sm border border-[#c9a15a]/40 bg-[#3a2918]/16 px-2 py-1.5 font-mono text-sm text-[#3a2918] placeholder:text-[#b9a684]"
            />
          </label>
          {validDestination ? (
            <label className="mt-2 block text-xs text-[#6b5636]">
              Type <span className="font-mono text-[#3f2c1a]">{destination}</span> to confirm — this is irreversible
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="0x…"
                className="mt-1 w-full rounded-sm border border-[#c9a15a]/40 bg-[#3a2918]/16 px-2 py-1.5 font-mono text-sm text-[#3a2918] placeholder:text-[#b9a684]"
              />
            </label>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ActionButton
              label="Transfer name"
              tone="danger"
              enabled={confirmed}
              onClick={submitTransfer}
              pending={isPending(lifecycle.transfer.state)}
            />
            <TxStatus state={lifecycle.transfer.state} txHash={lifecycle.transfer.txHash} error={lifecycle.transfer.error} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function RepointPanel({ state, onTabChange }: { state: EnsNameState; onTabChange: (tab: NameTab) => void }) {
  const { data: connectedRoles } = useEnsNameRoles(state);
  const lifecycle = useNameLifecycle(state);

  const canSetResolver = !!connectedRoles?.registryRoles.find((r) => r.def.key === "ROLE_SET_RESOLVER")?.held;
  const canSetSubregistry = !!connectedRoles?.registryRoles.find((r) => r.def.key === "ROLE_SET_SUBREGISTRY")?.held;

  return (
    <Panel
      title="Re-point"
      subtitle={
        <>
          <code>setResolver</code> · <code>setSubregistry</code> — current values are on the{" "}
          <button
            type="button"
            onClick={() => onTabChange("overview")}
            className="underline decoration-white/30 underline-offset-2 hover:text-[#3a2918]"
          >
            Overview
          </button>{" "}
          tab
        </>
      }
    >
      <RepointField
        label="Resolver"
        hint="setResolver(anyId, resolver)"
        hasCurrent={!!state.resolver && state.resolver !== zeroAddress}
        canSet={canSetResolver}
        roleKey="ROLE_SET_RESOLVER"
        warning="Records live per resolver — switching hides this name's existing records rather than moving them. They resolve again if this resolver is set back."
        onSubmit={lifecycle.setResolver.run}
        action={lifecycle.setResolver}
      />
      <div className="my-4 border-t border-[#c9a15a]/20" />
      <RepointField
        label="Subregistry"
        hint="setSubregistry(anyId, registry)"
        hasCurrent={!!state.subregistry && state.subregistry !== zeroAddress}
        canSet={canSetSubregistry}
        roleKey="ROLE_SET_SUBREGISTRY"
        warning="This decides which registry issues this name's subnames — the Subnames tab shares the same field."
        onSubmit={lifecycle.setSubregistry.run}
        action={lifecycle.setSubregistry}
      />
    </Panel>
  );
}

function RepointField({
  label,
  hint,
  hasCurrent,
  canSet,
  roleKey,
  warning,
  onSubmit,
  action,
}: {
  label: string;
  hint: string;
  hasCurrent: boolean;
  canSet: boolean;
  roleKey: string;
  warning: string;
  onSubmit: (value: Address) => Promise<void>;
  action: { state: ReturnType<typeof useTxAction>["state"]; txHash?: `0x${string}`; error: string | null };
}) {
  const [value, setValue] = useState("");
  const valid = isAddress(value);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-[#6b5636] uppercase">{label}</p>
        <p className="font-mono text-[11px] text-[#a8926e]">{hint}</p>
      </div>
      {hasCurrent ? <p className="mt-1 text-xs text-amber-200/80">{warning}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x… new address"
          disabled={!canSet}
          className="min-w-0 flex-1 rounded-sm border border-[#c9a15a]/40 bg-[#3a2918]/16 px-2.5 py-1.5 font-mono text-xs text-[#3a2918] placeholder:text-[#a8926e] disabled:opacity-40"
        />
        <ActionButton
          label="Set"
          enabled={canSet && valid}
          onClick={() => void onSubmit(value as Address).then(() => setValue(""))}
          pending={isPending(action.state)}
          reason={!canSet ? `Connected wallet lacks ${roleKey} on this name` : undefined}
        />
      </div>
      <TxStatus state={action.state} txHash={action.txHash} error={action.error} />
    </div>
  );
}

function isPending(state: ReturnType<typeof useTxAction>["state"]): boolean {
  return state === "signing" || state === "confirming";
}
