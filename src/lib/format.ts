import { formatUnits } from "viem";

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/// Formats a raw token integer (e.g. MockUSDC base units) as a decimal string using the token's
/// own `decimals()` — every money figure in the claim-name flow goes through this, never
/// `Number(...).toFixed()` on a manually-divided value (a bigint total can exceed `Number`'s safe
/// integer range long before it exceeds what a wallet can actually hold).
export function formatTokenAmount(amount: bigint, decimals: number, opts?: { maxFractionDigits?: number }): string {
  const maxFractionDigits = opts?.maxFractionDigits ?? 2;
  const full = formatUnits(amount, decimals);
  const [whole, fraction = ""] = full.split(".");
  if (!fraction || maxFractionDigits <= 0) return whole;
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/// Formats a duration in seconds as a compact "Xd Yh Zm" (or "Xh Ym", "Xm Ys", "expired") —
/// used for lease countdowns, which need to stay readable while ticking live.
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "expired";

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/// "3m ago" / "2h ago" style relative time from a unix-seconds timestamp — used for "time of the
/// most recent heartbeat" and timeline entries.
export function formatRelativeTime(unixSeconds: bigint | number): string {
  const then = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  const deltaSeconds = Math.max(0, Date.now() / 1000 - then);

  if (deltaSeconds < 60) return "just now";
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}

export function formatAbsoluteTime(unixSeconds: bigint | number): string {
  const seconds = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  return new Date(seconds * 1000).toLocaleString();
}
