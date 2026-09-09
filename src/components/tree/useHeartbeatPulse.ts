"use client";

import { useEffect, useRef, useState } from "react";

/// True for `durationMs` right after `heartbeatCount` increases — task 11's "a fresh heartbeat →
/// the node pulses" signal. Ignores the very first value seen (mount), so a node doesn't pulse
/// just because the page loaded with a nonzero heartbeat count already on chain.
export function useHeartbeatPulse(heartbeatCount: bigint, durationMs = 1600): boolean {
  const [pulsing, setPulsing] = useState(false);
  const previous = useRef<bigint | null>(null);

  useEffect(() => {
    if (previous.current !== null && heartbeatCount > previous.current) {
      setPulsing(true);
      const id = setTimeout(() => setPulsing(false), durationMs);
      previous.current = heartbeatCount;
      return () => clearTimeout(id);
    }
    previous.current = heartbeatCount;
  }, [heartbeatCount, durationMs]);

  return pulsing;
}
