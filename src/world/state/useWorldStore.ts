import { create } from "zustand";
import { coordKey } from "../core/hex";
import type { AxialCoord, Cart, Citizen, FortressEntity, Road, Tile, Weather } from "../core/types";
import { DEFAULT_PRESET, presets } from "../config/presets";
import { POPULATION, TERRAIN } from "../config/world.config";
import { buildRoadAdjacency, connectFortress } from "../systems/roadSystem";
import { spawnCitizensForFortress, tickCitizens } from "../systems/citizenSystem";

export type PresetName = keyof typeof presets;

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
  tick: number;
  /** Hex under the pointer, set by throttled pointer-move raycasts. */
  hoveredCoord: AxialCoord | null;
  /** Active theme + shape kit bundle. Switching this re-skins the world live. */
  presetName: PresetName;
  debug: DebugSettings;

  fortresses: Map<string, FortressEntity>;
  /** Kept in lockstep with `fortresses`, same reasoning as `tileList`. */
  fortressList: FortressEntity[];
  selectedFortressId: string | null;
  /** Transient reason shown in the HUD when a build click is rejected. */
  buildMessage: string | null;

  setTiles: (tiles: Tile[]) => void;
  placeFortress: (coord: AxialCoord) => void;
  selectFortress: (id: string | null) => void;
  setBuildMessage: (message: string | null) => void;
  setWeather: (weather: Weather) => void;
  advanceTick: () => void;
  /** Advances every fixed-tick world system (citizens, ...) by one step of `dtSeconds`. */
  tickWorld: (dtSeconds: number) => void;
  setHoveredCoord: (coord: AxialCoord | null) => void;
  setPreset: (name: PresetName) => void;
  setDebug: (patch: Partial<DebugSettings>) => void;
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
  tick: 0,
  hoveredCoord: null,
  presetName: DEFAULT_PRESET,
  debug: DEFAULT_DEBUG_SETTINGS,

  fortresses: new Map(),
  fortressList: [],
  selectedFortressId: null,
  buildMessage: null,

  setTiles: (tiles) =>
    set(() => {
      const map = new Map(tiles.map((tile) => [coordKey(tile.coord), tile]));
      return { tiles: map, tileList: Array.from(map.values()) };
    }),

  placeFortress: (coord) =>
    set((state) => {
      const key = coordKey(coord);
      if (!state.tiles.has(key)) return state;
      if (state.fortressList.some((fortress) => coordKey(fortress.coord) === key)) return state;

      const id = `fortress-${key}`;
      const tile = state.tiles.get(key)!;
      const tiles = new Map(state.tiles);
      tiles.set(key, { ...tile, occupantId: id });

      const fortress: FortressEntity = { id, coord, tier: 1 };
      const fortresses = new Map(state.fortresses);
      fortresses.set(id, fortress);

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
        selectedFortressId: id,
        buildMessage: null,
      };
    }),

  selectFortress: (id) => set({ selectedFortressId: id }),

  setBuildMessage: (message) => set({ buildMessage: message }),

  setWeather: (weather) => set({ weather }),

  advanceTick: () => set((state) => ({ tick: state.tick + 1 })),

  tickWorld: (dtSeconds) =>
    set((state) => {
      const citizens = tickCitizens(state, dtSeconds);
      if (citizens === state.citizens) return { tick: state.tick + 1 };
      return {
        tick: state.tick + 1,
        citizens,
        citizenList: Array.from(citizens.values()),
      };
    }),

  setHoveredCoord: (hoveredCoord) => set({ hoveredCoord }),

  setPreset: (presetName) => set({ presetName }),

  setDebug: (patch) => set((state) => ({ debug: { ...state.debug, ...patch } })),
}));
