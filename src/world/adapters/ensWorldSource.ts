import { AGENT_TIERS, type NamespaceNode } from "@/lib/ens";
import { coordKey, distance, ring } from "../core/hex";
import { hashString } from "../core/rng";
import { FORTRESS_BUILD_DISTANCE, LAYOUT, WORLD_RADIUS } from "../config/world.config";
import type { AxialCoord, FortressEntity } from "../core/types";
import type { FortressSource } from "./types";

/**
 * The ENS-backed source `adapters/types.ts` always had a slot for: one castle
 * per agent namespace, read off Sepolia, projected onto the hex field.
 *
 * This is the *only* module under `src/world/` that knows ENS exists, and it
 * runs at the page layer (once per refetch), never inside the render loop —
 * everything downstream of `loadFortresses()` sees plain `FortressEntity`
 * data. `NamespaceNode` is imported for its shape; `AGENT_TIERS` is imported
 * rather than re-listed so the tier ladder has exactly one definition.
 */

const ORIGIN: AxialCoord = { q: 0, r: 0 };

/** Flattened node + the parent it hangs off, so placement can walk depth by depth. */
interface PendingNode {
  node: NamespaceNode;
  ensKey: string;
  parentEnsKey: string | null;
}

/** Same key `flattenNamespace` uses, recomputed here so the adapter stays free of viem. */
function ensKeyOf(node: NamespaceNode): string {
  return `${node.registry.toLowerCase()}:${node.labelhash.toLowerCase()}`;
}

function flatten(nodes: NamespaceNode[], parentEnsKey: string | null, out: PendingNode[] = []): PendingNode[] {
  for (const node of nodes) {
    const ensKey = ensKeyOf(node);
    out.push({ node, ensKey, parentEnsKey });
    if (node.children.length > 0) flatten(node.children, ensKey, out);
  }
  return out;
}

/**
 * A `Leased` node past its expiry is still on chain and must still be on the
 * map — it just stops looking maintained. Same for anything revoked: the whole
 * point of showing `revoke` is that its consequence is visible.
 */
function isDerelict(node: NamespaceNode, nowSeconds: number): boolean {
  if (node.revoked) return true;
  return node.tier === "Leased" && node.expiry !== 0n && node.expiry < BigInt(Math.floor(nowSeconds));
}

/**
 * Picks the hex for one node: walk outward from its preferred ring around
 * `base`, starting at an offset derived from the labelhash, and take the first
 * hex that is free and at least `FORTRESS_BUILD_DISTANCE` from every castle
 * placed so far. Deterministic in both the starting offset and the probe
 * order, so the same namespace always lays out identically.
 */
function probeCoord(
  base: AxialCoord,
  preferredRadius: number,
  labelhash: string,
  placed: AxialCoord[],
  occupied: Set<string>
): AxialCoord {
  const seed = hashString(labelhash);

  for (let radius = preferredRadius; radius <= preferredRadius + LAYOUT.maxProbeRings; radius++) {
    const candidates = ring(base, radius);
    const start = seed % candidates.length;
    for (let i = 0; i < candidates.length; i++) {
      const coord = candidates[(start + i) % candidates.length];
      if (occupied.has(coordKey(coord))) continue;
      if (placed.some((other) => distance(other, coord) < FORTRESS_BUILD_DISTANCE)) continue;
      return coord;
    }
  }

  // Unreachable in practice — `maxProbeRings` rings around any base hold far
  // more slots than the namespace can have nodes — but never drop a node.
  return { q: base.q + preferredRadius + LAYOUT.maxProbeRings + 1, r: base.r };
}

/** Deterministic ordering: depth first, then labelhash. Never array or event order. */
function comparePending(a: PendingNode, b: PendingNode): number {
  if (a.node.depth !== b.node.depth) return a.node.depth - b.node.depth;
  return a.node.labelhash < b.node.labelhash ? -1 : a.node.labelhash > b.node.labelhash ? 1 : 0;
}

/**
 * Projects a whole namespace tree onto the hex field.
 *
 * Depth-0 agents ring the origin; a `Sovereign`'s children cluster around the
 * parent castle, so the map's shape *is* the namespace's shape. Parents are
 * always placed before their children (the sort is depth-major), which is what
 * lets a child anchor on its parent's hex.
 */
export function createEnsFortressSource(
  roots: NamespaceNode[],
  nowSeconds: number = Date.now() / 1000
): FortressSource {
  let cache: FortressEntity[] | null = null;

  function build(): FortressEntity[] {
    const pending = flatten(roots, null).sort(comparePending);
    const coordByKey = new Map<string, AxialCoord>();
    const occupied = new Set<string>();
    const placed: AxialCoord[] = [];

    return pending.map(({ node, ensKey, parentEnsKey }) => {
      const parentCoord = parentEnsKey ? coordByKey.get(parentEnsKey) : undefined;
      const base = parentCoord ?? ORIGIN;
      const preferredRadius = parentCoord ? LAYOUT.childRingRadius : LAYOUT.rootRingRadius;
      const coord = probeCoord(base, preferredRadius, node.labelhash, placed, occupied);

      coordByKey.set(ensKey, coord);
      occupied.add(coordKey(coord));
      placed.push(coord);

      return {
        ensKey,
        coord,
        name: node.label,
        fullName: node.fullName,
        tier: Math.max(0, AGENT_TIERS.indexOf(node.tier)),
        // A node whose parent was itself dropped (shouldn't happen — the tree
        // is walked top-down) falls back to a root-ring castle rather than a
        // dangling road to nowhere.
        parentEnsKey: parentCoord ? parentEnsKey : null,
        isLocalPreview: node.isLocalPreview,
        derelict: isDerelict(node, nowSeconds),
      } satisfies FortressEntity;
    });
  }

  return {
    loadFortresses() {
      cache ??= build();
      return cache;
    },
    requiredWorldRadius() {
      const fortresses = this.loadFortresses();
      const furthest = fortresses.reduce((max, f) => Math.max(max, distance(ORIGIN, f.coord)), 0);
      return Math.max(WORLD_RADIUS, furthest + LAYOUT.edgeMargin);
    },
  };
}
