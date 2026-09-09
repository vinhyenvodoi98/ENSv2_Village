import { BoxGeometry, ConeGeometry, CylinderGeometry, PlaneGeometry } from "three";
import type { ShapeKit } from "@/world/config/shapeKit";

export interface PartGeometries {
  keepBody: BoxGeometry;
  keepRoof: ConeGeometry;
  wall: BoxGeometry;
  towerBody: CylinderGeometry;
  towerRoof: ConeGeometry;
  gatePost: BoxGeometry;
  gateLintel: BoxGeometry;
  bannerCloth: PlaneGeometry;
  bannerPole: CylinderGeometry;
  merlon: BoxGeometry;
  window: PlaneGeometry;
  finial: ConeGeometry;
  keepBrim: BoxGeometry;
  towerBrim: CylinderGeometry;
  portcullisBar: BoxGeometry;
}

const cache = new Map<string, PartGeometries>();

/**
 * One set of primitive geometries per shape kit, built once and shared by
 * every part instance across every fortress — placement (position/rotation/
 * scale) is what makes each part look different, never a new geometry.
 */
export function getPartGeometries(kit: ShapeKit): PartGeometries {
  const cached = cache.get(kit.id);
  if (cached) return cached;

  const built: PartGeometries = {
    keepBody: new BoxGeometry(kit.keep.width, kit.keep.height, kit.keep.depth),
    keepRoof: new ConeGeometry(Math.max(kit.keep.width, kit.keep.depth) * 0.8, kit.keep.roofHeight, 4),
    wall: new BoxGeometry(kit.wall.length, kit.wall.height, kit.wall.thickness),
    towerBody: new CylinderGeometry(kit.tower.radius * kit.tower.taper, kit.tower.radius, kit.tower.height, 8),
    towerRoof: new ConeGeometry(kit.tower.radius * 1.2, kit.tower.roofHeight, 8),
    gatePost: new BoxGeometry(kit.gate.depth, kit.gate.height, kit.gate.depth),
    gateLintel: new BoxGeometry(kit.gate.width, kit.gate.depth * 0.6, kit.gate.depth),
    bannerCloth: new PlaneGeometry(kit.banner.width, kit.banner.height),
    bannerPole: new CylinderGeometry(0.03, 0.03, kit.banner.poleHeight, 6),
    merlon: new BoxGeometry(kit.merlon.width, kit.merlon.height, kit.merlon.depth),
    window: new PlaneGeometry(kit.detail.windowWidth, kit.detail.windowHeight),
    finial: new ConeGeometry(kit.detail.finialRadius, kit.detail.finialHeight, 6),
    keepBrim: new BoxGeometry(
      kit.keep.width * kit.detail.brimOverhang,
      kit.detail.brimThickness,
      kit.keep.depth * kit.detail.brimOverhang
    ),
    towerBrim: new CylinderGeometry(
      kit.tower.radius * kit.detail.brimOverhang,
      kit.tower.radius * kit.detail.brimOverhang,
      kit.detail.brimThickness,
      8
    ),
    portcullisBar: new BoxGeometry(kit.detail.barThickness, kit.gate.height * 0.85, kit.detail.barThickness),
  };
  cache.set(kit.id, built);
  return built;
}
