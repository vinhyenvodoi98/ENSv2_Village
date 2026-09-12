"use client";

import { useSyncExternalStore } from "react";

/// What a subname scan is currently doing. The two phases are the two genuinely slow, genuinely
/// distinguishable halves of `useNameChildren`'s read: a chunked `eth_getLogs` walk over the
/// registry's whole `LabelRegistered` history (many sequential round-trips, the part that can take
/// tens of seconds), then one multicall that re-verifies every candidate against live state.
export type ScanPhase = "scanning" | "verifying";

export type ScanProgress = {
  phase: ScanPhase;
  /// Log windows already answered, and how many the range was split into. `total === 0` means the
  /// split isn't known yet — render that as indeterminate rather than as 0%.
  scanned: number;
  total: number;
  /// Candidate subnames discovered so far. Shown because "found 12 so far" is the one number that
  /// tells a waiting user the read is actually producing something, not just spinning.
  found: number;
};

/// Module scope for the same reason `logs.ts`'s candidate cache is: `query.ts` folds the current
/// block number into every query key, so anything held in React state inside the hook would be
/// churned by the refetch this store exists to describe. Keyed by scan scope (the registry
/// address), so two names being read at once never overwrite each other's progress.
const progressByScope = new Map<string, ScanProgress>();
const listeners = new Set<() => void>();

/// Called from inside the fetch, never during render. Passing `null` clears the scope — a scan that
/// finished, failed, or was superseded leaves nothing behind for the next one to inherit.
export function reportScanProgress(scope: string, progress: ScanProgress | null): void {
  if (progress) progressByScope.set(scope, progress);
  else progressByScope.delete(scope);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/// Live progress for one scan scope, or `null` when nothing is in flight for it.
///
/// The snapshot is the stored object itself — `reportScanProgress` always writes a *new* object, so
/// reference equality is exactly "nothing changed" and `useSyncExternalStore` won't loop.
export function useScanProgress(scope: string | null): ScanProgress | null {
  return useSyncExternalStore(
    subscribe,
    () => (scope ? progressByScope.get(scope) ?? null : null),
    () => null
  );
}
