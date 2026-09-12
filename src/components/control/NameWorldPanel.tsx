"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { zeroAddress } from "viem";
import { useEnsName } from "@/lib/ens/useEnsName";
import { useEnsAvatars } from "@/lib/ens/useEnsAvatars";
import {
  subnameRegistryOf,
  useNameChildren,
  useSubnameScanProgress,
  type EnsChildName,
} from "@/lib/ens/useNameChildren";
import { createEnsNameFortressSource, SUBJECT_ENS_KEY } from "@/world/adapters/ensControlWorldSource";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectSelectedFortressId } from "@/world/state/selectors";
import { BuildBar } from "@/world/ui/BuildBar";
import { ControlPanelWorldShell } from "./ControlPanelWorldShell";
import { NameChildDetail, NameStateDetail } from "./NameStateDetail";
import { ScanLoadingModal } from "@/components/shared/ScanLoadingModal";
import { Panel } from "./Panel";
import { useNameTab } from "./useNameTab";
import { WorldDetailPanel } from "./WorldDetailPanel";

const WorldCanvas = dynamic(() => import("@/world/components/Scene/WorldCanvas").then((mod) => mod.WorldCanvas), {
  ssr: false,
});

/// `/ens/[name]`, redesigned onto the same hex-and-castle map `/` renders (task 34): this name is
/// the castle at the center, its direct subnames ring it, and clicking either opens the same
/// read-only ENSv2 state task 33 already built — `NameStateDetail` for the subject, a compact card
/// for a subname. The map is fed by `ensControlWorldSource.ts`, a sibling to the root's own
/// `ensWorldSource.ts` that never touches `AgentRegistry` — task 33's scope decision applies here
/// exactly as it does to the rest of this route.
export function NameWorldPanel({ name }: { name: string }) {
  const { data: state, isPending, isError, error } = useEnsName(name);
  const isStale = !!state && state.name !== name;
  const resolvedState = isStale ? undefined : state;

  const { data: subnamesResult } = useNameChildren(resolvedState);
  // Same staleness guard `resolvedState` applies to the subject name, one level down: React Query
  // keeps the previous name's children on screen across a navigation (`keepPreviousData`), and
  // ringing *this* castle with the *last* name's subnames is worse than showing none.
  const scanTarget = subnameRegistryOf(resolvedState);
  const subnames = subnamesResult?.registry === scanTarget ? subnamesResult : undefined;
  const subnamesLoading = !!resolvedState && !!scanTarget && !subnames;
  const scanProgress = useSubnameScanProgress(resolvedState);
  const avatarNames = useMemo(
    () => resolvedState
      ? [resolvedState.name, ...(subnames?.children.map((child) => child.fullName) ?? [])]
      : [],
    [resolvedState, subnames]
  );
  const { data: avatarsByName } = useEnsAvatars(avatarNames);

  const setMode = useWorldStore((store) => store.setMode);
  const clearCameraFocus = useWorldStore((store) => store.clearCameraFocus);
  const syncFortresses = useWorldStore((store) => store.syncFortressesFromEns);
  const selectFortress = useWorldStore((store) => store.selectFortress);
  const selectedFortressId = useWorldStore(selectSelectedFortressId);
  const [tab, setTab] = useNameTab();

  useEffect(() => {
    setMode("control-panel");
    // A castle focused/zoomed-in on `/` or `/address/[addr]` is store state, not page state — drop
    // it so this page's map opens on the default centered framing instead of inheriting whatever
    // camera position the last page left behind.
    clearCameraFocus();
    return () => setMode("ens");
  }, [setMode, clearCameraFocus]);

  const fortressPlan = useMemo(() => {
    if (!resolvedState) return null;
    const source = createEnsNameFortressSource(
      { ensKey: SUBJECT_ENS_KEY, name: resolvedState.label, fullName: resolvedState.name },
      subnames?.enumerable
        ? subnames.children.map((child) => ({
            ensKey: child.ensKey,
            label: child.label,
            fullName: child.fullName,
            hasResolver: !!child.resolver && child.resolver !== zeroAddress,
            hasSubregistry: !!child.subregistry && child.subregistry !== zeroAddress,
            derelict: child.status !== "registered",
          }))
        : [],
      avatarsByName
    );
    return { fortresses: source.loadFortresses(), worldRadius: source.requiredWorldRadius() };
  }, [resolvedState, subnames, avatarsByName]);

  useEffect(() => {
    if (fortressPlan) syncFortresses(fortressPlan.fortresses, fortressPlan.worldRadius);
  }, [fortressPlan, syncFortresses]);

  const childByKey = useMemo(() => {
    const map = new Map<string, EnsChildName>();
    for (const child of subnames?.children ?? []) map.set(child.ensKey, child);
    return map;
  }, [subnames]);

  const selectedChild = selectedFortressId ? (childByKey.get(selectedFortressId) ?? null) : null;
  const isSubjectSelected = selectedFortressId === SUBJECT_ENS_KEY;
  const closePanel = () => selectFortress(null);

  return (
    <ControlPanelWorldShell searchValue={name}>
      <WorldCanvas />
      <BuildBar />

      {isError ? (
        <CenteredMessage>
          <Panel title="Could not read this name">
            <p className="text-sm text-red-300">{error?.message ?? "The registry read failed."}</p>
          </Panel>
        </CenteredMessage>
      ) : isPending || !resolvedState ? (
        <CenteredMessage>
          <Panel title="Resolving">
            <p className="text-sm text-white/40">Walking the registries for {name}…</p>
          </Panel>
        </CenteredMessage>
      ) : null}

      <ScanLoadingModal
        active={subnamesLoading}
        progress={scanProgress}
        copy={{
          title: "Reading subnames",
          subject: name,
          scanning: "Scanning registry history",
          verifying: (found) =>
            `Re-checking ${found} subname${found === 1 ? "" : "s"} against live registry state`,
          hint: "ENSv2 has no subname index — they're recovered from registry history, then re-checked on-chain.",
          slowHint:
            "This registry has a long history, so the scan is running in several passes. The map stays usable while it finishes.",
          chip: "Reading subnames",
          count: (found) => `${found} found so far`,
        }}
      />

      <WorldDetailPanel
        open={isSubjectSelected || !!selectedChild}
        onClose={closePanel}
        wide={isSubjectSelected && tab === "permissions"}
      >
        {isSubjectSelected && resolvedState ? (
          <NameStateDetail
            state={resolvedState}
            subnames={subnames}
            avatar={avatarsByName?.[resolvedState.name]}
            tab={tab}
            onTabChange={setTab}
            targetFortressId={SUBJECT_ENS_KEY}
          />
        ) : selectedChild ? (
          <NameChildDetail child={selectedChild} />
        ) : null}
      </WorldDetailPanel>
    </ControlPanelWorldShell>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="pointer-events-auto w-full max-w-md">{children}</div>
    </div>
  );
}
