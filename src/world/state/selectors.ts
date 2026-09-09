import { coordKey } from "../core/hex";
import type { AxialCoord } from "../core/types";
import type { WorldState } from "./useWorldStore";

export const selectTile = (coord: AxialCoord) => (state: WorldState) =>
  state.tiles.get(coordKey(coord));

export const selectAllTiles = (state: WorldState) => state.tileList;

export const selectWeather = (state: WorldState) => state.weather;

export const selectHoveredCoord = (state: WorldState) => state.hoveredCoord;

export const selectHoveredTile = (state: WorldState) =>
  state.hoveredCoord ? state.tiles.get(coordKey(state.hoveredCoord)) : undefined;

/**
 * Not yet wired to a component (citizens land in task 25). This filters on
 * every call, so a component reading it with plain `useWorldStore` will hit
 * the same "new array every render" infinite-loop trap `selectAllTiles` had
 * — pair it with zustand's `useShallow`, or give citizens their own
 * `tileList`-style derived array once the citizen system exists.
 */
export const selectCitizensByFortress = (fortressId: string) => (state: WorldState) =>
  Array.from(state.citizens.values()).filter((citizen) => citizen.fortressId === fortressId);

export const selectCitizenList = (state: WorldState) => state.citizenList;

export const selectPresetName = (state: WorldState) => state.presetName;

export const selectDebugSettings = (state: WorldState) => state.debug;

export const selectFortressList = (state: WorldState) => state.fortressList;

export const selectSelectedFortress = (state: WorldState) =>
  state.selectedFortressId ? state.fortresses.get(state.selectedFortressId) : undefined;

export const selectBuildMessage = (state: WorldState) => state.buildMessage;

export const selectRoadList = (state: WorldState) => state.roadList;

/** Undirected coordKey -> neighboring coordKeys graph, for citizen pathing (task 25). */
export const selectRoadAdjacency = (state: WorldState) => state.roadAdjacency;
