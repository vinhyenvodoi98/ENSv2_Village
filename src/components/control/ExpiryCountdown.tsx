"use client";

import { formatAbsoluteTime, formatDuration } from "@/lib/format";
import { useNowTicker } from "@/lib/useNowTicker";

/// `IPermissionedRegistry.getExpiry` as a live countdown. The chain value only changes on a `renew`,
/// but the *time remaining* changes every second — so the clock ticks client-side (`useNowTicker`)
/// while the expiry itself stays a plain chain read.
export function ExpiryCountdown({ expiry }: { expiry: bigint }) {
  const now = useNowTicker();
  const secondsLeft = Number(expiry) - Math.floor(now / 1000);
  const isExpired = secondsLeft <= 0;

  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-2">
      <span
        className={`font-mono tabular-nums ${isExpired ? "text-red-300" : secondsLeft < 30 * 86400 ? "text-amber-300" : "text-emerald-300"}`}
      >
        {isExpired ? `expired ${formatDuration(-secondsLeft)} ago` : `in ${formatDuration(secondsLeft)}`}
      </span>
      <span className="text-xs text-[#9c8563]">{formatAbsoluteTime(expiry)}</span>
    </span>
  );
}
