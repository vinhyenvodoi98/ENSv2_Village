"use client";

import { useCallback, useState } from "react";

export const NAME_TABS = ["overview", "permissions", "records", "subnames", "lifecycle", "activity"] as const;
export type NameTab = (typeof NAME_TABS)[number];

const NAME_TAB_SET: readonly string[] = NAME_TABS;

function readTabFromLocation(): NameTab {
  if (typeof window === "undefined") return "overview";
  const value = new URL(window.location.href).searchParams.get("tab");
  return value && NAME_TAB_SET.includes(value) ? (value as NameTab) : "overview";
}

/// The selected tab lives in the URL (`?tab=records`) rather than only in React state, so a section
/// is linkable and survives a reload. `WorldDetailPanel` unmounts this tree whenever the drawer
/// closes and remounts it on the next castle click, and remounting re-reads the same URL — that's
/// what makes a re-click of the subject castle preserve the tab too, with no extra plumbing.
export function useNameTab(): [NameTab, (tab: NameTab) => void] {
  const [tab, setTabState] = useState<NameTab>(readTabFromLocation);

  const setTab = useCallback((next: NameTab) => {
    setTabState(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }, []);

  return [tab, setTab];
}
