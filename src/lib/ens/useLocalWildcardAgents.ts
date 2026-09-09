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
    setAgents((prev) => (prev.some((a) => a.label === agent.label) ? prev : [...prev, agent]));
  }, []);

  const remove = useCallback((label: string) => {
    setAgents((prev) => prev.filter((a) => a.label !== label));
  }, []);

  return { agents, add, remove };
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
    fullName: `${agent.label}.${CONTRACTS.parentName}`,
    depth: 0,
    registry: CONTRACTS.agentRegistry,
    children: [],
    isLocalPreview: true,
  };
}
