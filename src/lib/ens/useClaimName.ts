"use client";

import { useCallback, useEffect, useState } from "react";
import { zeroAddress, zeroHash } from "viem";
import { normalize } from "viem/ens";
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import { erc20Abi, ethRegistrarAbi } from "@/lib/contracts/abis";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { useBlockGatedQuery } from "./query";
import { describeError, useTxAction, type TxState } from "./useTxAction";

export type ClaimStep = 1 | 2 | 3 | 4 | 5 | 6;

export const CLAIM_DURATION_OPTIONS = [
  { label: "1 year", seconds: 31536000n },
  { label: "2 years", seconds: 63072000n },
  { label: "3 years", seconds: 94608000n },
] as const;

type StoredClaim = {
  chainId: number;
  owner: `0x${string}`;
  label: string;
  duration: string;
  secret: `0x${string}`;
  subregistry: `0x${string}`;
  resolver: `0x${string}`;
  referrer: `0x${string}`;
  commitment: `0x${string}`;
  commitTxHash: `0x${string}`;
};

function storageKey(chainId: number, address: `0x${string}`): string {
  return `agentvillage:claim-name:${chainId}:${address.toLowerCase()}`;
}

function readStored(chainId: number | undefined, address: `0x${string}` | undefined): StoredClaim | null {
  if (typeof window === "undefined" || !chainId || !address) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(chainId, address));
    return raw ? (JSON.parse(raw) as StoredClaim) : null;
  } catch {
    return null;
  }
}

function writeStored(chainId: number, address: `0x${string}`, claim: StoredClaim | null) {
  if (typeof window === "undefined") return;
  try {
    if (claim) window.localStorage.setItem(storageKey(chainId, address), JSON.stringify(claim));
    else window.localStorage.removeItem(storageKey(chainId, address));
  } catch {
    // best-effort only — losing this after the tx hash is already recorded on-chain just means
    // the recovery UX degrades to "start over", not a lost commit fee the user can't explain
  }
}

/// Cheap existence check `WorldRoot` uses to decide whether to auto-reopen the wizard on
/// mount/reload — without this, refreshing mid-countdown would silently drop the user back to a
/// closed wizard with no visible sign a pledge is still in flight.
export function hasStoredClaim(chainId: number | undefined, address: `0x${string}` | undefined): boolean {
  return readStored(chainId, address) !== null;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

type Treasury = { base: bigint; premium: bigint; total: bigint; decimals: number; balance: bigint; allowance: bigint };

function useTreasuryData(label: string | null, duration: bigint, owner: `0x${string}` | undefined) {
  const publicClient = usePublicClient();
  return useBlockGatedQuery<Treasury | null>(
    ["claimTreasury", label, duration.toString(), owner],
    async () => {
      if (!publicClient || !label || !owner) return null;
      const [price, decimals, balance, allowance] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          {
            address: CONTRACTS.ethRegistrar,
            abi: ethRegistrarAbi,
            functionName: "getRegisterPrice",
            args: [label, duration, CONTRACTS.mockUsdc],
          },
          { address: CONTRACTS.mockUsdc, abi: erc20Abi, functionName: "decimals" },
          { address: CONTRACTS.mockUsdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] },
          { address: CONTRACTS.mockUsdc, abi: erc20Abi, functionName: "allowance", args: [owner, CONTRACTS.ethRegistrar] },
        ],
      });
      const [base, premium] = price as readonly [bigint, bigint];
      return { base, premium, total: base + premium, decimals, balance, allowance };
    },
    { enabled: !!publicClient && !!label && !!owner }
  );
}

type CommitmentState = { commitmentAt: bigint; minAge: bigint; maxAge: bigint; blockTimestamp: bigint; fetchedAtMs: number };

function useCommitmentState(commitment: `0x${string}` | null) {
  const publicClient = usePublicClient();
  return useBlockGatedQuery<CommitmentState | null>(
    ["claimCommitment", commitment],
    async () => {
      if (!publicClient || !commitment) return null;
      const [commitmentAt, minAge, maxAge, block] = await Promise.all([
        publicClient.readContract({ address: CONTRACTS.ethRegistrar, abi: ethRegistrarAbi, functionName: "commitmentAt", args: [commitment] }),
        publicClient.readContract({ address: CONTRACTS.ethRegistrar, abi: ethRegistrarAbi, functionName: "MIN_COMMITMENT_AGE" }),
        publicClient.readContract({ address: CONTRACTS.ethRegistrar, abi: ethRegistrarAbi, functionName: "MAX_COMMITMENT_AGE" }),
        publicClient.getBlock(),
      ]);
      return { commitmentAt, minAge, maxAge, blockTimestamp: block.timestamp, fetchedAtMs: Date.now() };
    },
    { enabled: !!publicClient && !!commitment }
  );
}

/// Task 31: owns the entire 6-step "claim a name" state machine — persistence, chain
/// reconciliation, and every write — as pure state/logic. `ClaimNameWizard.tsx` only renders what
/// this returns; the step number here is always *derived* from `(stored localStorage record) ×
/// (live chain reads)`, never an independent `useState<number>`, so a stale refetch can't leave
/// the UI and the chain telling two different stories.
export function useClaimName() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();

  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState<bigint>(CLAIM_DURATION_OPTIONS[0].seconds);

  const trimmed = label.trim();
  let normalizedLabel: string | null = null;
  let labelError: string | null = null;
  if (trimmed.length === 0) {
    labelError = null;
  } else if (trimmed.includes(".")) {
    labelError = "A name is a single label — no dots.";
  } else {
    try {
      normalizedLabel = normalize(trimmed);
    } catch {
      labelError = "Not a valid ENS label.";
    }
  }

  const debouncedLabel = useDebouncedValue(normalizedLabel, 400);

  const mintAction = useTxAction();
  const approveAction = useTxAction();
  const commitAction = useTxAction();
  const registerAction = useTxAction();

  // Reset **during render** (React's "adjusting state when a prop changes" pattern, guarded by
  // comparing the account key) rather than in a `useEffect` — switching wallets must never paint
  // even one frame of the previous wallet's in-flight pledge.
  const accountKey = chainId && address ? `${chainId}:${address.toLowerCase()}` : null;
  const [storedCache, setStoredCache] = useState<{ key: string | null; value: StoredClaim | null }>(() => ({
    key: accountKey,
    value: readStored(chainId, address),
  }));
  if (storedCache.key !== accountKey) {
    setStoredCache({ key: accountKey, value: readStored(chainId, address) });
  }

  // Once `register` confirms, the just-registered pledge is done — derived to `null` off
  // `registerAction`'s own (already-reactive) state rather than a second `useEffect`+setState.
  // `commit()` resets `registerAction` at the start of every new cycle, so this can't leak into a
  // *later* claim attempt in the same session.
  const stored = registerAction.state === "confirmed" ? null : storedCache.value;

  const persistCommit = useCallback(
    (claim: StoredClaim) => {
      writeStored(claim.chainId, claim.owner, claim);
      setStoredCache({ key: accountKey, value: claim });
    },
    [accountKey]
  );

  const discardAndStartOver = useCallback(() => {
    if (chainId && address) writeStored(chainId, address, null);
    setStoredCache({ key: accountKey, value: null });
    setLabel("");
    mintAction.reset();
    approveAction.reset();
    commitAction.reset();
    registerAction.reset();
  }, [chainId, address, accountKey, mintAction, approveAction, commitAction, registerAction]);

  const availabilityQuery = useBlockGatedQuery<boolean | null>(
    ["claimAvailability", debouncedLabel],
    async () => {
      if (!publicClient || !debouncedLabel) return null;
      return publicClient.readContract({
        address: CONTRACTS.ethRegistrar,
        abi: ethRegistrarAbi,
        functionName: "isAvailable",
        args: [debouncedLabel],
      });
    },
    { enabled: !!publicClient && !!debouncedLabel && !stored }
  );
  const availability: "idle" | "checking" | "available" | "taken" =
    !normalizedLabel || labelError
      ? "idle"
      : debouncedLabel !== normalizedLabel || availabilityQuery.isFetching || availabilityQuery.data == null
        ? "checking"
        : availabilityQuery.data
          ? "available"
          : "taken";

  const effectiveLabel = stored ? stored.label : normalizedLabel;
  const effectiveDuration = stored ? BigInt(stored.duration) : duration;
  const treasuryQuery = useTreasuryData(effectiveLabel, effectiveDuration, address);
  const treasury = treasuryQuery.data ?? null;

  const commitmentQuery = useCommitmentState(stored ? stored.commitment : null);
  const commitmentState = commitmentQuery.data ?? null;

  // A fresh page load knows nothing about a tx sent in a previous session — `commitAction` here
  // starts at "idle" even though the commit is mid-flight. Re-attach a receipt watch to the
  // *stored* hash so step 4's recovery view can still show pending/confirmed/failed.
  const commitReceipt = useWaitForTransactionReceipt({ hash: stored?.commitTxHash });

  let step: ClaimStep = 1;
  let expired = false;
  if (stored) {
    if (!commitmentState) {
      step = 4;
    } else if (commitmentState.commitmentAt === 0n) {
      step = 4;
    } else {
      const readyAt = commitmentState.commitmentAt + commitmentState.minAge;
      const deadAt = commitmentState.commitmentAt + commitmentState.maxAge;
      if (commitmentState.blockTimestamp >= deadAt) {
        step = 5;
        expired = true;
      } else if (commitmentState.blockTimestamp >= readyAt) {
        step = 6;
      } else {
        step = 5;
      }
    }
  }

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (step !== 5 || expired) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step, expired]);

  const countdown =
    step === 5 && !expired && commitmentState
      ? (() => {
          const elapsedSec = BigInt(Math.max(0, Math.floor((nowTick - commitmentState.fetchedAtMs) / 1000)));
          const chainNow = commitmentState.blockTimestamp + elapsedSec;
          const readyAt = commitmentState.commitmentAt + commitmentState.minAge;
          const secondsLeft = Math.max(0, Number(readyAt - chainNow));
          return { secondsLeft };
        })()
      : null;

  const commitStatus: { state: TxState; txHash?: `0x${string}`; error?: string | null } =
    commitAction.state !== "idle"
      ? { state: commitAction.state, txHash: commitAction.txHash, error: commitAction.error }
      : stored
        ? {
            state:
              commitReceipt.data?.status === "success"
                ? "confirmed"
                : commitReceipt.data?.status === "reverted"
                  ? "failed"
                  : commitReceipt.isError
                    ? "failed"
                    : "confirming",
            txHash: stored.commitTxHash,
            error: commitReceipt.error ? describeError(commitReceipt.error) : null,
          }
        : { state: "idle", txHash: undefined, error: null };

  const registerAvailabilityQuery = useBlockGatedQuery<boolean | null>(
    ["claimRegisterAvailability", stored?.label],
    async () => {
      if (!publicClient || !stored) return null;
      return publicClient.readContract({
        address: CONTRACTS.ethRegistrar,
        abi: ethRegistrarAbi,
        functionName: "isAvailable",
        args: [stored.label],
      });
    },
    { enabled: !!publicClient && !!stored && step === 6 }
  );
  const nameTakenAtRegister = step === 6 && registerAvailabilityQuery.data === false;
  const canRegister = step === 6 && !expired && registerAvailabilityQuery.data === true;

  const mint = useCallback(async () => {
    if (!treasury || !address) return;
    const amount = (treasury.total * 3n) / 2n;
    await mintAction.send({ address: CONTRACTS.mockUsdc, abi: erc20Abi, functionName: "mint", args: [address, amount] });
  }, [treasury, address, mintAction]);

  const approve = useCallback(async () => {
    if (!treasury) return;
    const amount = (treasury.total * 6n) / 5n;
    await approveAction.send({
      address: CONTRACTS.mockUsdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACTS.ethRegistrar, amount],
    });
  }, [treasury, approveAction]);

  const commit = useCallback(async () => {
    if (!publicClient || !address || !chainId || !normalizedLabel) return;
    // A previous cycle's `register` may have confirmed in this same session — reset it now so
    // `stored`'s derivation (`registerAction.state === "confirmed" ? null : ...`) doesn't force
    // this brand-new commitment back to null the instant it's persisted below.
    registerAction.reset();
    const secretBytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = `0x${Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}` as `0x${string}`;
    const subregistry = zeroAddress;
    const resolver = zeroAddress;
    const referrer = zeroHash;

    const commitment = await publicClient.readContract({
      address: CONTRACTS.ethRegistrar,
      abi: ethRegistrarAbi,
      functionName: "makeCommitment",
      args: [normalizedLabel, address, secret, subregistry, resolver, duration, referrer],
    });

    const hash = await commitAction.send({
      address: CONTRACTS.ethRegistrar,
      abi: ethRegistrarAbi,
      functionName: "commit",
      args: [commitment],
    });

    // The single most important write in this flow: recorded the instant the wallet returns a
    // hash, before the receipt is awaited. Losing `secret` here turns an already-paid commit fee
    // into garbage with no way to recover it.
    persistCommit({
      chainId,
      owner: address,
      label: normalizedLabel,
      duration: duration.toString(),
      secret,
      subregistry,
      resolver,
      referrer,
      commitment,
      commitTxHash: hash,
    });
  }, [publicClient, address, chainId, normalizedLabel, duration, commitAction, persistCommit, registerAction]);

  const register = useCallback(async () => {
    if (!stored || !canRegister) return;
    await registerAction.send({
      address: CONTRACTS.ethRegistrar,
      abi: ethRegistrarAbi,
      functionName: "register",
      args: [
        stored.label,
        stored.owner,
        stored.secret,
        stored.subregistry,
        stored.resolver,
        BigInt(stored.duration),
        CONTRACTS.mockUsdc,
        stored.referrer,
      ],
    });
  }, [stored, canRegister, registerAction]);

  // `stored` above already derives to `null` once `registerAction` confirms; this effect's only
  // job is the localStorage side effect (an external system, not React state) that mirrors it —
  // no setState call here, so there's nothing for this render to re-derive.
  useEffect(() => {
    if (registerAction.state === "confirmed" && storedCache.value && chainId && address) {
      writeStored(chainId, address, null);
    }
  }, [registerAction.state, storedCache.value, chainId, address]);

  const claimedName =
    registerAction.state === "confirmed" && storedCache.value ? `${storedCache.value.label}.eth` : null;

  return {
    step,
    expired,
    commitmentLoading: !!stored && commitmentQuery.isLoading,
    label,
    setLabel,
    normalizedLabel,
    labelError,
    availability,
    duration,
    setDuration,
    treasury,
    mintNeeded: !!treasury && treasury.balance < treasury.total,
    approveNeeded: !!treasury && treasury.allowance < treasury.total,
    countdown,
    canRegister,
    nameTakenAtRegister,
    stored,
    discardAndStartOver,
    claimedName,
    actions: {
      mint: { run: mint, state: mintAction.state, txHash: mintAction.txHash, error: mintAction.error },
      approve: { run: approve, state: approveAction.state, txHash: approveAction.txHash, error: approveAction.error },
      commit: { run: commit, ...commitStatus },
      register: { run: register, state: registerAction.state, txHash: registerAction.txHash, error: registerAction.error },
    },
  };
}
