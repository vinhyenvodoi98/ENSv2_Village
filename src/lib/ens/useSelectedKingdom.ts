"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { CONTRACTS } from "@/lib/contracts/addresses";
import type { OwnedEthName } from "./useOwnedEthNames";

function storageKey(chainId: number, address: `0x${string}`): string {
  return `agentvillage:kingdom:${chainId}:${address.toLowerCase()}`;
}

function read(chainId: number | undefined, address: `0x${string}` | undefined): string | null {
  if (typeof window === "undefined" || !chainId || !address) return null;
  try {
    return window.localStorage.getItem(storageKey(chainId, address));
  } catch {
    return null;
  }
}

function write(chainId: number, address: `0x${string}`, name: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (name) window.localStorage.setItem(storageKey(chainId, address), name);
    else window.localStorage.removeItem(storageKey(chainId, address));
  } catch {
    // best-effort only — selection just doesn't persist across reloads
  }
}

function accountKeyOf(chainId: number | undefined, address: `0x${string}` | undefined): string | null {
  return chainId && address ? `${chainId}:${address.toLowerCase()}` : null;
}

/// Task 31: which of the connected wallet's owned `.eth` names is "the kingdom" the map shows.
/// Persisted per `chainId` + wallet address. The cached value is reset **during render** (React's
/// documented "adjusting state when a prop changes" pattern, guarded by comparing the account key)
/// rather than in a `useEffect`, specifically so switching wallets can never paint even one frame
/// of the previous wallet's kingdom — the spec calls that state-leak out by name as something that
/// looks like a security bug in a demo, and an effect-based reset lags by a render.
export function useSelectedKingdom(ownedNames: OwnedEthName[]) {
  const { address, chainId } = useAccount();
  const accountKey = accountKeyOf(chainId, address);

  const [cache, setCache] = useState<{ key: string | null; value: string | null }>(() => ({
    key: accountKey,
    value: read(chainId, address),
  }));

  if (cache.key !== accountKey) {
    setCache({ key: accountKey, value: read(chainId, address) });
  }

  // Nothing persisted for this account, or the persisted pick isn't owned any more (transferred
  // away) — both cases derive straight from live data instead of needing a separate effect+write.
  const stillOwned = cache.key === accountKey && cache.value !== null && ownedNames.some((n) => n.name === cache.value);
  // The deployer wallet also owns `CONTRACTS.parentName` (task 30 registered it to itself) — when
  // that same wallet is used to test claiming a *personal* kingdom, alphabetical sort would
  // otherwise hand the fleet's own showcase name back as the default every time. A name the wallet
  // actually claimed for itself always wins the fallback over the fleet's own.
  const fallback = ownedNames.find((n) => n.name !== CONTRACTS.parentName)?.name ?? ownedNames[0]?.name ?? null;
  const selected = stillOwned ? cache.value : fallback;

  const select = useCallback(
    (name: string) => {
      if (chainId && address) write(chainId, address, name);
      setCache({ key: accountKey, value: name });
    },
    [accountKey, chainId, address]
  );

  return { selected, select };
}
