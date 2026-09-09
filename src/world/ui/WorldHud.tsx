"use client";

import { presets } from "@/world/config/presets";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectPresetName } from "@/world/state/selectors";
import type { PresetName } from "@/world/state/useWorldStore";

/**
 * 2D HUD overlaid on the canvas via Tailwind, not rendered inside the
 * `<Canvas>`. Preset switching lives here — always visible, unlike the
 * dev-only `DebugPanel`.
 */
export function WorldHud() {
  const presetName = useWorldStore(selectPresetName);
  const setPreset = useWorldStore((state) => state.setPreset);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
      <div className="pointer-events-auto flex gap-1 rounded-full bg-black/40 p-1 backdrop-blur">
        {(Object.keys(presets) as PresetName[]).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setPreset(name)}
            className={`rounded-full px-3 py-1 text-sm capitalize transition-colors ${
              name === presetName
                ? "bg-white text-black"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {presets[name].name}
          </button>
        ))}
      </div>
    </div>
  );
}
