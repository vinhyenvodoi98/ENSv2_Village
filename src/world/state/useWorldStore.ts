import { create } from "zustand";
import { coordKey } from "../core/hex";
import type { AxialCoord, Cart, Citizen, Road, Tile, Weather } from "../core/types";

export interface WorldState {
  tiles: Map<string, Tile>;
  roads: Map<string, Road>;
  citizens: Map<string, Citizen>;
  carts: Map<string, Cart>;
  weather: Weather;
  tick: number;

  setTiles: (tiles: Tile[]) => void;
  placeFortress: (coord: AxialCoord, fortressId: string) => void;
  setWeather: (weather: Weather) => void;
  advanceTick: () => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  tiles: new Map(),
  roads: new Map(),
  citizens: new Map(),
  carts: new Map(),
  weather: { kind: "clear", intensity: 0 },
  tick: 0,

  setTiles: (tiles) =>
    set(() => ({
      tiles: new Map(tiles.map((tile) => [coordKey(tile.coord), tile])),
    })),

  placeFortress: (coord, fortressId) =>
    set((state) => {
      const key = coordKey(coord);
      const tile = state.tiles.get(key);
      if (!tile) return state;

      const tiles = new Map(state.tiles);
      tiles.set(key, { ...tile, occupantId: fortressId });
      return { tiles };
    }),

  setWeather: (weather) => set({ weather }),

  advanceTick: () => set((state) => ({ tick: state.tick + 1 })),
}));
