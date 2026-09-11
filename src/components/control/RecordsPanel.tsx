"use client";

import { useState } from "react";
import { encodeFunctionData, isAddress, isHex, zeroAddress, type Address, type Hex } from "viem";
import { ethRegistryAbi, permissionedResolverAbi } from "@/lib/contracts/abis";
import { CONTENTHASH_PROTOCOLS, encodeContenthash, type ContenthashProtocol } from "@/lib/ens/contenthash";
import { useDeployResolver } from "@/lib/ens/useDeployResolver";
import { useEnsNameRoles, type EnsNameState, type EnsNameRoles } from "@/lib/ens/useEnsName";
import { useResolverRecords, WELL_KNOWN_TEXT_KEYS, COIN_TYPE_ETH } from "@/lib/ens/useResolverRecords";
import { useTxAction } from "@/lib/ens/useTxAction";
import { TxStatus } from "@/components/shared/TxStatus";
import { Panel } from "./Panel";

/// A handful of ENSIP-11 EVM coin types worth offering as one-click rows — `0x80000000 | chainId`,
/// not invented — plus a free "custom coin type" row for anything else. Task 35 only implements the
/// EVM-address encoding (20 bytes, no non-EVM base58/bech32 codecs), which is exactly what
/// `PermissionedResolver.setAddr`'s own `InvalidEVMAddress` check enforces for these coin types.
const CHAIN_PRESETS: { label: string; coinType: bigint }[] = [
  { label: "Base", coinType: 2147492101n },
  { label: "Optimism", coinType: 2147483658n },
  { label: "Arbitrum One", coinType: 2147525809n },
  { label: "Polygon", coinType: 2147483785n },
];

type TextEdit = { kind: "text"; key: string; value: string };
type AddrEdit = { kind: "addr"; coinType: bigint; value: string };
type ContenthashEdit = { kind: "contenthash"; protocol: ContenthashProtocol; value: string };
type DataEdit = { kind: "data"; key: string; value: string };
type PendingEdit = TextEdit | AddrEdit | ContenthashEdit | DataEdit;

const textId = (key: string) => `text:${key}`;
const addrId = (coinType: bigint) => `addr:${coinType.toString()}`;
const dataId = (key: string) => `data:${key}`;
const CONTENTHASH_ID = "contenthash";

/// Task 35: the panel that gives a name something to *be*. Every write here goes through
/// `PermissionedResolver`'s own setters, batched into one `multicall` transaction, and every field
/// is gated on the EACL role that setter actually checks — the other half of task 34's delegation.
export function RecordsPanel({ state }: { state: EnsNameState }) {
  const { data: connectedRoles } = useEnsNameRoles(state);
  const resolverAddress = state.resolver && state.resolver !== zeroAddress ? state.resolver : null;

  if (!resolverAddress) {
    return <NoResolverPanel state={state} connectedRoles={connectedRoles} />;
  }

  return <RecordsEditor state={state} resolver={resolverAddress} connectedRoles={connectedRoles} />;
}

/// "A name whose resolver == address(0) cannot hold records. Say so, and link to the flow that sets
/// one — do not silently render an editor that will revert." Task 37 owns the full re-point flow
/// (resolver picker, "records live per resolver" warning) for a name that's *switching* resolvers;
/// this state is the simpler one — there's nothing to lose yet — so it gets a full self-service
/// path: deploy a fresh `PermissionedResolver` proxy for this exact name, no separate resolver
/// operator or backend deploy needed, then point the name at it. A manual address field stays
/// underneath for anyone who already has a resolver they'd rather reuse.
function NoResolverPanel({
  state,
  connectedRoles,
}: {
  state: EnsNameState;
  connectedRoles: EnsNameRoles | null | undefined;
}) {
  const [resolverInput, setResolverInput] = useState("");
  const setResolverAction = useTxAction();
  const deployResolver = useDeployResolver();

  const canSetResolver = !!connectedRoles?.registryRoles.find((r) => r.def.key === "ROLE_SET_RESOLVER")?.held;
  const validAddress = isAddress(resolverInput);
  const deployedAddress = deployResolver.resolverAddress;

  async function submit(address: string) {
    if (!isAddress(address) || !state.registry || state.tokenId === null) return;
    await setResolverAction
      .send({
        address: state.registry as Address,
        abi: ethRegistryAbi,
        functionName: "setResolver",
        args: [state.tokenId, address as Address],
      })
      .catch(() => {});
  }

  return (
    <Panel title="Records" subtitle={<code>PermissionedResolver</code>}>
      <p className="text-sm text-white/60">
        <span className="font-mono text-white/80">{state.name}</span> has no resolver set (
        <code>getResolver</code> returns <code>address(0)</code>), so it cannot hold any address, text
        or contenthash record — every setter on a resolver reverts without one. Point this name at a
        resolver first.
      </p>
      {!state.isPermissionedRegistry ? (
        <p className="mt-3 text-sm text-white/40 italic">
          This name&apos;s registry isn&apos;t a <code>PermissionedRegistry</code>, so there is no
          on-chain way for this panel to set one.
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-white/50 uppercase">
              Deploy your own resolver
            </label>
            <p className="mb-2 text-xs text-white/50">
              <code>VerifiableFactory.deployProxy</code> over ENSv2&apos;s verified{" "}
              <code>PermissionedResolver</code> implementation — your wallet becomes its sole admin,
              holding every record-setter role, ready to delegate pieces of it away with task 34&apos;s
              panel above.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => deployResolver.deployFor(state.name)}
                disabled={
                  !canSetResolver || deployResolver.state === "signing" || deployResolver.state === "confirming"
                }
                title={!canSetResolver ? "Requires ROLE_SET_RESOLVER on this name" : undefined}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Deploy resolver
              </button>
              <TxStatus state={deployResolver.state} txHash={deployResolver.txHash} error={deployResolver.error} />
            </div>
            {deployedAddress ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                <span className="font-mono text-xs text-emerald-300">{deployedAddress}</span>
                <button
                  type="button"
                  onClick={() => submit(deployedAddress)}
                  disabled={setResolverAction.state === "signing" || setResolverAction.state === "confirming"}
                  className="rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Use as this name&apos;s resolver
                </button>
                <TxStatus state={setResolverAction.state} txHash={setResolverAction.txHash} error={setResolverAction.error} />
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <label className="mb-1.5 block text-xs font-medium tracking-wide text-white/50 uppercase">
              Or point at an existing resolver (<code>setResolver(tokenId, resolver)</code>)
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                value={resolverInput}
                onChange={(e) => setResolverInput(e.target.value)}
                placeholder="0x…"
                disabled={!canSetResolver}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30 disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => submit(resolverInput)}
                disabled={
                  !canSetResolver ||
                  !validAddress ||
                  setResolverAction.state === "signing" ||
                  setResolverAction.state === "confirming"
                }
                title={!canSetResolver ? "Requires ROLE_SET_RESOLVER on this name" : undefined}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Set resolver
              </button>
            </div>
            {!canSetResolver ? (
              <p className="mt-1.5 text-xs text-white/40">
                Requires <code>ROLE_SET_RESOLVER</code>, which this wallet does not hold on this name.
              </p>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}

function RecordsEditor({
  state,
  resolver,
  connectedRoles,
}: {
  state: EnsNameState;
  resolver: Address;
  connectedRoles: EnsNameRoles | null | undefined;
}) {
  const { data: records, isPending: recordsPending } = useResolverRecords(state);
  const [pending, setPending] = useState<Map<string, PendingEdit>>(new Map());
  const [extraTextKeys, setExtraTextKeys] = useState<string[]>([]);
  const [extraCoinTypes, setExtraCoinTypes] = useState<bigint[]>([]);
  const [newTextKey, setNewTextKey] = useState("");
  const [newChainCoinType, setNewChainCoinType] = useState("");
  const [contenthashProtocol, setContenthashProtocol] = useState<ContenthashProtocol>(
    records?.contenthash?.protocol ?? "ipfs"
  );
  const [contenthashError, setContenthashError] = useState<string | null>(null);

  const save = useTxAction();
  const clear = useTxAction();
  const [clearConfirmText, setClearConfirmText] = useState("");

  // A resolver without `roles()` (not a `PermissionedResolver`) has nothing this editor can write
  // to safely — read values stay visible, every write control goes inert.
  const isEacl = connectedRoles?.resolverRoles !== null && connectedRoles?.resolverRoles !== undefined;
  const roleHeld = (key: string) => !!connectedRoles?.resolverRoles?.find((r) => r.def.key === key)?.held;
  const canText = isEacl && roleHeld("ROLE_SET_TEXT");
  const canAddr = isEacl && roleHeld("ROLE_SET_ADDR");
  const canContenthash = isEacl && roleHeld("ROLE_SET_CONTENTHASH");
  const canData = isEacl && roleHeld("ROLE_SET_DATA");
  const canClear = isEacl && roleHeld("ROLE_CLEAR");

  // Reset **during render** (this codebase's established "adjusting state when a prop changes"
  // pattern — see `useClaimName`'s `storedCache`/`accountKey` — rather than a `useEffect`+setState)
  // once a batch confirms: local edits clear on the same render that first sees `save.state` flip
  // to "confirmed", guarded by comparing it against the last-seen value so this can't loop.
  const [lastSaveState, setLastSaveState] = useState(save.state);
  if (save.state !== lastSaveState) {
    setLastSaveState(save.state);
    if (save.state === "confirmed") {
      setPending(new Map());
      setExtraTextKeys([]);
      setExtraCoinTypes([]);
    }
  }

  function setEdit(id: string, edit: PendingEdit | null) {
    setPending((prev) => {
      const next = new Map(prev);
      if (edit === null) next.delete(id);
      else next.set(id, edit);
      return next;
    });
  }

  const textKeys = [...(records?.textKeys ?? WELL_KNOWN_TEXT_KEYS), ...extraTextKeys.filter((k) => !(records?.textKeys ?? []).includes(k))];
  const currentText = (key: string) => records?.texts[key] ?? "";
  const displayText = (key: string) => {
    const edit = pending.get(textId(key));
    return edit && edit.kind === "text" ? edit.value : currentText(key);
  };
  function onTextChange(key: string, value: string) {
    if (value === currentText(key)) setEdit(textId(key), null);
    else setEdit(textId(key), { kind: "text", key, value });
  }

  const coinTypes = [COIN_TYPE_ETH, ...(records?.otherAddresses.map((a) => a.coinType) ?? []), ...extraCoinTypes.filter(
    (c) => c !== COIN_TYPE_ETH && !(records?.otherAddresses ?? []).some((a) => a.coinType === c)
  )];
  const currentAddr = (coinType: bigint) =>
    coinType === COIN_TYPE_ETH ? (records?.ethAddress ?? "") : (records?.otherAddresses.find((a) => a.coinType === coinType)?.addressBytes ?? "");
  const displayAddr = (coinType: bigint) => {
    const edit = pending.get(addrId(coinType));
    return edit && edit.kind === "addr" ? edit.value : currentAddr(coinType);
  };
  function onAddrChange(coinType: bigint, value: string) {
    if (value === currentAddr(coinType)) setEdit(addrId(coinType), null);
    else setEdit(addrId(coinType), { kind: "addr", coinType, value });
  }

  const currentContenthash = records?.contenthash;
  // Same render-time-adjustment idiom as `lastSaveState` above: the protocol selector starts on
  // "ipfs" before the first read lands, then syncs to whatever this name's contenthash actually
  // decodes to — once, the first time a read produces one, so it never fights a user's own pick.
  const [lastSeenProtocol, setLastSeenProtocol] = useState<ContenthashProtocol | null>(null);
  if (currentContenthash && currentContenthash.protocol !== lastSeenProtocol) {
    setLastSeenProtocol(currentContenthash.protocol);
    if (!pending.has(CONTENTHASH_ID)) setContenthashProtocol(currentContenthash.protocol);
  }
  const contenthashEdit = pending.get(CONTENTHASH_ID);
  const displayContenthashValue =
    contenthashEdit && contenthashEdit.kind === "contenthash" ? contenthashEdit.value : (currentContenthash?.value ?? "");
  function onContenthashChange(protocol: ContenthashProtocol, value: string) {
    setContenthashProtocol(protocol);
    setContenthashError(null);
    const unchanged = value === (currentContenthash?.value ?? "") && protocol === (currentContenthash?.protocol ?? protocol);
    if (unchanged) {
      setEdit(CONTENTHASH_ID, null);
      return;
    }
    if (value === "") {
      setEdit(CONTENTHASH_ID, { kind: "contenthash", protocol, value: "" });
      return;
    }
    try {
      encodeContenthash(protocol, value); // validate eagerly so the error shows before signing
      setEdit(CONTENTHASH_ID, { kind: "contenthash", protocol, value });
    } catch (err) {
      setContenthashError(err instanceof Error ? err.message : String(err));
      setEdit(CONTENTHASH_ID, null);
    }
  }

  const dirty = pending.size > 0;

  async function submit() {
    const node = state.node;
    const calls: Hex[] = [];
    for (const edit of pending.values()) {
      if (edit.kind === "text") {
        calls.push(encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [node, edit.key, edit.value] }));
      } else if (edit.kind === "addr") {
        const bytes: Hex = edit.value === "" ? "0x" : (edit.value as Hex);
        calls.push(encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setAddr", args: [node, edit.coinType, bytes] }));
      } else if (edit.kind === "contenthash") {
        const bytes: Hex = edit.value === "" ? "0x" : encodeContenthash(edit.protocol, edit.value);
        calls.push(encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setContenthash", args: [node, bytes] }));
      } else if (edit.kind === "data") {
        const bytes: Hex = edit.value === "" ? "0x" : (edit.value as Hex);
        calls.push(encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setData", args: [node, edit.key, bytes] }));
      }
    }
    if (calls.length === 0) return;
    await save
      .send({ address: resolver, abi: permissionedResolverAbi, functionName: "multicall", args: [calls] })
      .catch(() => {});
  }

  async function submitClear() {
    if (clearConfirmText !== state.name) return;
    clear.reset();
    await clear
      .send({ address: resolver, abi: permissionedResolverAbi, functionName: "clearRecords", args: [state.node] })
      .catch(() => {});
    setClearConfirmText("");
  }

  return (
    <Panel
      title="Records"
      subtitle={
        <>
          <code>PermissionedResolver</code> · edits are queued below, then sent as one{" "}
          <code>multicall</code>.
        </>
      }
    >
      {!isEacl ? (
        <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
          This resolver doesn&apos;t implement <code>IEnhancedAccessControl</code> (<code>roles()</code>{" "}
          reverts), so this panel can show what it currently returns but can&apos;t safely gate or
          send writes to it.
        </p>
      ) : null}

      {recordsPending ? <p className="text-sm text-white/40">Reading records…</p> : null}

      <Section
        title="Text records"
        hint="setText(node, key, value)"
        allowed={canText}
        roleKey="ROLE_SET_TEXT"
      >
        <div className="space-y-2">
          {textKeys.map((key) => (
            <TextRow key={key} textKey={key} value={displayText(key)} disabled={!canText} onChange={(v) => onTextChange(key, v)} />
          ))}
        </div>
        {canText ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
            <input
              value={newTextKey}
              onChange={(e) => setNewTextKey(e.target.value)}
              placeholder="custom key, e.g. org.example"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={() => {
                const key = newTextKey.trim();
                if (!key || textKeys.includes(key)) return;
                setExtraTextKeys((prev) => [...prev, key]);
                setNewTextKey("");
              }}
              disabled={!newTextKey.trim()}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Add key
            </button>
          </div>
        ) : null}
      </Section>

      <Section title="Addresses" hint="setAddr(node, coinType, addressBytes)" allowed={canAddr} roleKey="ROLE_SET_ADDR">
        <div className="space-y-2">
          {coinTypes.map((coinType) => (
            <AddrRow
              key={coinType.toString()}
              coinType={coinType}
              value={displayAddr(coinType)}
              disabled={!canAddr}
              onChange={(v) => onAddrChange(coinType, v)}
            />
          ))}
        </div>
        {canAddr ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
            {CHAIN_PRESETS.filter((p) => !coinTypes.includes(p.coinType)).map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setExtraCoinTypes((prev) => [...prev, p.coinType])}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
              >
                + {p.label}
              </button>
            ))}
            <input
              value={newChainCoinType}
              onChange={(e) => setNewChainCoinType(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="custom coin type (ENSIP-11)"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={() => {
                if (!newChainCoinType) return;
                const coinType = BigInt(newChainCoinType);
                if (coinTypes.includes(coinType)) return;
                setExtraCoinTypes((prev) => [...prev, coinType]);
                setNewChainCoinType("");
              }}
              disabled={!newChainCoinType}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Add chain
            </button>
          </div>
        ) : null}
      </Section>

      <Section title="Website" hint="setContenthash(node, hash)" allowed={canContenthash} roleKey="ROLE_SET_CONTENTHASH">
        <div className="flex flex-wrap gap-2">
          <select
            value={contenthashProtocol}
            onChange={(e) => onContenthashChange(e.target.value as ContenthashProtocol, displayContenthashValue)}
            disabled={!canContenthash}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white disabled:opacity-40"
          >
            {CONTENTHASH_PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            value={displayContenthashValue}
            onChange={(e) => onContenthashChange(contenthashProtocol, e.target.value)}
            disabled={!canContenthash}
            placeholder={contenthashProtocol === "swarm" ? "0x… (32-byte hash)" : "CID"}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30 disabled:opacity-40"
          />
        </div>
        {contenthashError ? <p className="mt-1.5 text-xs text-red-400">{contenthashError}</p> : null}
      </Section>

      <DataSection pending={pending} setEdit={setEdit} canData={canData} />

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || save.state === "signing" || save.state === "confirming"}
          className="rounded-lg bg-sky-500/90 px-4 py-2 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Save changes {dirty ? `(${pending.size})` : ""}
        </button>
        <TxStatus state={save.state} txHash={save.txHash} error={save.error} />
      </div>

      <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-red-300 uppercase">Danger zone — clear all records</h3>
        <p className="mb-2 text-xs text-white/50">
          <code>clearRecords(node)</code> bumps the record version, wiping every address/text/contenthash record for{" "}
          <span className="font-mono text-white/70">{state.name}</span> at once. Not reversible.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            disabled={!canClear}
            placeholder={`type "${state.name}" to confirm`}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30 disabled:opacity-40"
          />
          <button
            type="button"
            onClick={submitClear}
            disabled={!canClear || clearConfirmText !== state.name || clear.state === "signing" || clear.state === "confirming"}
            title={!canClear ? "Requires ROLE_CLEAR on the resolver" : undefined}
            className="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Clear all records
          </button>
        </div>
        {!canClear ? <p className="mt-1.5 text-xs text-white/40">Requires <code>ROLE_CLEAR</code>, which this wallet does not hold on this resolver.</p> : null}
        <div className="mt-2">
          <TxStatus state={clear.state} txHash={clear.txHash} error={clear.error} />
        </div>
      </div>
    </Panel>
  );
}

function Section({
  title,
  hint,
  allowed,
  roleKey,
  children,
}: {
  title: string;
  hint: string;
  allowed: boolean;
  roleKey: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 border-b border-white/5 pb-5 last:mb-0 last:border-b-0 last:pb-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-white/70 uppercase">{title}</h3>
        <span className="font-mono text-[11px] text-white/30">{hint}</span>
      </div>
      {!allowed ? (
        <p className="mb-2 text-xs text-white/40">
          Disabled — requires <code>{roleKey}</code>, which this wallet does not hold on the resolver.
        </p>
      ) : null}
      {children}
    </div>
  );
}

function TextRow({
  textKey,
  value,
  disabled,
  onChange,
}: {
  textKey: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const isKnown = (WELL_KNOWN_TEXT_KEYS as readonly string[]).includes(textKey);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`w-32 shrink-0 font-mono text-xs ${isKnown ? "text-white/70" : "text-white/50 italic"}`}>{textKey}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 disabled:opacity-40"
        />
      </div>
      {textKey === "avatar" ? <AvatarPreview value={value} /> : null}
    </div>
  );
}

function AvatarPreview({ value }: { value: string }) {
  const [failed, setFailed] = useState(false);
  const src = value.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${value.slice("ipfs://".length)}` : value;
  const previewable = /^(https?:\/\/|ipfs:\/\/|data:image\/)/.test(value);

  if (!value) return null;
  if (!previewable) return <p className="ml-[8.5rem] mt-1 text-[11px] text-white/30 italic">No preview for this avatar reference.</p>;

  return (
    <div className="ml-[8.5rem] mt-1.5">
      {failed ? (
        <p className="text-[11px] text-white/30 italic">Preview failed to load.</p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="avatar preview" onError={() => setFailed(true)} className="h-12 w-12 rounded-full border border-white/10 object-cover" />
      )}
    </div>
  );
}

function AddrRow({
  coinType,
  value,
  disabled,
  onChange,
}: {
  coinType: bigint;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const label = coinType === COIN_TYPE_ETH ? "ETH" : `#${coinType.toString()}`;
  const invalid = value !== "" && !isAddress(value) && !isHex(value);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-32 shrink-0 font-mono text-xs text-white/70">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0x…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30 disabled:opacity-40"
        />
      </div>
      {invalid ? <p className="ml-[8.5rem] mt-1 text-[11px] text-red-400">Not a valid address/hex value.</p> : null}
    </div>
  );
}

/// Task 35's table calls out `setData` as one of the "Advanced" row's setters, alongside
/// `setPubkey`/`setABI`/`setInterface` — those three are left out here: rarely used, each with its
/// own bespoke encoding, and not called out in any acceptance criterion. `setData` alone (arbitrary
/// `bytes` keyed by string, the same shape as text records) is worth the small amount of UI it
/// takes.
function DataSection({
  pending,
  setEdit,
  canData,
}: {
  pending: Map<string, PendingEdit>;
  setEdit: (id: string, edit: PendingEdit | null) => void;
  canData: boolean;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pendingEntries = [...pending.values()].filter((e): e is DataEdit => e.kind === "data");

  function add() {
    setError(null);
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    if (value !== "" && !/^0x([0-9a-fA-F]{2})*$/.test(value)) {
      setError("Value must be 0x-prefixed hex bytes (or empty to clear).");
      return;
    }
    setEdit(dataId(trimmedKey), { kind: "data", key: trimmedKey, value });
    setKey("");
    setValue("");
  }

  return (
    <Section title="Advanced — data records" hint="setData(node, key, value)" allowed={canData} roleKey="ROLE_SET_DATA">
      {pendingEntries.length > 0 ? (
        <ul className="mb-2 space-y-1">
          {pendingEntries.map((edit) => (
            <li key={edit.key} className="flex items-center gap-2 font-mono text-xs text-white/70">
              <span className="w-32 shrink-0 truncate">{edit.key}</span>
              <span className="min-w-0 flex-1 truncate text-white/50">{edit.value || "(clear)"}</span>
              <button type="button" onClick={() => setEdit(dataId(edit.key), null)} className="text-white/40 hover:text-white">
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {canData ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="key"
            className="w-32 shrink-0 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0x… value, or empty to clear"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={add}
            disabled={!key.trim()}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-white uppercase transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Queue
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1.5 text-xs text-red-400">{error}</p> : null}
    </Section>
  );
}
