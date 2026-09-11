/// The one card every control-panel section is drawn in — the shell tasks 34–38 mount their panels
/// into, so a delegation panel and a records editor look like parts of the same instrument rather
/// than separately-built screens.
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20 backdrop-blur ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white uppercase">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-white/50">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/// A label/value row. Labels name the *contract function* behind the value wherever there is one —
/// the point of the control panel is that every field maps to something ENSv2 itself exposes.
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-white/5 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <dt className="text-xs font-medium tracking-wide text-white/60 uppercase">{label}</dt>
        {hint ? <p className="mt-0.5 font-mono text-[11px] text-white/30">{hint}</p> : null}
      </div>
      <dd className="min-w-0 text-right text-sm text-white/90">{children}</dd>
    </div>
  );
}
