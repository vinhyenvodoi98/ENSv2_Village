"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanProgress } from "@/lib/ens/scanProgress";

/// Wait this long before the modal is allowed to appear. A scan that answers from cache
/// finishes in well under this, and a dialog that flashes for 120ms is worse than no dialog at all:
/// the user registers *something happened* without ever being able to read it.
const APPEAR_AFTER_MS = 400;
/// Once it *has* appeared, keep it up at least this long. Without a floor, a scan that resolves
/// just past `APPEAR_AFTER_MS` produces a single frame of dialog — the same flicker, moved.
const MIN_VISIBLE_MS = 700;
/// After this long the copy admits the read is slow and stops implying it's nearly done.
const SLOW_AFTER_MS = 6_000;

export type ScanCopy = {
  /// Dialog heading. Names what is being read, in the user's terms.
  title: string;
  /// The thing being read — a name, a wallet address. Rendered mono under the title.
  subject: string;
  /// What the log walk is doing, e.g. "Scanning registry history".
  scanning: string;
  /// What the re-verification pass is doing, given how many candidates it has.
  verifying: (found: number) => string;
  /// Why this takes any time at all. Answers "is your app broken?" before it is asked.
  hint: string;
  /// Replaces `hint` once the read has been running long enough to stop implying it's nearly done.
  slowHint: string;
  /// Label for the corner chip the dialog collapses into when dismissed.
  chip: string;
  /// How to describe the running candidate count mid-scan, appended to the scanning line and the
  /// chip. Optional, and omitted where the number would mislead: the owned-`.eth` walk's count is
  /// *every* registration on the deployment, not the wallet's own, so it says "seen", not "found".
  count?: (found: number) => string;
};

/// Shown while a chunked on-chain history scan runs for the **first** time — the subname walk on
/// `/ens/[name]`, the owned-`.eth` walk on `/`. Both are the same shape of wait (ENSv2 has no
/// index, so a list has to be recovered from event history and then re-verified), so both get the
/// same dialog with different copy rather than two separately-invented loading states.
///
/// The behaviour is the design here, more than the pixels. Three rules, each answering a specific
/// way a loading dialog turns hostile:
///
/// 1. **It never interrupts a working screen.** `active` is passed as "there is nothing to show
///    yet", not "a fetch is in flight". Every hook in `src/lib/ens/` re-reads on every new block
///    (`query.ts`), so a fetch-in-flight dialog would slam over the map every ~12s forever.
///    Refreshes stay invisible; only the first, empty-handed read is narrated.
/// 2. **It is not a trap.** The scrim is `pointer-events-none` and the map keeps rendering, panning
///    and responding underneath. Escape or "Continue browsing" demotes it to a corner chip that
///    keeps reporting until the read lands. Nothing is gated on the dialog: it is an explanation,
///    not a gate, so it never owes the user a cancel button it can't honour.
/// 3. **It says something true and specific.** A chunked `eth_getLogs` walk is dozens of sequential
///    requests, so there is real progress to report — window N of M, entries found so far, which of
///    the two phases is running. An indeterminate spinner would hide exactly the information that
///    makes a 20-second wait tolerable.
export function ScanLoadingModal({
  copy,
  active,
  progress,
}: {
  copy: ScanCopy;
  active: boolean;
  progress: ScanProgress | null;
}) {
  const subject = copy.subject;
  const visible = useDeferredVisibility(active);
  const slow = useElapsedBeyond(visible, SLOW_AFTER_MS);

  // Dismissal is scoped to the scan it was made during: "not now", not a stored preference. Reset
  // during render (React's documented "adjusting state when a prop changes" pattern, the same one
  // `WorldRoot`/`useSelectedKingdom` use) rather than in an effect, so the next scan can't paint a
  // frame of the previous scan's dismissed chip before the dialog comes back.
  const [scan, setScan] = useState({ key: scanKey(active, subject), dismissed: false });
  if (scan.key !== scanKey(active, subject)) setScan({ key: scanKey(active, subject), dismissed: false });
  const dismissed = scan.dismissed;
  const setDismissed = useCallback(
    (value: boolean) => setScan({ key: scanKey(active, subject), dismissed: value }),
    [active, subject]
  );

  useEffect(() => {
    if (!visible || dismissed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, dismissed, setDismissed]);

  if (!visible) return null;

  const pct = completionPercent(progress);
  const detail = progressDetail(progress, copy);
  const found = progress?.found ?? 0;

  if (dismissed) {
    return (
      <div className="pointer-events-none absolute bottom-6 right-4 z-40 motion-safe:animate-[chain-scan-in_180ms_ease-out]">
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-black/70 py-2 pl-3 pr-4 text-xs text-white/70 backdrop-blur transition-colors hover:text-white"
          aria-live="polite"
        >
          <ScanDot />
          <span>
            {copy.chip}
            {copy.count && found > 0 ? ` · ${copy.count(found)}` : ""}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
      {/* Dimmed, but only just, and never pointer-blocking: the world behind is the context that
          makes the wait make sense — the castle whose subnames are loading, or the terrain a
          kingdom is about to be planted on — and hiding it would throw that away. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[#0b1020]/45 backdrop-blur-[1px] motion-safe:animate-[chain-scan-in_220ms_ease-out]"
        aria-hidden
      />

      <div
        role="status"
        aria-live="polite"
        aria-busy
        className="pointer-events-auto relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#111a33]/95 p-5 shadow-2xl shadow-black/50 backdrop-blur motion-safe:animate-[chain-scan-in_220ms_ease-out]"
      >
        <div className="flex items-start gap-3">
          <ScanDot />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase">{copy.title}</h2>
            <p className="mt-0.5 truncate font-mono text-xs text-white/50">{copy.subject}</p>
          </div>
        </div>

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400/80 transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="mt-3 text-xs text-white/70">{detail}</p>
        <p className="mt-1 text-xs text-white/40">
          {slow ? copy.slowHint : copy.hint}
        </p>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            Continue browsing
          </button>
        </div>
      </div>
    </div>
  );
}

/// The two phases share one bar, split so the estimate's slop never shows: the log walk owns
/// 0–75% (its window count is an estimate and can grow), verification owns the rest, and the bar
/// is never allowed to reach 100% — the dialog closing is what "done" looks like, not a full bar
/// sitting there while nothing happens.
function completionPercent(progress: ScanProgress | null): number {
  if (!progress) return 4;
  if (progress.phase === "verifying") return 88;
  if (progress.total <= 0) return 8;
  return 6 + Math.min(1, progress.scanned / progress.total) * 69;
}

function progressDetail(progress: ScanProgress | null, copy: ScanCopy): string {
  if (!progress) return "Opening a connection to the registry…";
  if (progress.phase === "verifying") return copy.verifying(progress.found);
  const found = copy.count && progress.found > 0 ? ` · ${copy.count(progress.found)}` : "";
  if (progress.total <= 0) return `${copy.scanning}${found}`;
  return `${copy.scanning} · pass ${Math.min(progress.scanned + 1, progress.total)} of ${progress.total}${found}`;
}

function ScanDot() {
  return (
    <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
    </span>
  );
}

/// `active`, delayed on the way in and held on the way out — the two halves of not flickering.
function useDeferredVisibility(active: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (visible) return;
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, APPEAR_AFTER_MS);
      return () => clearTimeout(timer);
    }
    if (!visible) return;
    const heldFor = Date.now() - (shownAt.current ?? 0);
    const remaining = Math.max(0, MIN_VISIBLE_MS - heldFor);
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [active, visible]);

  return visible;
}

function scanKey(active: boolean, subject: string): string | null {
  return active ? subject : null;
}

/// True once `on` has been continuously true for `ms`. One timer, no interval — the copy only
/// changes at a single threshold.
function useElapsedBeyond(on: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState({ on, passed: false });
  if (elapsed.on !== on) setElapsed({ on, passed: false });

  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setElapsed({ on: true, passed: true }), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);

  return elapsed.on === on && elapsed.passed;
}
