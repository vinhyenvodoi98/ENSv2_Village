"use client";

import { useEffect, useState } from "react";

/// A `Date.now()`-driven re-render tick, `intervalMs` apart. Purely a client-side clock — used
/// for lease countdowns and relative-time labels that need to visibly move between chain reads,
/// not to poll the chain itself (that's `useBlockGatedQuery`'s job).
export function useNowTicker(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
