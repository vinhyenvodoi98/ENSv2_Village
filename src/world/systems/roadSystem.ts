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

  return { id: `road-${newFortress.id}-${nearest.id}`, path };
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
