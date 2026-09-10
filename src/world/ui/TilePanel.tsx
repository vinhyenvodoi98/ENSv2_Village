"use client";

import { useMemo } from "react";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectSelectedFortress } from "@/world/state/selectors";
import { coordsEqual } from "@/world/core/hex";

/**
 * Sandbox-only (`/threejs`) castle summary: tier, population, connected roads.
 * The root map deliberately does *not* mount this — a selected castle there is
 * an ENS node and opens `AgentDetailPanel`, so there is exactly one panel per
 * screen rather than two competing ones.
 */
export function TilePanel() {
  const fortress = useWorldStore(selectSelectedFortress);
  const selectFortress = useWorldStore((state) => state.selectFortress);
  const roads = useWorldStore((state) => state.roads);
  // Reads the stable `citizens`/`roads` Map references and derives locally,
  // rather than handing zustand a selector that allocates a fresh array on
  // every call — see selectCitizensByFortress's warning in selectors.ts.
  const citizens = useWorldStore((state) => state.citizens);

  const population = useMemo(() => {
    if (!fortress) return 0;
    let count = 0;
    for (const citizen of citizens.values()) {
      if (citizen.fortressId === fortress.ensKey) count++;
    }
    return count;
  }, [citizens, fortress]);

  if (!fortress) return null;

  const connectedRoads = Array.from(roads.values()).filter((road) =>
    road.path.some((coord) => coordsEqual(coord, fortress.coord))
  ).length;

  return (
    <div className="pointer-events-auto absolute right-4 top-20 w-64 rounded-lg bg-black/60 p-4 text-white shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {fortress.name} ({fortress.coord.q}, {fortress.coord.r})
        </h2>
        <button
          type="button"
          onClick={() => selectFortress(null)}
          className="text-white/60 transition-colors hover:text-white"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <dl className="mt-2 space-y-1 text-xs text-white/80">
        <div className="flex justify-between">
          <dt>Tier</dt>
          <dd>{fortress.tier}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Population</dt>
          <dd>{population}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Connected roads</dt>
          <dd>{connectedRoads}</dd>
        </div>
      </dl>
    </div>
  );
}
