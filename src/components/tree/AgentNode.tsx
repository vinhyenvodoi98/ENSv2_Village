"use client";

import type { CSSProperties } from "react";
import type { LastHeartbeat, NamespaceNode } from "@/lib/ens";
import { TIER_STYLE } from "@/lib/ens/tierStyles";
import { formatRelativeTime } from "@/lib/format";
import { useNowTicker } from "@/lib/useNowTicker";
import { LeaseCountdown } from "./LeaseCountdown";
import { TierBadge } from "./TierBadge";
import { useHeartbeatPulse } from "./useHeartbeatPulse";

export function AgentNode({
  node,
  lastHeartbeat,
  isSelected,
  onSelect,
}: {
  node: NamespaceNode;
  lastHeartbeat?: LastHeartbeat;
  isSelected: boolean;
  onSelect: (node: NamespaceNode) => void;
}) {
  // 5s is plenty for an expiry transition to show up — this isn't the live-second countdown.
  const now = useNowTicker(5000);
  const pulsing = useHeartbeatPulse(node.heartbeatCount);
  const style = TIER_STYLE[node.tier];

  const expired = node.expiry !== 0n && Math.floor(now / 1000) >= Number(node.expiry);
  const dead = node.revoked || expired;
  const isSovereign = node.tier === "Sovereign";

  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      style={{ "--pulse-color": style.pulseColor } as CSSProperties}
      className={[
        "group flex w-full flex-col gap-1.5 rounded-xl border px-4 py-3 text-left transition-colors",
        "border-black/10 bg-white hover:border-black/25 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/25",
        isSovereign ? `ring-2 ${style.ring}` : "",
        isSelected ? "outline outline-2 outline-offset-2 outline-indigo-500" : "",
        dead ? "opacity-45 saturate-50" : "",
        pulsing ? "animate-heartbeat-pulse" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-sm font-medium ${dead ? "text-zinc-400 line-through dark:text-zinc-500" : ""}`}>
          {node.fullName}
        </span>
        <TierBadge tier={node.tier} />
      </div>

      {isSovereign && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          beyond parental control
        </span>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${dead ? "bg-red-500" : "bg-emerald-500"}`}
            aria-hidden
          />
          <span className={dead ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}>
            {dead ? (node.revoked ? "revoked" : "expired") : "alive"}
          </span>
        </span>
        <LeaseCountdown expiry={node.expiry} />
        <span className="text-zinc-400 dark:text-zinc-500">
          {lastHeartbeat ? `heartbeat ${formatRelativeTime(lastHeartbeat.timestamp)}` : "no heartbeat yet"}
        </span>
      </div>
    </button>
  );
}
