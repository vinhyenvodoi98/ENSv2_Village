import { create } from "zustand";
import { coordKey } from "../core/hex";
import type { AxialCoord, Cart, Citizen, Road, Tile, Weather } from "../core/types";
import { DEFAULT_PRESET, presets } from "../config/presets";
import { POPULATION, TERRAIN } from "../config/world.config";

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
  citizens: Map<string, Citizen>;
  carts: Map<string, Cart>;
  weather: Weather;
  tick: number;
  /** Hex under the pointer, set by throttled pointer-move raycasts. */
  hoveredCoord: AxialCoord | null;
  /** Active theme + shape kit bundle. Switching this re-skins the world live. */
  presetName: PresetName;
  debug: DebugSettings;

  setTiles: (tiles: Tile[]) => void;
  placeFortress: (coord: AxialCoord, fortressId: string) => void;
  setWeather: (weather: Weather) => void;
  advanceTick: () => void;
  setHoveredCoord: (coord: AxialCoord | null) => void;
  setPreset: (name: PresetName) => void;
  setDebug: (patch: Partial<DebugSettings>) => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  tiles: new Map(),
  tileList: [],
  roads: new Map(),
  citizens: new Map(),
  carts: new Map(),
  weather: { kind: "clear", intensity: 0 },
  tick: 0,
  hoveredCoord: null,
  presetName: DEFAULT_PRESET,
  debug: DEFAULT_DEBUG_SETTINGS,

  setTiles: (tiles) =>
    set(() => {
      const map = new Map(tiles.map((tile) => [coordKey(tile.coord), tile]));
      return { tiles: map, tileList: Array.from(map.values()) };
    }),

  placeFortress: (coord, fortressId) =>
    set((state) => {
      const key = coordKey(coord);
      const tile = state.tiles.get(key);
      if (!tile) return state;

      const tiles = new Map(state.tiles);
      tiles.set(key, { ...tile, occupantId: fortressId });
      return { tiles, tileList: Array.from(tiles.values()) };
    }),

  setWeather: (weather) => set({ weather }),

  advanceTick: () => set((state) => ({ tick: state.tick + 1 })),

  setHoveredCoord: (hoveredCoord) => set({ hoveredCoord }),

  setPreset: (presetName) => set({ presetName }),

  setDebug: (patch) => set((state) => ({ debug: { ...state.debug, ...patch } })),
}));
