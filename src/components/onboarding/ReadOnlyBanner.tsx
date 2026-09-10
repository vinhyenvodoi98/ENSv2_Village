"use client";

/// Task 31, section 5: shown across the top whenever `?kingdom=` is set — a judge-facing escape
/// hatch that must never let a viewer assume this kingdom is theirs and find out only when they
/// press spawn.
export function ReadOnlyBanner({ kingdomName, onExit }: { kingdomName: string; onExit: () => void }) {
  return (
    <div className="pointer-events-auto fixed left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-red-400/60 bg-red-950/80 px-4 py-2 text-xs text-red-100 shadow-lg backdrop-blur">
      <span>
        Viewing <span className="font-mono font-semibold">{kingdomName}</span> read-only — you don&apos;t own this
        kingdom.
      </span>
      <button
        type="button"
        onClick={onExit}
        className="rounded-full bg-white/10 px-2 py-0.5 font-semibold uppercase tracking-wide hover:bg-white/20"
      >
        Exit
      </button>
    </div>
  );
}
