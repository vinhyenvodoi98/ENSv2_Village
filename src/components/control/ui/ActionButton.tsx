"use client";

const TONE_STYLES: Record<string, string> = {
  default: "border-white/15 text-white/80 hover:bg-white/10",
  danger: "border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  primary: "border-transparent bg-sky-500/90 text-white hover:bg-sky-400",
};

const SIZE_STYLES: Record<string, string> = {
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3 py-1.5 text-xs",
};

/// The one write-button shape for the whole control panel — task 39 promotes this out of
/// `LifecyclePanel` (which had it with a `reason` prop) and `SubnameManagerPanel` (which had a
/// second, slightly smaller copy without one). A disabled write button should say *which role* is
/// missing, so `reason` stays: it is the better half of the two forks.
export function ActionButton({
  label,
  enabled,
  onClick,
  pending,
  reason,
  tone = "default",
  size = "md",
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
  pending?: boolean;
  reason?: string;
  tone?: "default" | "danger" | "primary";
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled || pending}
      title={enabled ? undefined : (reason ?? "Connected wallet lacks the role this action needs")}
      className={`rounded-full border font-semibold tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${SIZE_STYLES[size]} ${TONE_STYLES[tone]}`}
    >
      {label}
    </button>
  );
}
