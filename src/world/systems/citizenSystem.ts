import { coordKey, parseCoordKey } from "../core/hex";
import { createRng, hashString, type SeededRng } from "../core/rng";
import { CITIZENS, FRAME_BUDGET, POPULATION_CAP, WORLD_SEED } from "../config/world.config";
import { pickOutfitId } from "../components/Citizens/outfits";
import type { AxialCoord, Citizen, FortressEntity } from "../core/types";
import type { WorldState } from "../state/useWorldStore";

/** Unweighted shortest path over the road adjacency graph, as a list of coordKeys. */
function bfsPath(fromKey: string, toKey: string, adjacency: Map<string, string[]>): string[] | null {
  if (fromKey === toKey) return [fromKey];

  const visited = new Set([fromKey]);
  const cameFrom = new Map<string, string>();
  const queue: string[] = [fromKey];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      cameFrom.set(next, current);
      if (next === toKey) {
        const path = [toKey];
        let key = toKey;
        while (cameFrom.has(key)) {
          key = cameFrom.get(key)!;
          path.unshift(key);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Every fortress reachable from `originKey` over the road network, `originKey` itself excluded. */
function reachableFortresses(
  originKey: string,
  fortressList: FortressEntity[],
  adjacency: Map<string, string[]>
): FortressEntity[] {
  const visited = new Set([originKey]);
  const queue: string[] = [originKey];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return fortressList.filter((fortress) => {
    const key = coordKey(fortress.coord);
    return key !== originKey && visited.has(key);
  });
}

function buildFortressPath(
  originCoord: AxialCoord,
  targetCoord: AxialCoord,
  adjacency: Map<string, string[]>
): AxialCoord[] | null {
  const keys = bfsPath(coordKey(originCoord), coordKey(targetCoord), adjacency);
  return keys ? keys.map(parseCoordKey) : null;
}

function randomBetween(rng: SeededRng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

/**
 * New citizens for a freshly built (or upgraded) fortress, capped so
 * `POPULATION_CAP` is never exceeded across the whole world. Every spawned
 * citizen starts idling at home — it picks its first real destination the
 * moment its idle timer expires, same as any other citizen.
 */
export function spawnCitizensForFortress(fortress: FortressEntity, currentTotal: number): Citizen[] {
  const room = Math.max(0, POPULATION_CAP - currentTotal);
  const wanted = CITIZENS.citizensPerTier * fortress.tier;
  const count = Math.min(room, wanted);

  const citizens: Citizen[] = [];
  for (let i = 0; i < count; i++) {
    const id = `citizen-${fortress.id}-${i}`;
    const rng = createRng(hashString(id));
    citizens.push({
      id,
      fortressId: fortress.id,
      originId: fortress.id,
      targetId: fortress.id,
      position: fortress.coord,
      status: "idle",
      path: [],
      progress: 0,
      idleRemaining: randomBetween(rng, CITIZENS.idleMinSec, CITIZENS.idleMaxSec),
      outfitId: pickOutfitId(rng),
      lateralSign: rng.next() < 0.5 ? -1 : 1,
      animPhase: rng.next() * Math.PI * 2,
    });
  }
  return citizens;
}

interface TickContext {
  fortressesById: Map<string, FortressEntity>;
  fortressList: FortressEntity[];
  adjacency: Map<string, string[]>;
  rng: SeededRng;
  /** Shared across every citizen this tick — new-path searches are the only expensive step, so this is what gets rationed. */
  pathfindBudget: { remaining: number };
}

function startNewLeg(citizen: Citizen, ctx: TickContext): Citizen {
  const origin = ctx.fortressesById.get(citizen.targetId);
  if (!origin || ctx.pathfindBudget.remaining <= 0) {
    // No pathfinding budget left this tick (or the fortress is gone) — try again next tick.
    return { ...citizen, idleRemaining: 0.1 };
  }

  const candidates = reachableFortresses(coordKey(origin.coord), ctx.fortressList, ctx.adjacency);
  if (candidates.length === 0) {
    // Nothing reachable yet (e.g. the only fortress in the world) — wait out a full idle span before rechecking.
    return { ...citizen, idleRemaining: randomBetween(ctx.rng, CITIZENS.idleMinSec, CITIZENS.idleMaxSec) };
  }

  const destination = ctx.rng.pick(candidates);
  const path = buildFortressPath(origin.coord, destination.coord, ctx.adjacency);
  ctx.pathfindBudget.remaining -= 1;

  if (!path || path.length < 2) {
    return { ...citizen, idleRemaining: randomBetween(ctx.rng, CITIZENS.idleMinSec, CITIZENS.idleMaxSec) };
  }

  return {
    ...citizen,
    originId: origin.id,
    targetId: destination.id,
    status: "walking",
    path,
    progress: 0,
  };
}

function stepCitizen(citizen: Citizen, dtSeconds: number, ctx: TickContext): Citizen {
  if (citizen.status === "idle") {
    const idleRemaining = citizen.idleRemaining - dtSeconds;
    return idleRemaining > 0 ? { ...citizen, idleRemaining } : startNewLeg(citizen, ctx);
  }

  const steps = Math.max(1, citizen.path.length - 1);
  const progress = citizen.progress + (dtSeconds * CITIZENS.walkSpeed) / steps;

  if (progress >= 1) {
    return {
      ...citizen,
      status: "idle",
      progress: 1,
      position: citizen.path[citizen.path.length - 1],
      idleRemaining: randomBetween(ctx.rng, CITIZENS.idleMinSec, CITIZENS.idleMaxSec),
    };
  }

  return { ...citizen, progress };
}

/**
 * Advances every citizen by one fixed tick — idling, waking, picking a new
 * destination, and walking. Pure over `WorldState` (no React, no three), so
 * it runs identically from a render loop's accumulator or a plain test.
 */
export function tickCitizens(state: WorldState, dtSeconds: number): Map<string, Citizen> {
  if (state.citizens.size === 0) return state.citizens;

  const fortressList = state.fortressList;
  const ctx: TickContext = {
    fortressesById: state.fortresses,
    fortressList,
    adjacency: state.roadAdjacency,
    rng: createRng(hashString(`citizen-tick-${state.tick}`) ^ WORLD_SEED),
    pathfindBudget: { remaining: FRAME_BUDGET.maxPathfindsPerTick },
  };

  const next = new Map<string, Citizen>();
  for (const [id, citizen] of state.citizens) {
    next.set(id, stepCitizen(citizen, dtSeconds, ctx));
  }
  return next;
}
