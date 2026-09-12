import { ConeGeometry } from "three";
import { REGISTER_MOUNTAIN as M } from "@/world/config/mountain";

/**
 * Built once at module scope and shared by every `RegisterMountain` instance —
 * there is only ever one on screen, but the pattern matches `getPartGeometries`
 * so this file reads the same as every other geometry cache in `src/world/`.
 */
export const mountainGeometries = {
  peak: new ConeGeometry(M.peak.radius, M.peak.height, M.peak.segments),
  snowCap: new ConeGeometry(
    M.peak.radius * M.snow.radiusScale,
    M.peak.height * M.snow.heightScale,
    M.peak.segments
  ),
};
