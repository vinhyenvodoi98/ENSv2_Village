import { Color } from "three";
import { createRng, hashString } from "../core/rng";
import type { Weather, WeatherKind, WeatherRenderState } from "../core/types";
import type { WorldTheme } from "../config/theme";
import { WEATHER, WORLD_SEED } from "../config/world.config";
import type { WorldState } from "../state/useWorldStore";

const CYCLE: readonly WeatherKind[] = WEATHER.cycle;

/** Next state in the auto `clear -> cloudy -> rain -> clear` cycle. "dusk" (debug-only) falls back to "clear". */
function nextCycleKind(kind: WeatherKind): WeatherKind {
  const index = CYCLE.indexOf(kind);
  return CYCLE[(index + 1) % CYCLE.length];
}

/** Seconds a freshly-entered `kind` should dwell before the next auto transition, weighted within its configured range. */
export function randomDwellSeconds(kind: WeatherKind, salt: number): number {
  const [min, max] = WEATHER.dwellSeconds[kind];
  const rng = createRng(hashString(`weather-dwell-${kind}-${salt}`) ^ WORLD_SEED);
  return min + rng.next() * (max - min);
}

function targetStormBlend(weather: Weather): number {
  if (weather.kind === "rain") return weather.intensity;
  if (weather.kind === "cloudy" || weather.kind === "dusk") return weather.intensity * 0.4;
  return 0;
}

function targetCloudOpacity(weather: Weather): number {
  if (weather.kind === "rain") return Math.max(0.6, weather.intensity);
  if (weather.kind === "cloudy") return Math.max(WEATHER.cloudBaseOpacity, weather.intensity);
  return WEATHER.cloudBaseOpacity * 0.5;
}

function targetRainDensity(weather: Weather): number {
  return weather.kind === "rain" ? weather.intensity : 0;
}

/** Exponential ease-toward, frame-rate independent: after `WEATHER.transitionEaseSeconds` the gap has closed by ~63%. */
function ease(current: number, target: number, dtSeconds: number): number {
  const rate = 1 - Math.exp(-dtSeconds / WEATHER.transitionEaseSeconds);
  return current + (target - current) * rate;
}

export interface WeatherTickResult {
  weather: Weather;
  weatherTimer: number;
  weatherRender: WeatherRenderState;
}

/**
 * Advances the auto `clear -> cloudy -> rain -> clear` cycle on a weighted
 * dwell timer, and eases the derived render values (sky/fog/light blend,
 * cloud opacity, rain density) toward the active state's targets so nothing
 * pops. Pure over `WorldState` — mirrors `citizenSystem.tickCitizens` — so it
 * runs identically from the render loop's accumulator or a plain test.
 */
export function tickWeather(state: WorldState, dtSeconds: number): WeatherTickResult {
  let weather = state.weather;
  let weatherTimer = state.weatherTimer - dtSeconds;

  if (weatherTimer <= 0) {
    const kind = nextCycleKind(weather.kind);
    const rng = createRng(hashString(`weather-intensity-${state.tick}`) ^ WORLD_SEED);
    const intensity = kind === "clear" ? 0 : 0.55 + rng.next() * 0.45;
    weather = { kind, intensity };
    weatherTimer = randomDwellSeconds(kind, state.tick);
  }

  const render = state.weatherRender;
  const weatherRender: WeatherRenderState = {
    stormBlend: ease(render.stormBlend, targetStormBlend(weather), dtSeconds),
    cloudOpacity: ease(render.cloudOpacity, targetCloudOpacity(weather), dtSeconds),
    rainDensity: ease(render.rainDensity, targetRainDensity(weather), dtSeconds),
  };

  return { weather, weatherTimer, weatherRender };
}

export interface WeatherSkyBlend {
  top: string;
  bottom: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientMultiplier: number;
  directionalMultiplier: number;
}

const scratchA = new Color();
const scratchB = new Color();

/**
 * The theme's clear-sky tokens lerped toward its `sky.rain` tokens by
 * `stormBlend` — the single place `SkyDome`, `WorldCanvas`'s fog/background,
 * and `Lighting` all read from, so they never drift out of sync with each
 * other or introduce a parallel palette.
 */
export function blendWeatherSky(theme: WorldTheme, stormBlend: number): WeatherSkyBlend {
  const t = Math.min(1, Math.max(0, stormBlend));
  const { sky } = theme;

  scratchA.set(sky.top).lerp(scratchB.set(sky.rain.top), t);
  const top = `#${scratchA.getHexString()}`;
  scratchA.set(sky.bottom).lerp(scratchB.set(sky.rain.bottom), t);
  const bottom = `#${scratchA.getHexString()}`;
  scratchA.set(sky.fogColor).lerp(scratchB.set(sky.rain.fogColor), t);
  const fogColor = `#${scratchA.getHexString()}`;

  return {
    top,
    bottom,
    fogColor,
    fogNear: sky.fogNear + (sky.rain.fogNear - sky.fogNear) * t,
    fogFar: sky.fogFar + (sky.rain.fogFar - sky.fogFar) * t,
    ambientMultiplier: 1 + (sky.rain.ambientMultiplier - 1) * t,
    directionalMultiplier: 1 + (sky.rain.directionalMultiplier - 1) * t,
  };
}
