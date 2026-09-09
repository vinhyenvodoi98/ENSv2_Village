/** Axial hex coordinate. */
export interface AxialCoord {
  q: number;
  r: number;
}

export interface Tile {
  coord: AxialCoord;
  height: number;
  kind: "grass" | "dirt" | "stone" | "water";
  occupantId?: string;
}

export interface FortressEntity {
  id: string;
  coord: AxialCoord;
  tier: number;
}

export interface Road {
  id: string;
  path: AxialCoord[];
}

export interface Citizen {
  id: string;
  fortressId: string;
  position: AxialCoord;
  targetId?: string;
}

export interface Cart {
  id: string;
  roadId: string;
  progress: number;
}

export type WeatherKind = "clear" | "cloudy" | "rain" | "dusk";

export interface Weather {
  kind: WeatherKind;
  intensity: number;
}
