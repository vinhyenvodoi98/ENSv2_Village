"use client";

import { useAgentEvents } from "@/lib/ens";
import { explorerTxUrl } from "@/lib/explorer";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format";

/// Task 12's status timeline, sourced straight from `AgentRegistry` events (`useAgentEvents`) —
/// every entry links to Etherscan so nothing here can be mistaken for hand-typed history.
export function EventTimeline({
  labelhash,
  registry,
}: {
  labelhash: `0x${string}`;
  registry: `0x${string}`;
}) {
  const { data: events, isLoading, error } = useAgentEvents(labelhash, registry);

  if (isLoading) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Reading event history…</p>;
  if (error) return <p className="text-sm text-red-500">{error.message}</p>;
  if (!events || events.length === 0) return <p className="text-sm text-zinc-500 dark:text-zinc-400">No events yet.</p>;

  return (
    <ol className="flex flex-col gap-3 border-l border-black/10 pl-4 dark:border-white/10">
      {[...events].reverse().map((event) => (
        <li key={`${event.blockNumber}-${event.logIndex}`} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-500" aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-sm font-medium">{event.summary}</span>
            <a
              href={explorerTxUrl(event.txHash)}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-indigo-500 hover:underline"
            >
              view on Etherscan ↗
            </a>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400" title={formatAbsoluteTime(event.timestamp)}>
            {formatRelativeTime(event.timestamp)} · block {event.blockNumber.toString()}
          </p>
        </li>
      ))}
    </ol>
  );
}
