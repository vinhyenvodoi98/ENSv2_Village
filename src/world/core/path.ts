import { coordKey, distance, neighbors } from "./hex";
import type { AxialCoord } from "./types";

export interface PathfindOptions {
  /** Return false to treat a coord as impassable. Defaults to always passable. */
  isWalkable?: (coord: AxialCoord) => boolean;
  /** Safety cap on explored nodes so a bad grid can't hang a tick. */
  maxIterations?: number;
  /** Cost of stepping from one hex to an adjacent one. Defaults to a flat 1 per step. */
  edgeCost?: (from: AxialCoord, to: AxialCoord) => number;
  /**
   * Lower bound on `edgeCost` across the whole grid — keeps the A* heuristic
   * admissible when `edgeCost` can go below 1 (e.g. a discount for reusing
   * an existing road). Defaults to 1, matching the default flat cost.
   */
  minEdgeCost?: number;
}

/** A* search over the hex grid. Returns null if no path exists. */
export function findPath(
  start: AxialCoord,
  goal: AxialCoord,
  options: PathfindOptions = {}
): AxialCoord[] | null {
  const isWalkable = options.isWalkable ?? (() => true);
  const maxIterations = options.maxIterations ?? 2000;
  const edgeCost = options.edgeCost ?? (() => 1);
  const minEdgeCost = options.minEdgeCost ?? 1;
  const heuristic = (coord: AxialCoord) => distance(coord, goal) * minEdgeCost;

  const startKey = coordKey(start);
  const goalKey = coordKey(goal);

  const openSet = new Map<string, AxialCoord>([[startKey, start]]);
  const cameFrom = new Map<string, string>();
  const coordsByKey = new Map<string, AxialCoord>([[startKey, start], [goalKey, goal]]);

  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristic(start)]]);

  let iterations = 0;

  while (openSet.size > 0) {
    if (++iterations > maxIterations) return null;

    let currentKey = "";
    let currentF = Infinity;
    for (const key of openSet.keys()) {
      const f = fScore.get(key) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentKey = key;
      }
    }

    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, coordsByKey, currentKey);
    }

    const current = openSet.get(currentKey)!;
    openSet.delete(currentKey);

    for (const neighbor of neighbors(current)) {
      if (!isWalkable(neighbor)) continue;

      const neighborKey = coordKey(neighbor);
      coordsByKey.set(neighborKey, neighbor);

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + edgeCost(current, neighbor);
      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(neighbor));
        if (!openSet.has(neighborKey)) {
          openSet.set(neighborKey, neighbor);
        }
      }
    }
  }

  return null;
}

function reconstructPath(
  cameFrom: Map<string, string>,
  coordsByKey: Map<string, AxialCoord>,
  currentKey: string
): AxialCoord[] {
  const path: AxialCoord[] = [coordsByKey.get(currentKey)!];
  let key = currentKey;
  while (cameFrom.has(key)) {
    key = cameFrom.get(key)!;
    path.unshift(coordsByKey.get(key)!);
  }
  return path;
}
