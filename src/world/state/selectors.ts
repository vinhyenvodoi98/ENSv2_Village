import { coordKey } from "../core/hex";
import type { AxialCoord } from "../core/types";
import type { WorldState } from "./useWorldStore";

export const selectTile = (coord: AxialCoord) => (state: WorldState) =>
  state.tiles.get(coordKey(coord));

export const selectAllTiles = (state: WorldState) => Array.from(state.tiles.values());

export const selectWeather = (state: WorldState) => state.weather;

export const selectCitizensByFortress = (fortressId: string) => (state: WorldState) =>
  Array.from(state.citizens.values()).filter((citizen) => citizen.fortressId === fortressId);
