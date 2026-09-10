"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
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
      <DebugPanel />

      <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="pointer-events-auto">
          <ConnectWallet />
        </div>
        <button
          type="button"
          onClick={() => setSpawnOpen(!spawnOpen)}
          className="pointer-events-auto rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/75"
        >
          {spawnOpen ? "Close spawn form" : "Spawn agent"}
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
        onSpawnFirst={() => {
          selectFortress(null);
          setSpawnOpen(true);
        }}
      />

      {spawnOpen && (
        <div className="pointer-events-auto absolute bottom-20 right-4 z-30 w-[22rem] max-w-[calc(100vw-2rem)]">
          <SpawnAgentForm
            // A selected agent is the parent; nothing selected spawns at the
            // fleet root. The form itself refuses (with a reason) when the
            // parent has no sub-registry — it never silently retargets.
            parent={selectedNode}
            onSpawnedLocally={(agent) => {
              addLocalAgent(agent);
              setSpawnOpen(false);
            }}
          />
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

        <NamespaceTree nodes={nodes} selected={selected} onSelect={onSelect} />
      </aside>
    </>
  );
}
