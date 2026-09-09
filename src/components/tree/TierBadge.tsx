import type { AgentTier } from "@/lib/ens";
import { TIER_STYLE } from "@/lib/ens/tierStyles";

export function TierBadge({ tier, className = "" }: { tier: AgentTier; className?: string }) {
  const style = TIER_STYLE[tier];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge} ${className}`}
    >
      <span aria-hidden>{style.glyph}</span>
      {tier}
    </span>
  );
}
