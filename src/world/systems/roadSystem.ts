import { coordKey, distance } from "../core/hex";
import { findPath } from "../core/path";
import { ROADS } from "../config/world.config";
import type { AxialCoord, FortressEntity, Road, Tile } from "../core/types";

function edgeKey(a: AxialCoord, b: AxialCoord): string {
  const ka = coordKey(a);
  const kb = coordKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Every hex-to-hex edge already carried by some road, undirected. */
function collectRoadEdges(roads: Iterable<Road>): Set<string> {
  const edges = new Set<string>();
  for (const road of roads) {
    for (let i = 0; i < road.path.length - 1; i++) {
      edges.add(edgeKey(road.path[i], road.path[i + 1]));
    }
  }
  return edges;
}

function tileHeight(tiles: Map<string, Tile>, coord: AxialCoord): number {
  return tiles.get(coordKey(coord))?.height ?? 0;
}

/**
 * A* path that prefers gentle terrain (cost grows with the height step) and
 * reusing edges already on the network (discounted cost), so new
 * construction merges onto trunk routes instead of drawing a fresh star of
 * parallel roads.
 */
function planPath(from: AxialCoord, to: AxialCoord, tiles: Map<string, Tile>, existingEdges: Set<string>) {
  return findPath(from, to, {
    isWalkable: (coord) => tiles.has(coordKey(coord)),
    minEdgeCost: ROADS.reuseDiscount,
    edgeCost: (a, b) => {
      const heightDiff = Math.abs(tileHeight(tiles, b) - tileHeight(tiles, a));
      const base = 1 + heightDiff * ROADS.heightCostWeight;
      return existingEdges.has(edgeKey(a, b)) ? base * ROADS.reuseDiscount : base;
    },
  });
}

/**
 * Connects a newly placed fortress to its nearest already-standing fortress
 * with a fresh road, returned for the caller to commit to the store. Returns
 * null for the very first fortress — there's no network yet to join.
 */
export function connectFortress(
  newFortress: FortressEntity,
  otherFortresses: FortressEntity[],
  tiles: Map<string, Tile>,
  existingRoads: Map<string, Road>
): Road | null {
  if (otherFortresses.length === 0) return null;

  const nearest = otherFortresses.reduce((closest, candidate) =>
    distance(candidate.coord, newFortress.coord) < distance(closest.coord, newFortress.coord) ? candidate : closest
  );

  const existingEdges = collectRoadEdges(existingRoads.values());
  const path = planPath(newFortress.coord, nearest.coord, tiles, existingEdges);
  if (!path) return null;

  return { id: `road-${newFortress.ensKey}-${nearest.ensKey}`, path };
}

/** Stable, order-independent id for the road that draws one parent-child ENS link. */
export function parentRoadId(parentEnsKey: string, childEnsKey: string): string {
  return `road:${parentEnsKey}->${childEnsKey}`;
}

/**
 * Task 29: roads stop meaning "nearest neighbour" and start meaning
 * "namespace parentage" — a road exists exactly when one agent was spawned in
 * another's sub-registry, so the ENS tree is legible from the map alone.
 *
 * Reconciles rather than rebuilds: a link that already has a road keeps its
 * existing path, so a new block never re-triggers every ribbon's draw-in
 * animation. New links are planned in a deterministic order and each sees the
 * edges laid before it, so they still merge onto trunk routes.
 */
export function buildParentRoads(
  fortressList: FortressEntity[],
  tiles: Map<string, Tile>,
  existingRoads: Map<string, Road>
): Map<string, Road> {
  const byKey = new Map(fortressList.map((fortress) => [fortress.ensKey, fortress]));
  const roads = new Map<string, Road>();
  const edges = new Set<string>();

  const links = fortressList
    .filter((fortress) => fortress.parentEnsKey && byKey.has(fortress.parentEnsKey))
    .sort((a, b) => (a.ensKey < b.ensKey ? -1 : a.ensKey > b.ensKey ? 1 : 0));

  const addEdges = (road: Road) => {
    for (let i = 0; i < road.path.length - 1; i++) edges.add(edgeKey(road.path[i], road.path[i + 1]));
  };

  // Existing roads for links that survived contribute their edges up front, so
  // a newly planned road is discounted onto them the same way it would have
  // been had it been planned in the same pass.
  for (const child of links) {
    const id = parentRoadId(child.parentEnsKey!, child.ensKey);
    const existing = existingRoads.get(id);
    if (existing) {
      roads.set(id, existing);
      addEdges(existing);
    }
  }

  for (const child of links) {
    const id = parentRoadId(child.parentEnsKey!, child.ensKey);
    if (roads.has(id)) continue;
    const parent = byKey.get(child.parentEnsKey!)!;
    const path = planPath(child.coord, parent.coord, tiles, edges);
    if (!path) continue;
    const road: Road = { id, path };
    roads.set(id, road);
    addEdges(road);
  }

  return roads;
}

/**
 * Undirected adjacency derived from every road's hex sequence — the graph
 * citizen pathing (task 25) walks directly, without touching A* or presets.
 */
export function buildRoadAdjacency(roads: Iterable<Road>): Map<string, string[]> {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };

  for (const road of roads) {
    for (let i = 0; i < road.path.length - 1; i++) {
      const a = coordKey(road.path[i]);
      const b = coordKey(road.path[i + 1]);
      link(a, b);
      link(b, a);
    }
  }

  return new Map(Array.from(adjacency, ([key, neighborSet]) => [key, Array.from(neighborSet)]));
}
