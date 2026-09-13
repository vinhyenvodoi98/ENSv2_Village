/// One "connect a wallet" / "no resolver set" / "no roles here" shape, replacing the nine
/// differently-worded `<p className="text-sm text-white/50">` sentences task 39 found scattered
/// across the drawer's panels.
export function EmptyState({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-[#8a755b] italic ${className}`}>{children}</p>;
}
