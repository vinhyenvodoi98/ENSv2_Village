export type StatusTone = "registered" | "reserved" | "available" | "lapsed" | "custom" | "unreachable" | "neutral";

const TONE_STYLES: Record<StatusTone, string> = {
  registered: "border-emerald-400/50 text-emerald-300",
  reserved: "border-amber-400/50 text-amber-300",
  available: "border-[#d9b66f]/50 text-[#d9b66f]",
  lapsed: "border-amber-400/50 text-amber-300",
  custom: "border-sky-400/50 text-sky-300",
  unreachable: "border-red-400/50 text-red-300",
  neutral: "border-[#d9b66f]/50 text-[#d9b66f]",
};

/// The one status-pill shape for the whole control panel — a dark wax-seal chip that reads the
/// same whether it sits on the drawer's wood header or a parchment card body, since a tone that
/// only worked on one of those two backgrounds was the seed of the drawer's style split.
export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return (
    <span
      className={`rounded-sm border bg-black/25 px-3 py-1 font-cinzel text-[10px] font-bold tracking-wide uppercase backdrop-blur-sm ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}
