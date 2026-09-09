"use client";

import { useEffect } from "react";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectBuildMessage } from "@/world/state/selectors";
import { FORTRESS_BUILD_DISTANCE } from "@/world/config/world.config";

const MESSAGE_TIMEOUT_MS = 3000;
const DEFAULT_HINT = `Click a glowing hex ${FORTRESS_BUILD_DISTANCE} tiles from a fortress to build.`;

/** Bottom bar showing build hints, and why a click was rejected. */
export function BuildBar() {
  const message = useWorldStore(selectBuildMessage);
  const setBuildMessage = useWorldStore((state) => state.setBuildMessage);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setBuildMessage(null), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message, setBuildMessage]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
      <div
        className={`rounded-full px-4 py-2 text-sm text-white backdrop-blur transition-colors ${
          message ? "bg-red-900/70" : "bg-black/40"
        }`}
      >
        {message ?? DEFAULT_HINT}
      </div>
    </div>
  );
}
