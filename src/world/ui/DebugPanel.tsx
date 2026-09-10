"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Dev-only debug panel. `process.env.NODE_ENV` is statically replaced at
 * build time, so in a production build this ternary collapses to the
 * `() => null` branch and the `import()` below is dead code — the panel's
 * module never ships in the production bundle. Verify with `npm run build`:
 * no separate `DebugPanelContent` chunk should be emitted.
 */
const DebugPanelInner: ComponentType =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("./DebugPanelContent"), { ssr: false })
    : () => null;

export function DebugPanel({
  className = "pointer-events-none absolute right-4 top-4",
}: {
  /** Override when nesting inside a caller-positioned container (e.g. stacked below another HUD widget). */
  className?: string;
} = {}) {
  return (
    <div className={className}>
      <DebugPanelInner />
    </div>
  );
}
