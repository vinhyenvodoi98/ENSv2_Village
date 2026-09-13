"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePublicClient } from "wagmi";
import { addressPath, ensPath, parseSearchInput } from "@/lib/ens/name";
import { fetchReverseName } from "@/lib/ens/useReverseName";

/// Task 33's one search rule, as a control: `0x` + 40 hex is treated as an address, anything else
/// as a name.
///
/// For an address the box first asks the chain whether that address has claimed a primary name
/// (`UniversalResolver.reverse`). Exactly one answer is the "obvious match" that earns a redirect
/// straight to `/ens/[name]` — the canonical page for a name; no answer (the common case: `reverse`
/// reverts when no reverse record is set) falls through to `/address/[addr]`, the portfolio index.
/// The lookup runs here rather than in a hook because it only has to happen on submit, and its
/// result decides which route to navigate to.
export function NameSearchBox({ initialValue = "" }: { initialValue?: string }) {
  const router = useRouter();
  const publicClient = usePublicClient();
  const [value, setValue] = useState(initialValue);
  const [isResolving, setIsResolving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const target = parseSearchInput(value);
    if (target.kind === "empty") return;
    if (target.kind === "name") {
      router.push(ensPath(target.name));
      return;
    }

    setIsResolving(true);
    try {
      const primary = publicClient ? await fetchReverseName(publicClient, target.address) : null;
      router.push(primary ? ensPath(primary.name) : addressPath(target.address));
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-1 items-center gap-2">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        placeholder="name.eth  or  0x…"
        aria-label="Look up an ENS name or address"
        className="min-w-0 flex-1 rounded-full border border-[#c9a15a]/50 bg-[#3a2918]/22 px-4 py-2 font-mono text-sm text-[#3a2918] placeholder:text-[#a8926e] focus:border-sky-400/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isResolving || parseSearchInput(value).kind === "empty"}
        className="rounded-full bg-[#c9a15a]/15 px-4 py-2 text-xs font-semibold tracking-wide text-[#3a2918] uppercase transition-colors hover:bg-[#c9a15a]/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isResolving ? "Resolving…" : "Open"}
      </button>
    </form>
  );
}
