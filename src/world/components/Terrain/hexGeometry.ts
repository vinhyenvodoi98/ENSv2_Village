import { CylinderGeometry } from "three";
import { HEX_HEIGHT, HEX_SIZE } from "@/world/config/world.config";

/**
 * The one hex geometry every terrain mesh uses — `HexGrid`'s instances and
 * `HexTile`'s single-mesh preview share this exact object, so hover and
 * placement previews are pixel-identical to what actually gets built, and
 * no component pays for its own `CylinderGeometry`.
 */
export const hexGeometry = new CylinderGeometry(HEX_SIZE, HEX_SIZE, HEX_HEIGHT, 6);
