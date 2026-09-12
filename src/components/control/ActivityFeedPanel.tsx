"use client";

import { explorerTxUrl } from "@/lib/explorer";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format";
import { useActivityFeed } from "@/lib/ens/useActivityFeed";
import type { EnsNameState } from "@/lib/ens/useEnsName";
import { Panel } from "./Panel";

/// Task 38: the name's history, read straight from the events every panel above already causes —
/// nothing here is hand-typed, so a grant in the delegation panel or a renew in the lifecycle panel
/// shows up here within one block, decoded rather than left as a raw role bitmap.
export function ActivityFeedPanel({ state }: { state: EnsNameState }) {
  const { data: events, isLoading, error } = useActivityFeed(state);

  return (
    <Panel title="Activity" subtitle={<code>LabelRegistered · ExpiryUpdated · EACRolesChanged · …</code>}>
      {isLoading ? (
        <p className="text-sm text-white/50">Reading event history…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error.message}</p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-white/50 italic">No history yet — this name has no events on chain.</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l border-white/10 pl-4">
          {[...events].reverse().map((event) => (
            <li key={`${event.blockNumber}-${event.logIndex}`} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-400" aria-hidden />
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-sm font-medium text-white/90">{event.summary}</span>
                <a
                  href={explorerTxUrl(event.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-sky-300 hover:underline"
                >
                  view on Etherscan ↗
                </a>
              </div>
              <p className="text-xs text-white/40" title={formatAbsoluteTime(event.timestamp)}>
                {formatRelativeTime(event.timestamp)} · block {event.blockNumber.toString()}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
