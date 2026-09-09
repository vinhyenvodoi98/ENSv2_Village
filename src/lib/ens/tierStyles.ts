import type { AgentTier } from "./useAgentTree";

/// One visual identity per tier, shared by the tree (task 11) and the detail panel (task 12) so
/// a "Sovereign" node reads as the same thing everywhere: a distinct color, never conveyed by
/// color alone (each also gets a short glyph + label so tier is legible without reading prose).
export const TIER_STYLE: Record<
  AgentTier,
  { badge: string; dot: string; ring: string; glyph: string; pulseColor: string }
> = {
  Wildcard: {
    badge: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    dot: "bg-zinc-400",
    ring: "ring-zinc-400/40",
    glyph: "◇",
    pulseColor: "rgba(161, 161, 170, 0.55)",
  },
  Leased: {
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    dot: "bg-sky-500",
    ring: "ring-sky-400/50",
    glyph: "◐",
    pulseColor: "rgba(14, 165, 233, 0.55)",
  },
  Owned: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
    ring: "ring-emerald-400/50",
    glyph: "●",
    pulseColor: "rgba(16, 185, 129, 0.55)",
  },
  Sovereign: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-500",
    ring: "ring-amber-400/60",
    glyph: "♛",
    pulseColor: "rgba(245, 158, 11, 0.55)",
  },
};

export const HEARTBEATS_PER_TIER = 3;
export const AGENT_TIER_ORDER = ["Wildcard", "Leased", "Owned", "Sovereign"] as const;
