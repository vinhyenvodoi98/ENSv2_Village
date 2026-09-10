"use client";

import { useCallback, useEffect, useState } from "react";
import { keccak256, toBytes, zeroAddress } from "viem";
import { CONTRACTS } from "@/lib/contracts/addresses";
import type { NamespaceNode } from "./useNamespaceTree";

export type LocalWildcardAgent = {
  label: string;
  owner: `0x${string}`;
  agentKey: `0x${string}`;
  createdAt: number;
  /// Registry this label would be minted into. Absent on entries written before task 29 (and on
  /// root-level spawns), which means the fleet's own registry.
  registry?: `0x${string}`;
  /// Parent's dotted name, so a preview spawned under a `Sovereign` shows its real full name
  /// (`<label>.<parent.fullName>`) instead of pretending to sit at the root.
  parentFullName?: string;
  /// `NamespaceNode.depth` of the parent + 1; drives where the ghost castle is clustered.
  depth?: number;
};

const STORAGE_KEY = `agentvillage:local-wildcard-agents:${CONTRACTS.chainId}`;

function read(): LocalWildcardAgent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalWildcardAgent[]) : [];
  } catch {
    return [];
  }
}

/// Task 14: browser-local list of labels "spawned" at the free `Wildcard` tier — no
/// `AgentRegistry.spawn` tx exists for these (see `NamespaceNode.isLocalPreview`), so they can
/// only ever be tracked client-side, not read off-chain like every other hook in `src/lib/ens/`.
/// `page.tsx` is responsible for dropping an entry here once the same label is later minted for
/// real (found in the real `AgentSpawned`-sourced tree) — that transition is what task 14's
/// "Register on-chain" lifecycle action performs.
export function useLocalWildcardAgents() {
  const [agents, setAgents] = useState<LocalWildcardAgent[]>(() => read());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    } catch {
      // best-effort only — a full/blocked localStorage just means this demo list resets on reload
    }
  }, [agents]);

  const add = useCallback((agent: LocalWildcardAgent) => {
    setAgents((prev) => (prev.some((a) => localWildcardKey(a) === localWildcardKey(agent)) ? prev : [...prev, agent]));
  }, []);

  /// Keyed by registry *and* label: the same label can legitimately exist in two different
  /// sub-registries, and dropping both when one gets minted would erase a live preview.
  const remove = useCallback((key: string) => {
    setAgents((prev) => prev.filter((a) => localWildcardKey(a) !== key));
  }, []);

  return { agents, add, remove };
}

/// Identity of a local preview: which registry it would be minted into, plus its label.
export function localWildcardKey(agent: Pick<LocalWildcardAgent, "label" | "registry">): string {
  return `${(agent.registry ?? CONTRACTS.agentRegistry).toLowerCase()}:${agent.label}`;
}

/// Builds the synthetic `NamespaceNode` a local-only wildcard label renders as — every field
/// downstream components (`AgentNode`, `RecordTable`, `LadderProgress`, ...) already know how to
/// read, so nothing needs a special case beyond checking `isLocalPreview`. `agentKey`/`owner`
/// come from whatever the spawn form captured (task 14: a freshly generated signing key, and the
/// connected wallet, respectively) rather than any chain read, since none exists yet.
export function localWildcardToNode(agent: LocalWildcardAgent): NamespaceNode {
  return {
    label: agent.label,
    labelhash: keccak256(toBytes(agent.label)),
    owner: agent.owner,
    agentKey: agent.agentKey,
    tier: "Wildcard",
    expiry: 0n,
    revoked: false,
    revocable: false,
    transferable: false,
    resolver: zeroAddress,
    subregistry: zeroAddress,
    heartbeatCount: 0n,
    fullName: `${agent.label}.${agent.parentFullName ?? CONTRACTS.parentName}`,
    depth: agent.depth ?? 0,
    registry: agent.registry ?? CONTRACTS.agentRegistry,
    children: [],
    isLocalPreview: true,
  };
}
