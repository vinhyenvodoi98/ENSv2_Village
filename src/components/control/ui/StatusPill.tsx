export type StatusTone = "registered" | "reserved" | "available" | "lapsed" | "custom" | "unreachable" | "neutral";

const TONE_STYLES: Record<StatusTone, string> = {
  registered: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  reserved: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  available: "border-white/15 bg-white/5 text-white/60",
  lapsed: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  custom: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  unreachable: "border-red-400/30 bg-red-400/10 text-red-200",
  neutral: "border-white/15 bg-white/5 text-white/60",
};

/// The one status-pill shape for the whole control panel — task 39 lifts this out of
/// `NameStateDetail`, where it lived as a private component, and gives it a `tone` per one of task
/// 33's four first-class name states (plus the finer-grained registered/reserved distinction
/// `NameOverviewPanel` already read off `IPermissionedRegistry.Status`).
export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}
