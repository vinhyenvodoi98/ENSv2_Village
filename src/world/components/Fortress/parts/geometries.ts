import { BoxGeometry, ConeGeometry, CylinderGeometry, PlaneGeometry, Shape, ShapeGeometry } from "three";
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
  window: ShapeGeometry;
  finial: ConeGeometry;
  keepBrim: BoxGeometry;
  towerBrim: CylinderGeometry;
  portcullisBar: BoxGeometry;
  portcullisCrossbar: BoxGeometry;
  portcullisSpike: ConeGeometry;
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

  const windowShoulderY = kit.detail.windowHeight * 0.2;
  const window = new Shape();
  window.moveTo(-kit.detail.windowWidth / 2, -kit.detail.windowHeight / 2);
  window.lineTo(kit.detail.windowWidth / 2, -kit.detail.windowHeight / 2);
  window.lineTo(kit.detail.windowWidth / 2, windowShoulderY);
  window.quadraticCurveTo(
    kit.detail.windowWidth / 2,
    kit.detail.windowHeight / 2,
    0,
    kit.detail.windowHeight / 2
  );
  window.quadraticCurveTo(
    -kit.detail.windowWidth / 2,
    kit.detail.windowHeight / 2,
    -kit.detail.windowWidth / 2,
    windowShoulderY
  );
  window.closePath();

  const portcullisHeight = kit.gate.height * kit.detail.portcullisHeightRatio;
  const portcullisOpeningWidth = kit.gate.width - kit.gate.depth * 2;

  const built: PartGeometries = {
    keepBody: new BoxGeometry(kit.keep.width, kit.keep.height, kit.keep.depth),
    keepRoof: new ConeGeometry(Math.max(kit.keep.width, kit.keep.depth) * 0.82, kit.keep.roofHeight, 4),
    wall: new BoxGeometry(kit.wall.length, kit.wall.height, kit.wall.thickness),
    towerBody: new CylinderGeometry(kit.tower.radius * kit.tower.taper, kit.tower.radius, kit.tower.height, 8),
    towerRoof: new ConeGeometry(kit.tower.radius * 1.16, kit.tower.roofHeight, 8),
    gatePost: new BoxGeometry(kit.gate.depth, kit.gate.height, kit.gate.depth),
    gateLintel: new BoxGeometry(kit.gate.width, kit.gate.depth * 0.6, kit.gate.depth),
    bannerCloth: new PlaneGeometry(kit.banner.width, kit.banner.height),
    bannerPole: new CylinderGeometry(0.03, 0.03, kit.banner.poleHeight, 6),
    merlon: new BoxGeometry(kit.merlon.width, kit.merlon.height, kit.merlon.depth),
    window: new ShapeGeometry(window, 6),
    finial: new ConeGeometry(kit.detail.finialRadius, kit.detail.finialHeight, 8),
    keepBrim: new BoxGeometry(
      kit.keep.width * kit.detail.brimOverhang,
      kit.detail.brimThickness,
      kit.keep.depth * kit.detail.brimOverhang
    ),
    towerBrim: new CylinderGeometry(
      kit.tower.radius * kit.detail.brimOverhang,
      kit.tower.radius * kit.detail.brimOverhang,
      kit.detail.brimThickness,
      12
    ),
    portcullisBar: new BoxGeometry(kit.detail.barThickness, portcullisHeight, kit.detail.barThickness),
    portcullisCrossbar: new BoxGeometry(portcullisOpeningWidth * 0.88, kit.detail.barThickness, kit.detail.barThickness),
    portcullisSpike: new ConeGeometry(
      kit.detail.barThickness * 0.9,
      kit.detail.portcullisSpikeHeight,
      4
    ),
  };
  cache.set(kit.id, built);
  return built;
}
