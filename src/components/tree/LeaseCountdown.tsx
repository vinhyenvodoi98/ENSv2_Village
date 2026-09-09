"use client";

import { formatDuration } from "@/lib/format";
import { useNowTicker } from "@/lib/useNowTicker";

/// `expiry` is a unix-seconds timestamp, `0n` meaning "no lease" (Wildcard/Owned/Sovereign).
/// Ticks every second off `useNowTicker` — task 11 wants the countdown to visibly move, not just
/// refresh whenever the chain happens to produce a new block.
export function LeaseCountdown({ expiry }: { expiry: bigint }) {
  const now = useNowTicker(1000);
  if (expiry === 0n) return <span className="text-zinc-400 dark:text-zinc-500">no lease</span>;

  const remaining = Number(expiry) - Math.floor(now / 1000);
  const expired = remaining <= 0;

  return (
    <span className={expired ? "text-red-500" : "text-zinc-500 dark:text-zinc-400"}>
      {expired ? "lease expired" : `${formatDuration(remaining)} left`}
    </span>
  );
}
