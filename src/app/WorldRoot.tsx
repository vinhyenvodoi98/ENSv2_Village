"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletHud } from "@/components/wallet/WalletHud";
import { NamespaceTree } from "@/components/tree/NamespaceTree";
import type { SelectedAgent } from "@/components/tree/AgentSubtree";
import { AgentDetailPanel } from "@/components/detail/AgentDetailPanel";
import { SpawnAgentForm } from "@/components/lifecycle/SpawnAgentForm";
import { CONTRACTS } from "@/lib/contracts/addresses";
import {
  buildResolverIndex,
  flattenNamespace,
  localWildcardKey,
  localWildcardToNode,
  mergeLocalPreviews,
  namespaceKey,
  useLocalWildcardAgents,
  useNamespaceTree,
  type NamespaceNode,
} from "@/lib/ens";
import { createEnsFortressSource } from "@/world/adapters/ensWorldSource";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectSelectedFortressId, selectSpawnFormOpen } from "@/world/state/selectors";
import { WorldHud } from "@/world/ui/WorldHud";
import { DebugPanel } from "@/world/ui/DebugPanel";
import { BuildBar } from "@/world/ui/BuildBar";

const WorldCanvas = dynamic(
  () => import("@/world/components/Scene/WorldCanvas").then((mod) => mod.WorldCanvas),
  { ssr: false }
);

/**
 * The root screen: one map, one namespace.
 *
 * This file is the seam task 29 is about. It is the *only* place that both
 * reads Sepolia and talks to the world engine, and it moves data strictly one
 * way: chain → `NamespaceNode[]` → `FortressEntity[]` → `syncFortressesFromEns`.
 * Nothing under `src/world/` ever imports wagmi or viem, which is what keeps
 * the engine runnable in the `/threejs` sandbox with no RPC at all.
 *
 * Selection is likewise single-sourced: the store's `selectedFortressId` holds
 * an `ensKey`, and the map, the sidebar tree and the detail panel all read it.
 * There is no second "selected agent" state to keep in sync.
 */
export default function WorldRoot() {
  const { data: tree, isLoading, error, refetch, isFetching } = useNamespaceTree();
  const { agents: localAgents, add: addLocalAgent, remove: removeLocalAgent } = useLocalWildcardAgents();

  const selectedFortressId = useWorldStore(selectSelectedFortressId);
  const selectFortress = useWorldStore((state) => state.selectFortress);
  const focusFortress = useWorldStore((state) => state.focusFortress);
  const syncFortresses = useWorldStore((state) => state.syncFortressesFromEns);
  const setMode = useWorldStore((state) => state.setMode);
  // The map opens this (clicking empty ground), so the flag lives in the store
  // rather than here — see `WorldState.spawnFormOpen`.
  const spawnOpen = useWorldStore(selectSpawnFormOpen);
  const setSpawnOpen = useWorldStore((state) => state.setSpawnFormOpen);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => setMode("ens"), [setMode]);

  // Task 14's reconcile, moved here with the rest of the root screen: once a
  // locally-previewed wildcard label is minted for real it shows up in the
  // event-sourced tree, so the ghost has to go or the castle renders twice.
  // Keyed by registry + label — the same label in two sub-registries is two
  // different agents.
  const mintedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const node of flattenNamespace(tree ?? []).values()) {
      keys.add(localWildcardKey({ label: node.label, registry: node.registry }));
    }
    return keys;
  }, [tree]);

  useEffect(() => {
    for (const agent of localAgents) {
      const key = localWildcardKey(agent);
      if (mintedKeys.has(key)) removeLocalAgent(key);
    }
  }, [localAgents, mintedKeys, removeLocalAgent]);

  const localNodes = useMemo(
    () => localAgents.filter((a) => !mintedKeys.has(localWildcardKey(a))).map(localWildcardToNode),
    [localAgents, mintedKeys]
  );

  const combinedTree = useMemo(() => mergeLocalPreviews(tree ?? [], localNodes), [tree, localNodes]);
  const directory = useMemo(() => flattenNamespace(combinedTree), [combinedTree]);
  const resolverIndex = useMemo(() => buildResolverIndex(combinedTree), [combinedTree]);

  // Chain data becomes plain map data here and nowhere else.
  const fortressPlan = useMemo(() => {
    const source = createEnsFortressSource(combinedTree, CONTRACTS.parentName);
    return { fortresses: source.loadFortresses(), worldRadius: source.requiredWorldRadius() };
  }, [combinedTree]);

  useEffect(() => {
    syncFortresses(fortressPlan.fortresses, fortressPlan.worldRadius);
  }, [fortressPlan, syncFortresses]);

  const selectedNode = selectedFortressId ? directory.get(selectedFortressId) ?? null : null;
  const selectedAgent: SelectedAgent | null = selectedNode
    ? { registry: selectedNode.registry, labelhash: selectedNode.labelhash }
    : null;

  const selectAgent = useCallback(
    (agent: SelectedAgent) => focusFortress(namespaceKey(agent.registry, agent.labelhash)),
    [focusFortress]
  );

  const closePanel = useCallback(() => selectFortress(null), [selectFortress]);

  // Every place that offers "spawn at the root" — the HUD button, the empty-
  // tree CTA, and the root chip in the sidebar — goes through this single
  // path, so they can never disagree about what "root" means.
  const openRootSpawn = useCallback(() => {
    selectFortress(null);
    setSpawnOpen(true);
  }, [selectFortress, setSpawnOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (spawnOpen) setSpawnOpen(false);
      else selectFortress(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [spawnOpen, setSpawnOpen, selectFortress]);

  const isEmpty = !isLoading && !error && combinedTree.length === 0;

  return (
    <div className="fixed inset-0 h-dvh w-dvw overflow-hidden">
      {/* Terrain paints immediately and castles fade in behind it as the tree
          resolves — a slow RPC must never show a blank screen. */}
      <WorldCanvas />
      <WorldHud />
      <BuildBar />

      {/* Wallet widget stacked above the dev-only debug panel — both anchor
          to the same corner, so they share one positioned container instead
          of two independent `absolute right-4 top-4` divs landing on top of
          each other. */}
      <div className="pointer-events-none absolute right-4 top-4 z-30 flex flex-col items-end gap-3">
        <WalletHud />
        <DebugPanel className="pointer-events-none" />
      </div>

      {/* Lives directly above where the form itself opens (bottom-right), not
          next to the wallet button — the two are unrelated actions. Styled as
          a banner plaque (fortress banner red/gold, beveled edge that presses
          in on click) rather than the rounded gradient pill `ConnectWallet`
          uses — that pill is a borrowed, recognizable "connect wallet" pattern;
          this button is a diegetic game action and reads better in the same
          red/gold/serif language as the castles' own banners (`theme.ts`
          `fortress.banner` `#8e1f2b`, `cloth.gold` `#c9a15a`). */}
      <div className="pointer-events-none absolute bottom-6 right-4 z-30">
        <button
          type="button"
          onClick={() => (spawnOpen ? setSpawnOpen(false) : openRootSpawn())}
          title={spawnOpen ? undefined : `Spawn a new agent under ${CONTRACTS.parentName}`}
          className={[
            "pointer-events-auto flex h-12 items-center justify-center gap-2 rounded-sm border-2 px-6",
            "font-serif text-sm font-bold uppercase tracking-[0.15em]",
            "transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-[2px]",
            spawnOpen
              ? "border-zinc-500 bg-gradient-to-b from-zinc-700 to-zinc-900 text-zinc-200 shadow-[0_4px_0_0_#111827,0_8px_14px_rgba(0,0,0,0.4)] active:shadow-[0_1px_0_0_#111827]"
              : "border-[#c9a15a] bg-gradient-to-b from-[#8e1f2b] to-[#4c0f16] text-[#f3e6c8] shadow-[0_4px_0_0_#3d0d13,0_8px_14px_rgba(0,0,0,0.45)] hover:border-[#e0bd7a] active:shadow-[0_1px_0_0_#3d0d13]",
          ].join(" ")}
        >
          <span aria-hidden className="text-base leading-none">
            {spawnOpen ? "✕" : "⚑"}
          </span>
          {spawnOpen ? "Close" : "Spawn Agent"}
        </button>
      </div>

      <NamespaceSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((open) => !open)}
        nodes={combinedTree}
        selected={selectedAgent}
        onSelect={selectAgent}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        isEmpty={isEmpty}
        onSpawnFirst={openRootSpawn}
        onSpawnRoot={openRootSpawn}
      />

      {spawnOpen && (
        // Centered modal, not a corner popup: this is the "type a name, sign
        // a tx" moment, the one action every other affordance (HUD button,
        // root chip, empty-tree CTA) funnels into — it shouldn't be tucked in
        // a corner where it's easy to miss it opened at all.
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close spawn form"
            onClick={() => setSpawnOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md">
            <button
              type="button"
              onClick={() => setSpawnOpen(false)}
              aria-label="Close"
              className="absolute -right-2 -top-2 z-20 rounded-full border border-[#c9a15a] bg-zinc-900 p-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              ✕
            </button>
            <SpawnAgentForm
              // Root-only, on purpose: this modal is reachable solely via the
              // "Spawn Agent" HUD button, the root chip, and the empty-tree
              // CTA — all three route through `openRootSpawn`, which clears
              // selection first. It never reads `selectedNode`, so it can't
              // inherit a leftover parent from whatever castle happened to be
              // selected earlier. Spawning a *child* lives exclusively in
              // that child's own parent panel below.
              parent={null}
              onSpawnedLocally={(agent) => {
                addLocalAgent(agent);
                setSpawnOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <AgentDetailPanel
        node={selectedNode}
        directory={directory}
        resolverIndex={resolverIndex}
        onClose={closePanel}
        onSelectChild={selectAgent}
        onSpawnedLocally={addLocalAgent}
      />
    </div>
  );
}

function NamespaceSidebar({
  open,
  onToggle,
  nodes,
  selected,
  onSelect,
  isLoading,
  isFetching,
  error,
  onRetry,
  isEmpty,
  onSpawnFirst,
  onSpawnRoot,
}: {
  open: boolean;
  onToggle: () => void;
  nodes: NamespaceNode[];
  selected: SelectedAgent | null;
  onSelect: (agent: SelectedAgent) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRetry: () => void;
  isEmpty: boolean;
  onSpawnFirst: () => void;
  onSpawnRoot: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="pointer-events-auto absolute left-4 top-4 z-30 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/75"
      >
        {open ? "Hide agents" : `Agents (${nodes.length})`}
      </button>

      {/* The list view is not decoration: it's the way through when the tree
          gets large, and the escape hatch when WebGL can't run at all. */}
      <aside
        className={[
          "pointer-events-auto absolute bottom-0 left-0 top-0 z-20 w-80 max-w-[85vw] overflow-y-auto border-r border-white/10 bg-zinc-950/85 px-4 pb-6 pt-16 text-zinc-100 backdrop-blur transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        {error && (
          <div className="mb-4 flex flex-col items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-xs">
            <p>
              <strong>Couldn&apos;t read the agent tree from Sepolia.</strong> The map below shows terrain only —
              it is <em>not</em> an empty fleet.
            </p>
            <p className="font-mono text-[11px] text-red-300">{error.message}</p>
            <button
              type="button"
              onClick={onRetry}
              disabled={isFetching}
              className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}

        {isLoading && <p className="mb-4 text-xs text-zinc-400">Reading agent tree from Sepolia…</p>}

        {isEmpty && (
          <div className="mb-4 flex flex-col items-start gap-2 rounded-lg border border-white/15 bg-white/5 p-3 text-xs">
            <p>
              No agents under <span className="font-mono">{CONTRACTS.parentName}</span> yet — the map is empty
              because the chain is.
            </p>
            <button
              type="button"
              onClick={onSpawnFirst}
              className="rounded-md bg-white px-3 py-1 font-semibold text-black hover:bg-zinc-200"
            >
              Spawn the first agent
            </button>
          </div>
        )}

        <NamespaceTree nodes={nodes} selected={selected} onSelect={onSelect} onSpawnRoot={onSpawnRoot} />
      </aside>
    </>
  );
}
