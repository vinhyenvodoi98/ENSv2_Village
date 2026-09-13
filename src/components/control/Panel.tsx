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
      className={`relative overflow-hidden rounded-sm border-2 border-[#c9a15a]/70 bg-[#ece1c8] shadow-[0_10px_30px_rgba(28,19,10,0.35),inset_0_0_0_3px_#5d4026] ${className}`}
    >
      <span className="pointer-events-none absolute left-1.5 top-1.5 z-10 size-3 border-l-2 border-t-2 border-[#9a7436]/70" aria-hidden />
      <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 size-3 border-r-2 border-t-2 border-[#9a7436]/70" aria-hidden />
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 size-3 border-b-2 border-l-2 border-[#9a7436]/70" aria-hidden />
      <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 size-3 border-b-2 border-r-2 border-[#9a7436]/70" aria-hidden />
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#c9a15a]/40 bg-[#dfd0ae]/50 px-5 py-3.5">
        <div>
          <h2 className="font-cinzel text-xs font-bold tracking-[0.14em] text-[#4a331d] uppercase">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-[#8a755b]">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4 text-[#3a2918]">{children}</div>
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
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[#c9a15a]/25 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <dt className="text-xs font-semibold tracking-wide text-[#755329] uppercase">{label}</dt>
        {hint ? <p className="mt-0.5 font-mono text-[11px] text-[#a8926e]">{hint}</p> : null}
      </div>
      <dd className="min-w-0 text-right text-sm text-[#33230f]">{children}</dd>
    </div>
  );
}
