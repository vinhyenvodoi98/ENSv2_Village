"use client";

import { useEffect } from "react";
import { useFoundKingdom } from "@/lib/ens";
import { truncateAddress } from "@/lib/format";
import { TxStatus } from "@/components/shared/TxStatus";

const continueClass = [
  "w-fit rounded-sm border-2 px-5 py-1.5 font-serif text-sm font-bold uppercase tracking-wide",
  "transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-[2px]",
  "disabled:pointer-events-none disabled:opacity-50",
  "border-[#c9a15a] bg-gradient-to-b from-[#8e1f2b] to-[#4c0f16] text-[#f3e6c8]",
  "shadow-[0_3px_0_0_#3d0d13] active:shadow-[0_1px_0_0_#3d0d13]",
].join(" ");

function MonoTag({ text }: { text: string }) {
  return <p className="font-mono text-[11px] text-[#8f7652]">{text}</p>;
}

/// Task 32: "found your kingdom" — the second act after task 31's claim wizard. Presentation
/// only; `useFoundKingdom` owns the two chain-verified stages (register the ledger, raise the
/// signpost) plus localStorage recovery. Same "royal charter" visual language as
/// `ClaimNameWizard`, but its own distinct modal — this is a deliberately separate action a user
/// can skip and come back to later, not a continuation of the claim flow.
export function FoundKingdomWizard({
  open,
  onClose,
  kingdomName,
  tokenId,
  onFounded,
}: {
  open: boolean;
  onClose: () => void;
  kingdomName: string;
  tokenId: bigint;
  onFounded: () => void;
}) {
  const found = useFoundKingdom(open ? kingdomName : null, open ? tokenId : null);

  useEffect(() => {
    if (found.stage1.done && found.stage2.done) onFounded();
  }, [found.stage1.done, found.stage2.done, onFounded]);

  if (!open) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close found-kingdom wizard"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-sm border-2 border-[#c9a15a] bg-[#ece1c8] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-2 -top-2 z-20 rounded-full border border-[#c9a15a] bg-zinc-900 p-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          ✕
        </button>

        <div className="border-b-2 border-[#c9a15a] bg-gradient-to-b from-[#8e1f2b] to-[#5a141c] px-4 py-2.5">
          <h2 className="font-serif text-xs font-bold uppercase tracking-[0.2em] text-[#f3e6c8]">
            ⚑ Found your kingdom — {kingdomName}
          </h2>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {found.loading ? (
            <p className="text-sm text-[#5c4b32]">Reading kingdom state from Sepolia…</p>
          ) : (
            <>
              <Stage
                index={1}
                title="Establish & appoint the ledger"
                mono="AgentRegistry() → ETHRegistry.setSubregistry(uint256,address)"
                done={found.stage1.done}
              >
                {found.stage1.blockedReason ? (
                  <p className="text-xs text-red-700">Can&apos;t proceed — {found.stage1.blockedReason}.</p>
                ) : found.stage1.done ? (
                  <p className="text-sm text-emerald-700">
                    ✓ Ledger established at{" "}
                    <span className="font-mono">{found.stage1.agentRegistryAddress && truncateAddress(found.stage1.agentRegistryAddress)}</span>
                  </p>
                ) : (
                  <>
                    {!found.stage1.agentRegistryAddress ? (
                      <>
                        <button type="button" onClick={() => found.stage1.deployRegistry.run()} className={continueClass}>
                          Deploy AgentRegistry
                        </button>
                        <TxStatus
                          state={found.stage1.deployRegistry.state}
                          txHash={found.stage1.deployRegistry.txHash ?? undefined}
                          error={found.stage1.deployRegistry.error}
                        />
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-[#5c4b32]">
                          Deployed at <span className="font-mono">{truncateAddress(found.stage1.agentRegistryAddress)}</span> — now link it
                          to <span className="font-mono">{kingdomName}</span>.
                        </p>
                        <button type="button" onClick={() => found.stage1.linkRegistry.run()} className={continueClass}>
                          Link registry
                        </button>
                        <TxStatus
                          state={found.stage1.linkRegistry.state}
                          txHash={found.stage1.linkRegistry.txHash}
                          error={found.stage1.linkRegistry.error}
                        />
                      </>
                    )}
                  </>
                )}
              </Stage>

              <Stage
                index={2}
                title="Raise the signpost"
                mono="WildcardStateStore() → WildcardResolver() → ETHRegistry.setResolver(uint256,address)"
                done={found.stage2.done}
                disabled={!found.stage1.done}
              >
                {!found.stage1.done ? (
                  <p className="text-xs text-[#8f7652]">Finish stage 1 first.</p>
                ) : found.stage2.blockedReason ? (
                  <p className="text-xs text-red-700">Can&apos;t proceed — {found.stage2.blockedReason}.</p>
                ) : found.stage2.done ? (
                  <p className="text-sm text-emerald-700">
                    ✓ Signpost raised at{" "}
                    <span className="font-mono">{found.stage2.wildcardResolverAddress && truncateAddress(found.stage2.wildcardResolverAddress)}</span>
                  </p>
                ) : !found.stage2.wildcardStateStoreAddress ? (
                  <>
                    <button type="button" onClick={() => found.stage2.deployStateStore.run()} className={continueClass}>
                      Deploy WildcardStateStore
                    </button>
                    <TxStatus
                      state={found.stage2.deployStateStore.state}
                      txHash={found.stage2.deployStateStore.txHash ?? undefined}
                      error={found.stage2.deployStateStore.error}
                    />
                  </>
                ) : !found.stage2.wildcardResolverAddress ? (
                  <>
                    <button type="button" onClick={() => found.stage2.deployResolver.run()} className={continueClass}>
                      Deploy WildcardResolver
                    </button>
                    <TxStatus
                      state={found.stage2.deployResolver.state}
                      txHash={found.stage2.deployResolver.txHash ?? undefined}
                      error={found.stage2.deployResolver.error}
                    />
                  </>
                ) : (
                  <>
                    <p className="text-xs text-[#5c4b32]">
                      Deployed at <span className="font-mono">{truncateAddress(found.stage2.wildcardResolverAddress)}</span> — now raise it as{" "}
                      <span className="font-mono">{kingdomName}</span>&apos;s signpost.
                    </p>
                    <button type="button" onClick={() => found.stage2.linkResolver.run()} className={continueClass}>
                      Link resolver
                    </button>
                    <TxStatus
                      state={found.stage2.linkResolver.state}
                      txHash={found.stage2.linkResolver.txHash}
                      error={found.stage2.linkResolver.error}
                    />
                  </>
                )}
              </Stage>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stage({
  index,
  title,
  mono,
  done,
  disabled,
  children,
}: {
  index: number;
  title: string;
  mono: string;
  done: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 ${disabled ? "opacity-50" : ""}`}>
      <h3 className="font-serif text-sm font-bold uppercase tracking-wide text-[#3a2f22]">
        {done ? "✓" : index}. {title}
      </h3>
      <MonoTag text={mono} />
      {children}
    </div>
  );
}
