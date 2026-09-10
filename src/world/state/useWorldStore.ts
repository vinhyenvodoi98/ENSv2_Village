import { create } from "zustand";
import { coordKey } from "../core/hex";
import type { AxialCoord, Cart, Citizen, FortressEntity, Road, Tile, Weather, WeatherRenderState } from "../core/types";
import { DEFAULT_PRESET, presets } from "../config/presets";
import { POPULATION, TERRAIN, WORLD_RADIUS } from "../config/world.config";
import { getGeneratedFortressName } from "../adapters/sandboxNames";
import { buildParentRoads, buildRoadAdjacency, connectFortress } from "../systems/roadSystem";
import { spawnCitizensForFortress, tickCitizens } from "../systems/citizenSystem";
import { randomDwellSeconds, tickWeather } from "../systems/weatherSystem";

export type PresetName = keyof typeof presets;

/**
 * Who owns the castles on this map.
 *
 * - `ens` (the root page): every castle is a namespace node synced in through
 *   `syncFortressesFromEns`. Clicking an empty hex never builds anything —
 *   only a confirmed `spawn` tx can add a castle.
 * - `sandbox` (`/threejs`): the pre-task-29 terrain playground, where
 *   `placeFortress` builds freely. Kept so the world engine can still be run
 *   and eyeballed without an RPC.
 *
 * The two build paths must never both be live on one screen — that was the
 * "two ways to create a castle" problem task 29 exists to remove.
 */
export type WorldMode = "ens" | "sandbox";

/** Live-tunable knobs exposed by the dev-only debug panel. */
export interface DebugSettings {
  sunAngleDeg: number;
  /** Multiplier on the theme's fog spread; >1 = thicker fog, closer near/far. */
  fogDensity: number;
  terrainAmplitude: number;
  populationCap: number;
}

const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  sunAngleDeg: 30,
  fogDensity: 1,
  terrainAmplitude: TERRAIN.amplitude,
  populationCap: POPULATION.maxCitizensPerFortress,
};

/** A camera fly-to request. `token` makes repeat requests for the same hex distinguishable. */
export interface CameraFocus {
  coord: AxialCoord;
  token: number;
}

export interface WorldState {
  tiles: Map<string, Tile>;
  /**
   * `Array.from(tiles.values())` kept in lockstep with `tiles` by every
   * action that touches it. A selector must never derive this with a fresh
   * `Array.from`/`.filter` each call — zustand's `useSyncExternalStore`
   * compares selector output by reference, so a new array every render is
   * an infinite render loop, not just a wasted allocation.
   */
  tileList: Tile[];
  roads: Map<string, Road>;
  /** Kept in lockstep with `roads`, same reasoning as `tileList`. */
  roadList: Road[];
  /** Undirected coordKey -> neighboring coordKeys, derived from every road's path. Kept in lockstep with `roads`. */
  roadAdjacency: Map<string, string[]>;
  citizens: Map<string, Citizen>;
  /** Kept in lockstep with `citizens`, same reasoning as `tileList`. Insertion order stable — new citizens are appended, never reordered — so a renderer can use array index as a stable per-citizen instance slot. */
  citizenList: Citizen[];
  carts: Map<string, Cart>;
  weather: Weather;
  /** Seconds remaining until `weatherSystem` auto-advances `weather` to the next state in its cycle. */
  weatherTimer: number;
  /** Eased sky/fog/light/cloud/rain values `weatherSystem` blends `weather` toward every tick. */
  weatherRender: WeatherRenderState;
  tick: number;
  /** Hex under the pointer, set by throttled pointer-move raycasts. */
  hoveredCoord: AxialCoord | null;
  /** Active theme + shape kit bundle. Switching this re-skins the world live. */
  presetName: PresetName;
  debug: DebugSettings;
  mode: WorldMode;
  /** Hex radius the terrain must cover — grows with the namespace so no node ends up off-map. */
  worldRadius: number;

  fortresses: Map<string, FortressEntity>;
  /** Kept in lockstep with `fortresses`, same reasoning as `tileList`. */
  fortressList: FortressEntity[];
  /**
   * The single selection source of truth for the whole app: an `ensKey`, so
   * the map, the namespace sidebar and the ENS detail panel are literally
   * reading the same value rather than two states someone has to keep in sync.
   */
  selectedFortressId: string | null;
  /** Transient reason shown in the HUD when a build click is rejected. */
  buildMessage: string | null;
  /** Latest camera fly-to request, consumed by `CameraRig`. */
  cameraFocus: CameraFocus | null;
  /**
   * Whether the page's spawn form is open. Lives here, next to `buildMessage`,
   * because the map is what opens it: clicking empty ground in `ens` mode is a
   * request to spawn. The world can't mint anything itself — it can only ask —
   * which is what keeps wagmi out of `src/world/`.
   */
  spawnFormOpen: boolean;
  /**
   * Task 32: whether the "Found your kingdom" flow is open. Same reasoning as `spawnFormOpen` —
   * clicking the root castle when it's `unfinished` (no `AgentRegistry` wired yet) is a request
   * to found it, and the map can only ask, never mint/deploy anything itself.
   */
  foundKingdomOpen: boolean;

  setTiles: (tiles: Tile[]) => void;
  placeFortress: (coord: AxialCoord) => void;
  /** Reconciles the map against the namespace read off chain. See the action for why it isn't a rebuild. */
  syncFortressesFromEns: (entities: FortressEntity[], worldRadius?: number) => void;
  selectFortress: (ensKey: string | null) => void;
  /** Selects a castle *and* flies the camera to it — what the detail panel's child links do. */
  focusFortress: (ensKey: string) => void;
  setMode: (mode: WorldMode) => void;
  setSpawnFormOpen: (open: boolean) => void;
  setFoundKingdomOpen: (open: boolean) => void;
  setBuildMessage: (message: string | null) => void;
  setWeather: (weather: Weather) => void;
  advanceTick: () => void;
  /** Advances every fixed-tick world system (citizens, ...) by one step of `dtSeconds`. */
  tickWorld: (dtSeconds: number) => void;
  setHoveredCoord: (coord: AxialCoord | null) => void;
  setPreset: (name: PresetName) => void;
  setDebug: (patch: Partial<DebugSettings>) => void;
}

/**
 * Does a castle need its rendered instance replaced, or can the existing one
 * be kept? Anything visible must be compared here — miss a field and a
 * promote/revoke silently fails to show up; add an unstable one and every new
 * block restarts the grow-in animation.
 */
function fortressUnchanged(a: FortressEntity, b: FortressEntity): boolean {
  return (
    a.coord.q === b.coord.q &&
    a.coord.r === b.coord.r &&
    a.tier === b.tier &&
    a.name === b.name &&
    a.fullName === b.fullName &&
    a.derelict === b.derelict &&
    a.parentEnsKey === b.parentEnsKey &&
    !!a.isLocalPreview === !!b.isLocalPreview
  );
}

/** A ghost preview isn't a real settlement yet, and nobody lives in a ruin. */
function shouldHaveCitizens(fortress: FortressEntity): boolean {
  return !fortress.isLocalPreview && !fortress.derelict;
}

/**
 * The parts of world state derived from `(fortresses, tiles)`: tile occupancy,
 * the parent-link road network, its adjacency graph, and the citizen
 * population. Shared by `setTiles` and `syncFortressesFromEns` because either
 * one can land first — terrain regenerates when the namespace outgrows the
 * map, and the namespace arrives whenever the RPC answers.
 */
function deriveEnsWorld(state: WorldState, fortresses: Map<string, FortressEntity>, tiles: Map<string, Tile>) {
  const fortressList = Array.from(fortresses.values());

  const nextTiles = new Map(tiles);
  for (const [key, tile] of nextTiles) {
    if (tile.occupantId) nextTiles.set(key, { ...tile, occupantId: undefined });
  }
  for (const fortress of fortressList) {
    const key = coordKey(fortress.coord);
    const tile = nextTiles.get(key);
    if (tile) nextTiles.set(key, { ...tile, occupantId: fortress.ensKey });
  }

  const roads = buildParentRoads(fortressList, nextTiles, state.roads);

  // Citizens are keyed by their home castle, so reconciling them is a set
  // difference: drop the ones whose castle is gone (or has fallen derelict),
  // spawn for the ones that just appeared, leave everybody else walking.
  const citizens = new Map(state.citizens);
  const wantsCitizens = new Set(fortressList.filter(shouldHaveCitizens).map((f) => f.ensKey));
  let citizensChanged = false;

  for (const [id, citizen] of state.citizens) {
    if (!wantsCitizens.has(citizen.fortressId)) {
      citizens.delete(id);
      citizensChanged = true;
    }
  }

  const housed = new Set(Array.from(citizens.values(), (citizen) => citizen.fortressId));
  for (const fortress of fortressList) {
    if (!wantsCitizens.has(fortress.ensKey) || housed.has(fortress.ensKey)) continue;
    for (const citizen of spawnCitizensForFortress(fortress, citizens.size)) {
      citizens.set(citizen.id, citizen);
      citizensChanged = true;
    }
  }

  return {
    tiles: nextTiles,
    tileList: Array.from(nextTiles.values()),
    fortresses,
    fortressList,
    roads,
    roadList: Array.from(roads.values()),
    roadAdjacency: buildRoadAdjacency(roads.values()),
    ...(citizensChanged ? { citizens, citizenList: Array.from(citizens.values()) } : null),
  };
}

export const useWorldStore = create<WorldState>((set) => ({
  tiles: new Map(),
  tileList: [],
  roads: new Map(),
  roadList: [],
  roadAdjacency: new Map(),
  citizens: new Map(),
  citizenList: [],
  carts: new Map(),
  weather: { kind: "clear", intensity: 0 },
  weatherTimer: randomDwellSeconds("clear", 0),
  weatherRender: { stormBlend: 0, cloudOpacity: 0.08, rainDensity: 0 },
  tick: 0,
  hoveredCoord: null,
  presetName: DEFAULT_PRESET,
  debug: DEFAULT_DEBUG_SETTINGS,
  mode: "ens",
  worldRadius: WORLD_RADIUS,

  fortresses: new Map(),
  fortressList: [],
  selectedFortressId: null,
  buildMessage: null,
  cameraFocus: null,
  spawnFormOpen: false,
  foundKingdomOpen: false,

  setTiles: (tiles) =>
    set((state) => {
      const map = new Map(tiles.map((tile) => [coordKey(tile.coord), tile]));
      if (state.mode === "sandbox") return { tiles: map, tileList: Array.from(map.values()) };
      // Terrain that arrives (or regrows) after the namespace still has to pick
      // up its castles' occupancy and get their roads planned onto it.
      return deriveEnsWorld(state, state.fortresses, map);
    }),

  placeFortress: (coord) =>
    set((state) => {
      // Sandbox-only since task 29 — see `WorldMode`.
      if (state.mode !== "sandbox") return state;

      const key = coordKey(coord);
      if (!state.tiles.has(key)) return state;
      if (state.fortressList.some((fortress) => coordKey(fortress.coord) === key)) return state;

      const ensKey = `sandbox:${key}`;
      const tile = state.tiles.get(key)!;
      const tiles = new Map(state.tiles);
      tiles.set(key, { ...tile, occupantId: ensKey });

      const name = getGeneratedFortressName(coord);
      const fortress: FortressEntity = {
        ensKey,
        coord,
        name,
        fullName: name,
        tier: 1,
        parentEnsKey: null,
        derelict: false,
      };
      const fortresses = new Map(state.fortresses);
      fortresses.set(ensKey, fortress);

      // Connect the new fortress to the network with a road, biased to skirt
      // hills and merge onto existing segments — see roadSystem.connectFortress.
      const newRoad = connectFortress(fortress, state.fortressList, tiles, state.roads);
      const roads = newRoad ? new Map(state.roads).set(newRoad.id, newRoad) : state.roads;

      const spawned = spawnCitizensForFortress(fortress, state.citizens.size);
      const citizens = spawned.length > 0 ? new Map(state.citizens) : state.citizens;
      spawned.forEach((citizen) => citizens.set(citizen.id, citizen));

      return {
        tiles,
        tileList: Array.from(tiles.values()),
        fortresses,
        fortressList: Array.from(fortresses.values()),
        roads,
        roadList: newRoad ? Array.from(roads.values()) : state.roadList,
        roadAdjacency: newRoad ? buildRoadAdjacency(roads.values()) : state.roadAdjacency,
        citizens,
        citizenList: spawned.length > 0 ? [...state.citizenList, ...spawned] : state.citizenList,
        selectedFortressId: ensKey,
        buildMessage: null,
      };
    }),

  /**
   * The one way a castle reaches the root map. Reconciles instead of
   * rebuilding: a castle whose ENS state didn't change keeps its exact
   * `FortressEntity` reference, so `FortressLayer`'s children don't remount
   * and the grow-in animation doesn't re-fire on every Sepolia block.
   */
  syncFortressesFromEns: (entities, worldRadius) =>
    set((state) => {
      const fortresses = new Map<string, FortressEntity>();
      let changed = entities.length !== state.fortresses.size;

      for (const entity of entities) {
        const existing = state.fortresses.get(entity.ensKey);
        if (existing && fortressUnchanged(existing, entity)) {
          fortresses.set(entity.ensKey, existing);
        } else {
          fortresses.set(entity.ensKey, entity);
          changed = true;
        }
      }

      const nextRadius = worldRadius ?? state.worldRadius;
      const radiusChanged = nextRadius !== state.worldRadius;
      if (!changed && !radiusChanged) return state;

      // A castle that vanished from the namespace can't stay selected.
      const selectedFortressId =
        state.selectedFortressId && !fortresses.has(state.selectedFortressId)
          ? null
          : state.selectedFortressId;

      return {
        ...(changed ? deriveEnsWorld(state, fortresses, state.tiles) : null),
        ...(radiusChanged ? { worldRadius: nextRadius } : null),
        selectedFortressId,
      };
    }),

  selectFortress: (selectedFortressId) => set({ selectedFortressId }),

  focusFortress: (ensKey) =>
    set((state) => {
      const fortress = state.fortresses.get(ensKey);
      if (!fortress) return { selectedFortressId: ensKey };
      return {
        selectedFortressId: ensKey,
        cameraFocus: { coord: fortress.coord, token: state.tick + Date.now() },
      };
    }),

  /**
   * Switching modes empties the map. The ENS map and the sandbox are two
   * different worlds with two different notions of what a castle is, and
   * leaving one's buildings standing in the other is exactly the "two build
   * paths alive at once" state task 29 removes.
   */
  setMode: (mode) =>
    set((state) =>
      state.mode === mode
        ? state
        : {
            mode,
            fortresses: new Map(),
            fortressList: [],
            roads: new Map(),
            roadList: [],
            roadAdjacency: new Map(),
            citizens: new Map(),
            citizenList: [],
            selectedFortressId: null,
            spawnFormOpen: false,
            foundKingdomOpen: false,
          }
    ),

  setSpawnFormOpen: (spawnFormOpen) => set({ spawnFormOpen }),
  setFoundKingdomOpen: (foundKingdomOpen) => set({ foundKingdomOpen }),

  setBuildMessage: (message) => set({ buildMessage: message }),

  // Forcing weather from the debug panel also gives it a fresh dwell timer, so
  // the auto cycle holds the forced state for a while instead of immediately
  // overwriting it on the next tick.
  setWeather: (weather) =>
    set((state) => ({ weather, weatherTimer: randomDwellSeconds(weather.kind, state.tick) })),

  advanceTick: () => set((state) => ({ tick: state.tick + 1 })),

  tickWorld: (dtSeconds) =>
    set((state) => {
      const citizens = state.citizens.size > 0 ? tickCitizens(state, dtSeconds) : state.citizens;
      const { weather, weatherTimer, weatherRender } = tickWeather(state, dtSeconds);
      return {
        tick: state.tick + 1,
        weather,
        weatherTimer,
        weatherRender,
        ...(citizens !== state.citizens
          ? { citizens, citizenList: Array.from(citizens.values()) }
          : null),
      };
    }),

  setHoveredCoord: (hoveredCoord) => set({ hoveredCoord }),

  setPreset: (presetName) => set({ presetName }),

  setDebug: (patch) => set((state) => ({ debug: { ...state.debug, ...patch } })),
}));
