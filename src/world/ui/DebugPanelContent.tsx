"use client";

import type { ReactNode } from "react";
import { presets } from "@/world/config/presets";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectDebugSettings, selectPresetName } from "@/world/state/selectors";
import type { PresetName } from "@/world/state/useWorldStore";
import type { WeatherKind } from "@/world/core/types";

const WEATHER_KINDS: WeatherKind[] = ["clear", "cloudy", "rain", "dusk"];

/**
 * The real debug UI. Lives in its own module so the static
 * `NODE_ENV === "development"` gate in `DebugPanel.tsx` can dead-code
 * eliminate the `import()` that pulls this in — it never reaches a
 * production bundle.
 */
export default function DebugPanelContent() {
  const presetName = useWorldStore(selectPresetName);
  const setPreset = useWorldStore((state) => state.setPreset);
  const debug = useWorldStore(selectDebugSettings);
  const setDebug = useWorldStore((state) => state.setDebug);
  const weather = useWorldStore((state) => state.weather);
  const setWeather = useWorldStore((state) => state.setWeather);

  return (
    <div className="pointer-events-auto w-64 space-y-3 rounded-lg bg-black/70 p-3 text-xs text-white backdrop-blur">
      <p className="text-[10px] uppercase tracking-wide text-white/50">Debug — dev only</p>

      <Field label="Preset">
        <select
          value={presetName}
          onChange={(event) => setPreset(event.target.value as PresetName)}
          className="w-full rounded bg-white/10 px-2 py-1"
        >
          {(Object.keys(presets) as PresetName[]).map((name) => (
            <option key={name} value={name}>
              {presets[name].name}
            </option>
          ))}
        </select>
      </Field>

      <Slider
        label={`Sun angle (${debug.sunAngleDeg.toFixed(0)}°)`}
        min={0}
        max={360}
        step={1}
        value={debug.sunAngleDeg}
        onChange={(sunAngleDeg) => setDebug({ sunAngleDeg })}
      />

      <Slider
        label={`Fog density (${debug.fogDensity.toFixed(2)}x)`}
        min={0.4}
        max={2.5}
        step={0.05}
        value={debug.fogDensity}
        onChange={(fogDensity) => setDebug({ fogDensity })}
      />

      <Slider
        label={`Terrain amplitude (${debug.terrainAmplitude.toFixed(2)})`}
        min={0}
        max={3}
        step={0.1}
        value={debug.terrainAmplitude}
        onChange={(terrainAmplitude) => setDebug({ terrainAmplitude })}
      />

      <Slider
        label={`Population cap (${debug.populationCap})`}
        min={1}
        max={20}
        step={1}
        value={debug.populationCap}
        onChange={(populationCap) => setDebug({ populationCap })}
      />

      <Field label="Weather override">
        <select
          value={weather.kind}
          onChange={(event) => setWeather({ ...weather, kind: event.target.value as WeatherKind })}
          className="w-full rounded bg-white/10 px-2 py-1"
        >
          {WEATHER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </Field>

      <Slider
        label={`Weather intensity (${weather.intensity.toFixed(2)})`}
        min={0}
        max={1}
        step={0.05}
        value={weather.intensity}
        onChange={(intensity) => setWeather({ ...weather, intensity })}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-white/70">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-white/70">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </label>
  );
}
