"use client";

import { Html } from "@react-three/drei";
import { AGENT_TIER_ORDER, TIER_STYLE } from "@/lib/ens/tierStyles";
import styles from "./FortressNameplate.module.css";

interface FortressNameplateProps {
  /** Dotted ENS name — shown in full on the plate (wraps rather than truncates) and in the hover tooltip. */
  fullName: string;
  /** `AGENT_TIERS` index. */
  tier: number;
  derelict?: boolean;
  /** Small caption line, e.g. "not on-chain" for a wildcard preview. */
  note?: string;
  positionY: number;
}

/**
 * Camera-facing DOM label anchored above the castle roof. Since task 29 this
 * shows the agent's real ENS label plus its tier glyph, so scanning the map
 * shows the whole ownership ladder at once — `TIER_STYLE` is imported (not
 * re-derived) so the map and the sidebar can never drift apart. That module is
 * plain constants; no wagmi/viem reaches the render loop through it.
 *
 * Shows the full dotted `fullName`, not just the short label — a `Sovereign`
 * child's name only means something with its parent chain attached (e.g.
 * `sentinel-01.agentvillage.eth`), so truncating it would hide the one thing
 * the plate exists to show. The plate wraps onto a second line instead.
 */
export function FortressNameplate({ fullName, tier, derelict = false, note, positionY }: FortressNameplateProps) {
  const tierName = AGENT_TIER_ORDER[Math.min(Math.max(tier, 0), AGENT_TIER_ORDER.length - 1)];
  const style = TIER_STYLE[tierName];

  return (
    <Html
      position={[0, positionY, 0]}
      center
      distanceFactor={18}
      zIndexRange={[20, 0]}
      className={styles.anchor}
    >
      <div
        className={`${styles.plate}${derelict ? ` ${styles.derelict}` : ""}`}
        role="note"
        title={`${fullName} — ${tierName}${derelict ? " (derelict)" : ""}`}
        aria-label={`${fullName}, tier ${tierName}${derelict ? ", derelict" : ""}`}
      >
        <span className={styles.tier} style={{ color: style.pulseColor }} aria-hidden>
          {style.glyph}
        </span>
        <span className={styles.label}>{fullName}</span>
        {note ? <div className={styles.note}>{note}</div> : null}
      </div>
    </Html>
  );
}
