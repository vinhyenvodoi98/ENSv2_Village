"use client";

const TONE_STYLES: Record<string, string> = {
  default: "border-[#9c7b49] bg-[#dfd0ae]/60 text-[#4a331d] hover:bg-[#dfd0ae]",
  danger: "border-[#9e4242] bg-[#8a2630]/10 text-[#7a1f28] hover:bg-[#8a2630]/20",
  primary:
    "border-[#c39a50] bg-gradient-to-b from-[#8d2932] to-[#641c23] text-[#fff0cf] shadow-[0_2px_0_#3d1418] hover:brightness-110",
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
      className={`rounded-sm border font-cinzel font-bold tracking-wide uppercase transition disabled:cursor-not-allowed disabled:opacity-30 ${SIZE_STYLES[size]} ${TONE_STYLES[tone]}`}
    >
      {label}
    </button>
  );
}
