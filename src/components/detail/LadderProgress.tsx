import { AGENT_TIERS, type NamespaceNode } from "@/lib/ens";
import { HEARTBEATS_PER_TIER, TIER_STYLE } from "@/lib/ens/tierStyles";

/// Task 12's ladder bar: 4 tiers, current one marked, next one showing the missing on-chain
/// condition — `AgentRegistry.promote` gates every step on cumulative `heartbeat` calls
/// (`HEARTBEATS_PER_TIER * uint8(toTier)`, task 07), so "missing condition" here is always
/// exactly that number, read from the same `heartbeatCount` the tree already shows.
export function LadderProgress({ node }: { node: NamespaceNode }) {
  const currentIndex = AGENT_TIERS.indexOf(node.tier);
  const nextIndex = currentIndex + 1;
  const atMax = nextIndex >= AGENT_TIERS.length;
  const needed = atMax ? 0 : HEARTBEATS_PER_TIER * nextIndex;
  const missing = Math.max(0, needed - Number(node.heartbeatCount));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {AGENT_TIERS.map((tier, i) => {
          const style = TIER_STYLE[tier];
          const reached = i <= currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={tier} className="flex flex-1 items-center gap-1">
              <div
                className={[
                  "flex h-8 flex-1 items-center justify-center rounded-md text-xs font-medium transition-colors",
                  reached ? style.badge : "bg-black/5 text-zinc-400 dark:bg-white/5 dark:text-zinc-600",
                  isCurrent ? `ring-2 ring-offset-1 ${style.ring} ring-offset-white dark:ring-offset-zinc-900` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={tier}
              >
                {tier}
              </div>
              {i < AGENT_TIERS.length - 1 && <span className="text-zinc-300 dark:text-zinc-700">→</span>}
            </div>
          );
        })}
      </div>

      {atMax ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Sovereign is the top of the ladder — this agent is beyond parental control for good.
        </p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Next: <span className="font-medium text-zinc-700 dark:text-zinc-200">{AGENT_TIERS[nextIndex]}</span> — needs{" "}
          <span className="font-mono">{needed}</span> heartbeats, currently at{" "}
          <span className="font-mono">{node.heartbeatCount.toString()}</span>
          {missing > 0 ? (
            <>
              {" "}
              (<span className="font-mono text-amber-600 dark:text-amber-400">{missing} more</span> needed)
            </>
          ) : (
            <> — ready to promote</>
          )}
        </p>
      )}
    </div>
  );
}
