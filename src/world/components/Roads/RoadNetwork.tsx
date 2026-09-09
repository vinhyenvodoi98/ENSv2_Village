"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useWorldStore } from "@/world/state/useWorldStore";
import { selectRoadList } from "@/world/state/selectors";
import { medievalTheme } from "@/world/config/theme";
import { getThemeMaterials } from "@/world/config/materials";
import { buildRoadRibbonGeometry } from "./roadGeometry";
import { Road } from "./Road";

interface RoadNetworkProps {
  theme?: typeof medievalTheme;
}

/**
 * Renders every road in the network. A road still mid-growth gets its own
 * small mesh so its draw-in can animate independently (`Road.tsx`); once it
 * settles it's folded into one merged geometry, so the steady-state network
 * — however many roads exist — is a single draw call, not one mesh per
 * segment.
 */
export function RoadNetwork({ theme = medievalTheme }: RoadNetworkProps) {
  const roads = useWorldStore(selectRoadList);
  const tiles = useWorldStore((state) => state.tiles);
  const [settledIds, setSettledIds] = useState<ReadonlySet<string>>(() => new Set());

  const growing = useMemo(() => roads.filter((road) => !settledIds.has(road.id)), [roads, settledIds]);
  const settled = useMemo(() => roads.filter((road) => settledIds.has(road.id)), [roads, settledIds]);

  const mergedGeometry = useMemo(() => {
    if (settled.length === 0) return null;
    const geometries = settled.map((road) => buildRoadRibbonGeometry(road.path, tiles));
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    return merged;
  }, [settled, tiles]);

  useEffect(() => () => mergedGeometry?.dispose(), [mergedGeometry]);

  const markSettled = useCallback((id: string) => {
    setSettledIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const material = getThemeMaterials(theme).roads.path;

  return (
    <>
      {mergedGeometry && <mesh geometry={mergedGeometry} material={material} />}
      {growing.map((road) => (
        <Road key={road.id} road={road} tiles={tiles} theme={theme} onSettled={() => markSettled(road.id)} />
      ))}
    </>
  );
}
