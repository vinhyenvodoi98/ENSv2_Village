"use client";

import { useState } from "react";
import type { Address } from "viem";
import { ethRegistryAbi } from "@/lib/contracts/abis";
import { CLAIM_DURATION_OPTIONS, useClaimName, useEnsName } from "@/lib/ens";
import { useDeployResolver } from "@/lib/ens/useDeployResolver";
import { useTxAction } from "@/lib/ens/useTxAction";
import { formatTokenAmount } from "@/lib/format";
import { TxStatus } from "@/components/shared/TxStatus";

const STEP_TITLES = [
  { n: 1, title: "Choose a name", mono: "ETHRegistrar.isAvailable(string)" },
  { n: 2, title: "Treasury", mono: "MockUSDC.balanceOf / mint" },
  { n: 3, title: "Authorize payment", mono: "MockUSDC.approve(address,uint256)" },
  { n: 4, title: "Seal the pledge", mono: "ETHRegistrar.commit(bytes32)" },
  { n: 5, title: "Wait 60 seconds", mono: "ETHRegistrar.commitmentAt(bytes32)" },
  { n: 6, title: "Claim the land", mono: "ETHRegistrar.register(...)" },
  { n: 7, title: "Set up your resolver", mono: "VerifiableFactory.deployProxy(...)" },
] as const;

const continueClass = [
  "w-fit rounded-sm border-2 px-5 py-1.5 font-serif text-sm font-bold uppercase tracking-wide",
  "transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-[2px]",
  "disabled:pointer-events-none disabled:opacity-50",
  "border-[#c9a15a] bg-gradient-to-b from-[#8e1f2b] to-[#4c0f16] text-[#f3e6c8]",
  "shadow-[0_3px_0_0_#3d0d13] active:shadow-[0_1px_0_0_#3d0d13]",
].join(" ");

/// Task 31, section 3: presentation-only wizard — `useClaimName` owns every bit of state,
/// persistence and chain reconciliation; this component only draws what it returns. The modal
/// shell reuses `WorldRoot.tsx`'s existing spawn-form overlay convention, styled as a "royal
/// charter" (parchment/scroll) to read as an in-world action rather than a wallet widget.
export function ClaimNameWizard({
  open,
  onClose,
  onClaimed,
}: {
  open: boolean;
  onClose: () => void;
  onClaimed: (name: string) => void;
}) {
  const claim = useClaimName();

  // Resets to step 1 whenever the wizard transitions open — a render-phase adjustment (guarded
  // by comparing `open`), not an effect, so there's no stale frame showing the previous session's
  // step before the reset lands. Irrelevant once `claim.stored` exists: `displayStep` below
  // ignores `formStep` entirely once a pledge is in flight. Step 7 ("set up your resolver") is
  // reached the same way step 1-3 are — `formStep` set directly — since `claim.step` itself never
  // goes past 6 (it's derived from the commit/reveal record, which is gone the instant `register`
  // confirms).
  const [formStepCache, setFormStepCache] = useState<{ openKey: boolean; step: 1 | 2 | 3 | 7 }>({
    openKey: open,
    step: 1,
  });
  if (formStepCache.openKey !== open) {
    setFormStepCache({ openKey: open, step: 1 });
  }
  const formStep = formStepCache.step;
  const setFormStep = (step: 1 | 2 | 3 | 7) => setFormStepCache({ openKey: open, step });

  // Land on step 7 instead of closing immediately — a freshly registered name always has
  // `resolver == address(0)` (`useClaimName.ts`'s `commit()` hardcodes it), so this is the one
  // moment to explain *why* and offer the self-service fix before the wizard disappears. Same
  // render-phase-adjustment idiom as the `openKey` reset above and `useClaimName`'s own
  // `storedCache`/`accountKey`: guarded by comparing against the last-seen claimed name so it
  // fires exactly once per successful claim, not a `useEffect`+setState.
  const [lastClaimedName, setLastClaimedName] = useState<string | null>(null);
  if (claim.claimedName && claim.claimedName !== lastClaimedName) {
    setLastClaimedName(claim.claimedName);
    setFormStepCache({ openKey: open, step: 7 });
  }

  if (!open) return null;

  const displayStep = claim.stored ? claim.step : formStep;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close claim-name wizard"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 flex w-full max-w-2xl overflow-hidden rounded-sm border-2 border-[#c9a15a] bg-[#ece1c8] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-2 -top-2 z-20 rounded-full border border-[#c9a15a] bg-zinc-900 p-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          ✕
        </button>

        {/* Left: stepper, all 6 stages visible from the start. */}
        <div className="flex w-48 shrink-0 flex-col gap-1 border-r-2 border-[#c9a15a] bg-gradient-to-b from-[#8e1f2b] to-[#5a141c] p-4">
          <h2 className="mb-3 font-serif text-xs font-bold uppercase tracking-[0.2em] text-[#f3e6c8]">
            Royal Charter
          </h2>
          {STEP_TITLES.map(({ n, title }) => (
            <div
              key={n}
              className={`flex items-start gap-2 rounded-sm px-2 py-1.5 text-xs ${
                n === displayStep ? "bg-black/25 text-[#f3e6c8]" : "text-[#e0bd7a]/70"
              }`}
            >
              <span className="font-mono">{n < displayStep ? "✓" : n}</span>
              <span className="font-serif font-semibold uppercase tracking-wide">{title}</span>
            </div>
          ))}
        </div>

        {/* Right: current stage's content. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          {displayStep === 1 && <StepChooseName claim={claim} onContinue={() => setFormStep(2)} />}
          {displayStep === 2 && (
            <StepTreasury claim={claim} onContinue={() => setFormStep(3)} onBack={() => setFormStep(1)} />
          )}
          {displayStep === 3 && <StepAuthorize claim={claim} onBack={() => setFormStep(2)} />}
          {displayStep === 4 && <StepSeal claim={claim} />}
          {displayStep === 5 && <StepWait claim={claim} />}
          {displayStep === 6 && <StepClaim claim={claim} />}
          {displayStep === 7 && claim.claimedName && (
            <StepSetupResolver
              name={claim.claimedName}
              onDone={() => {
                onClaimed(claim.claimedName as string);
                onClose();
              }}
            />
          )}

          {claim.stored && (
            <div className="mt-2 border-t border-[#8f7652]/30 pt-3">
              <DiscardButton claim={claim} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ClaimNameState = ReturnType<typeof useClaimName>;

function MonoTag({ text }: { text: string }) {
  return <p className="font-mono text-[11px] text-[#8f7652]">{text}</p>;
}

function StepChooseName({ claim, onContinue }: { claim: ClaimNameState; onContinue: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#3a2f22]">Choose a name</h3>
      <MonoTag text="ETHRegistrar.isAvailable(string)" />

      <input
        value={claim.label}
        onChange={(e) => claim.setLabel(e.target.value)}
        placeholder="your-kingdom"
        className="rounded-sm border border-[#8f7652]/50 bg-[#f6efdc] px-3 py-2 font-mono text-sm text-[#3a2f22] placeholder:text-[#8f7652] focus:border-[#c9a15a] focus:outline-none"
      />

      {claim.labelError && <p className="text-xs text-red-700">{claim.labelError}</p>}

      {claim.normalizedLabel && (
        <p className="break-all font-serif text-2xl font-bold text-[#3a2f22]">{claim.normalizedLabel}.eth</p>
      )}

      <p className="text-xs text-[#5c4b32]">
        {claim.availability === "checking" && "Checking availability…"}
        {claim.availability === "available" && <span className="text-emerald-700">✓ Available</span>}
        {claim.availability === "taken" && <span className="text-red-700">✕ Already taken</span>}
      </p>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#5c4b32]">Duration</p>
        <div className="flex gap-2">
          {CLAIM_DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => claim.setDuration(opt.seconds)}
              className={`rounded-sm border px-3 py-1 text-xs font-semibold ${
                claim.duration === opt.seconds
                  ? "border-[#c9a15a] bg-[#8e1f2b] text-[#f3e6c8]"
                  : "border-[#8f7652]/50 bg-[#f6efdc] text-[#3a2f22]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={claim.availability !== "available"}
        title={claim.availability !== "available" ? "Choose an available name first." : undefined}
        onClick={onContinue}
        className={continueClass}
      >
        Continue
      </button>
    </div>
  );
}

function StepTreasury({
  claim,
  onContinue,
  onBack,
}: {
  claim: ClaimNameState;
  onContinue: () => void;
  onBack: () => void;
}) {
  const treasury = claim.treasury;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#3a2f22]">Treasury</h3>
      <MonoTag text="ETHRegistrar.getRegisterPrice(string,uint64,address)" />

      {treasury ? (
        <div className="rounded-sm border border-[#8f7652]/30 bg-[#f6efdc] p-3 text-sm text-[#3a2f22]">
          <p>Base: {formatTokenAmount(treasury.base, treasury.decimals)} USDC</p>
          {treasury.premium > 0n && (
            <>
              <p>Premium: {formatTokenAmount(treasury.premium, treasury.decimals)} USDC</p>
              <p className="mt-1 text-xs text-[#5c4b32]">
                The premium is a decaying auction on a recently-expired name — it falls over time, which is why
                the next step approves with headroom.
              </p>
            </>
          )}
          <p className="mt-1 font-semibold">Total: {formatTokenAmount(treasury.total, treasury.decimals)} USDC</p>
          <p className="mt-2 text-xs text-[#5c4b32]">
            Balance: {formatTokenAmount(treasury.balance, treasury.decimals)} USDC
          </p>
        </div>
      ) : (
        <p className="text-xs text-[#5c4b32]">Reading price…</p>
      )}

      {claim.mintNeeded ? (
        <>
          <button type="button" onClick={() => claim.actions.mint.run().catch(() => {})} className={continueClass}>
            Mint test USDC
          </button>
          <TxStatus state={claim.actions.mint.state} txHash={claim.actions.mint.txHash} error={claim.actions.mint.error} />
        </>
      ) : (
        treasury && <p className="text-sm text-emerald-700">✓ Funded</p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="text-xs text-[#8f7652] underline">
          Back
        </button>
        <button
          type="button"
          disabled={claim.mintNeeded || !treasury}
          title={claim.mintNeeded ? "Mint enough test USDC first." : undefined}
          onClick={onContinue}
          className={continueClass}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function StepAuthorize({ claim, onBack }: { claim: ClaimNameState; onBack: () => void }) {
  const treasury = claim.treasury;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#3a2f22]">Authorize payment</h3>
      <MonoTag text="MockUSDC.approve(address,uint256)" />

      {treasury && (
        <p className="text-xs text-[#5c4b32]">
          Allowance: {formatTokenAmount(treasury.allowance, treasury.decimals)} USDC / needed{" "}
          {formatTokenAmount(treasury.total, treasury.decimals)} USDC. Approving for exactly the total plus 20%
          headroom — never an unlimited approval.
        </p>
      )}

      {claim.approveNeeded ? (
        <>
          <button type="button" onClick={() => claim.actions.approve.run().catch(() => {})} className={continueClass}>
            Approve
          </button>
          <TxStatus
            state={claim.actions.approve.state}
            txHash={claim.actions.approve.txHash}
            error={claim.actions.approve.error}
          />
        </>
      ) : (
        treasury && <p className="text-sm text-emerald-700">✓ Approved</p>
      )}

      <p className="rounded-sm border border-[#8f7652]/30 bg-[#f6efdc] px-3 py-2 text-xs text-[#5c4b32]">
        Don&apos;t close this tab for the next step — sealing the pledge starts a 60-second commit-reveal window.
      </p>

      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="text-xs text-[#8f7652] underline">
          Back
        </button>
        <button
          type="button"
          disabled={claim.approveNeeded || !treasury}
          title={claim.approveNeeded ? "Approve MockUSDC first." : undefined}
          onClick={() => claim.actions.commit.run().catch(() => {})}
          className={continueClass}
        >
          Seal the pledge
        </button>
      </div>
      <TxStatus state={claim.actions.commit.state} txHash={claim.actions.commit.txHash} error={claim.actions.commit.error} />
    </div>
  );
}

function StepSeal({ claim }: { claim: ClaimNameState }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#3a2f22]">Seal the pledge</h3>
      <MonoTag text="ETHRegistrar.commit(bytes32)" />
      <p className="text-sm text-[#5c4b32]">Sealing your pledge on-chain…</p>
      <TxStatus state={claim.actions.commit.state} txHash={claim.actions.commit.txHash} error={claim.actions.commit.error} />
    </div>
  );
}

function StepWait({ claim }: { claim: ClaimNameState }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#3a2f22]">Wait 60 seconds</h3>
      <MonoTag text="ETHRegistrar.commitmentAt(bytes32) + MIN_COMMITMENT_AGE" />

      {claim.commitmentLoading ? (
        <p className="text-sm text-[#5c4b32]">Reading pledge status…</p>
      ) : claim.expired ? (
        <>
          <p className="text-sm text-red-700">This pledge has expired — it must be sealed again.</p>
          <button
            type="button"
            onClick={() => {
              claim.discardAndStartOver();
            }}
            className={continueClass}
          >
            Start over
          </button>
        </>
      ) : (
        <>
          <p className="text-3xl font-bold text-[#3a2f22]">{claim.countdown?.secondsLeft ?? "…"}s</p>
          <p className="text-xs text-[#5c4b32]">
            Commit-reveal defeats front-running: your name choice is hidden as a hash until this window passes, so
            nobody can see it and register it out from under you first.
          </p>
        </>
      )}
    </div>
  );
}

function StepClaim({ claim }: { claim: ClaimNameState }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#3a2f22]">Claim the land</h3>
      <MonoTag text="ETHRegistrar.register(string,address,bytes32,address,address,uint64,address,bytes32)" />

      {claim.nameTakenAtRegister ? (
        <>
          <p className="text-sm text-red-700">
            Someone else registered this name between your commit and now.
          </p>
          <button type="button" onClick={() => claim.discardAndStartOver()} className={continueClass}>
            Choose another name
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-[#5c4b32]">Your pledge has matured — ready to claim.</p>
          <button
            type="button"
            disabled={!claim.canRegister}
            title={!claim.canRegister ? "Re-checking availability…" : undefined}
            onClick={() => claim.actions.register.run().catch(() => {})}
            className={continueClass}
          >
            Claim the land
          </button>
          <TxStatus
            state={claim.actions.register.state}
            txHash={claim.actions.register.txHash}
            error={claim.actions.register.error}
          />
        </>
      )}
    </div>
  );
}

/// Task 31's registration flow always registers with `resolver = zeroAddress` — see
/// `useClaimName.ts`'s `commit()`. That's a deliberate split, not an oversight: in ENSv2, "who
/// owns this name" (the registry, just settled above) and "what this name resolves to — avatar,
/// addresses, website" (a resolver, a *separate* contract) are two different contracts with two
/// different permission systems. Owning the name only grants `ROLE_SET_RESOLVER` — the right to
/// *choose* a resolver — never automatic write access to whatever resolver you pick; a
/// `PermissionedResolver`'s setters are gated by roles (`ROLE_SET_TEXT`, …) that must be granted
/// explicitly, independent of registry ownership. So a freshly claimed name is real estate with no
/// address plaque yet: this step is the one moment to explain that gap and close it in one click,
/// before the user goes hunting for why `avatar` won't save later.
function StepSetupResolver({ name, onDone }: { name: string; onDone: () => void }) {
  const { data: state } = useEnsName(name);
  const deployResolver = useDeployResolver();
  const setResolverAction = useTxAction();

  const deployedAddress = deployResolver.resolverAddress;

  async function submitSetResolver(address: Address) {
    if (!state?.registry || state.tokenId === null || state.tokenId === undefined) return;
    await setResolverAction
      .send({
        address: state.registry as Address,
        abi: ethRegistryAbi,
        functionName: "setResolver",
        args: [state.tokenId, address],
      })
      .catch(() => {});
  }

  const resolverIsSet = setResolverAction.state === "confirmed";

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#3a2f22]">
        Set up your resolver
      </h3>
      <MonoTag text="VerifiableFactory.deployProxy(PermissionedResolver, salt, initialize(...))" />

      <p className="text-sm text-[#3a2f22]">
        <span className="font-serif text-lg font-bold">{name}</span> is yours now — but owning a
        name and having somewhere to store an avatar, addresses or a website are two separate
        things in ENSv2.
      </p>
      <div className="rounded-sm border border-[#8f7652]/30 bg-[#f6efdc] p-3 text-xs text-[#5c4b32]">
        <p>
          <span className="font-semibold">Registry</span> (just settled) tracks who owns the name
          — it granted you the right to <em>choose</em> a resolver, nothing more.
        </p>
        <p className="mt-1.5">
          <span className="font-semibold">Resolver</span> is a separate contract that actually
          stores records (avatar, addresses, website). Right now this name points at{" "}
          <code>address(0)</code> — no resolver at all, so nothing can be set yet.
        </p>
        <p className="mt-1.5">
          A resolver checks its own roles before letting anyone write — owning the name does{" "}
          <span className="font-semibold">not</span> automatically grant write access to whichever
          resolver you point at. Deploying your own is the self-service way to skip that gap: it
          grants full control to your wallet the moment it&apos;s created.
        </p>
      </div>

      {resolverIsSet ? (
        <p className="text-sm text-emerald-700">
          ✓ Resolver set. Avatar, addresses and other records can be edited from the control panel
          any time.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => deployResolver.deployFor(name)}
              disabled={deployResolver.state === "signing" || deployResolver.state === "confirming"}
              className={continueClass}
            >
              Deploy my resolver
            </button>
            <TxStatus state={deployResolver.state} txHash={deployResolver.txHash} error={deployResolver.error} />
          </div>
          {deployedAddress ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#8f7652]/30 pt-3">
              <span className="font-mono text-xs text-[#3a2f22]">{deployedAddress}</span>
              <button
                type="button"
                onClick={() => submitSetResolver(deployedAddress)}
                disabled={setResolverAction.state === "signing" || setResolverAction.state === "confirming"}
                className={continueClass}
              >
                Use as {name}&apos;s resolver
              </button>
              <TxStatus state={setResolverAction.state} txHash={setResolverAction.txHash} error={setResolverAction.error} />
            </div>
          ) : null}
        </>
      )}

      <div className="flex gap-2 border-t border-[#8f7652]/30 pt-3">
        <button type="button" onClick={onDone} className="text-xs text-[#8f7652] underline">
          {resolverIsSet ? "Continue" : "Skip for now — I'll set up a resolver later"}
        </button>
      </div>
    </div>
  );
}

function DiscardButton({ claim }: { claim: ClaimNameState }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-[#8f7652] underline">
        Discard and start over
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-xs text-[#6e2333]">
      <p>The commit fee already paid will be lost. Discard anyway?</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            claim.discardAndStartOver();
            setConfirming(false);
          }}
          className="rounded-sm border border-[#8e1f2b]/50 bg-[#f3d9c4] px-2 py-1 font-semibold hover:bg-[#e8c7ad]"
        >
          Yes, discard
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
