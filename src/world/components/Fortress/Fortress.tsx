"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { getFortressParts, stripBanners, type FortressPart, type FortressPartPlacement } from "./fortress.presets";
import { medievalTheme } from "@/world/config/theme";
import { getThemeMaterials } from "@/world/config/materials";
import { getShapeKit } from "@/world/config/shapeKit";
import { createRng } from "@/world/core/rng";
import { hexToWorld } from "@/world/core/hex";
import type { AxialCoord } from "@/world/core/types";
import { Keep } from "./parts/Keep";
import { Wall } from "./parts/Wall";
import { Tower } from "./parts/Tower";
import { Gate } from "./parts/Gate";
import { Banner } from "./parts/Banner";
import { Merlon } from "./parts/Merlon";
import { FortressNameplate } from "./FortressNameplate";

/** ~400ms grow-in with a slight overshoot, run entirely off `useFrame`. */
const GROW_DURATION_MS = 400;
const ROTATION_JITTER_RAD = 0.35;
const SCALE_JITTER = 0.05;
/** A ruin has settled into the ground and lost its roofline. */
const DERELICT_SCALE = 0.88;
const DERELICT_TILT_RAD = 0.06;

/** 32-bit FNV-1a — deterministic, so the same hex always hashes the same. */
function hashCoord(coord: AxialCoord): number {
  const s = `${coord.q},${coord.r}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

export interface FortressProps {
  coord: AxialCoord;
  /**
   * Nameplate text. On the root map this is always an ENS label read off
   * Sepolia — there is deliberately no generated fallback, so a missing name
   * shows as no nameplate rather than as an invented one.
   */
  name?: string;
  /** Dotted ENS name, shown on nameplate hover. */
  fullName?: string;
  /** `AGENT_TIERS` index, 0 Wildcard … 3 Sovereign. Selects the silhouette preset. */
  tier?: number;
  /** World-space y of the tile's top surface this fortress sits on. */
  height?: number;
  kitId?: string;
  theme?: typeof medievalTheme;
  /** Translucent preview mode for the hover-to-build ghost. Skips growth and jitter randomness stays visually neutral. */
  ghost?: boolean;
  /** Revoked or lapsed on chain: grey stone, banners struck, slumped into the hill. */
  derelict?: boolean;
  /** Extra caption under the nameplate — "not on-chain" for a wildcard preview. */
  nameplateNote?: string;
  onClick?: () => void;
}

/**
 * Renders a fortress from its tier preset. The same hex coordinate always
 * yields the same jitter (rotation, scale, banner color) since it's derived
 * from a seeded RNG keyed by the coord — no store state needed for it.
 */
export function Fortress({
  coord,
  name,
  fullName,
  tier = 1,
  height = 0,
  kitId = "medieval",
  theme = medievalTheme,
  ghost = false,
  derelict = false,
  nameplateNote,
  onClick,
}: FortressProps) {
  const groupRef = useRef<Group>(null);
  const mountedAt = useRef<number | null>(null);

  const parts = useMemo(() => {
    const tierParts = getFortressParts(kitId, tier);
    return derelict ? stripBanners(tierParts) : tierParts;
  }, [kitId, tier, derelict]);
  const shapeKit = useMemo(() => getShapeKit(kitId), [kitId]);
  const materials = useMemo(() => getThemeMaterials(theme), [theme]);
  const displayName = name?.trim() ?? "";
  const nameplateY = shapeKit.keep.height + shapeKit.keep.roofHeight + shapeKit.banner.poleHeight * 0.78;

  const jitter = useMemo(() => {
    const rng = createRng(hashCoord(coord));
    return {
      rotationY: (rng.next() - 0.5) * 2 * ROTATION_JITTER_RAD,
      scale: 1 + (rng.next() - 0.5) * 2 * SCALE_JITTER,
      bannerVariant: rng.int(materials.fortress.bannerVariants.length),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coord.q, coord.r, materials]);

  const [x, z] = useMemo(() => hexToWorld(coord), [coord]);

  const baseScale = jitter.scale * (derelict ? DERELICT_SCALE : 1);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (ghost) {
      group.scale.setScalar(baseScale);
      return;
    }
    if (mountedAt.current === null) mountedAt.current = performance.now();
    const elapsed = performance.now() - mountedAt.current;
    const t = Math.min(1, elapsed / GROW_DURATION_MS);
    group.scale.setScalar(baseScale * easeOutBack(t));
  });

  // Three visual states, one lookup table: a ghost is uniformly translucent, a
  // ruin is uniformly grey stone, and a live castle uses the full palette.
  const override = ghost ? materials.fortress.ghost : derelict ? materials.fortress.ruined : null;
  const bannerMaterial = override ?? materials.fortress.bannerVariants[jitter.bannerVariant];
  const bodyMaterial = override ?? materials.fortress.keep;
  const wallMaterial = override ?? materials.fortress.wall;
  const roofMaterial = override ?? materials.fortress.roof;
  const windowMaterial = override ?? materials.fortress.window;

  return (
    <group
      ref={groupRef}
      position={[x, height, z]}
      rotation={[derelict ? DERELICT_TILT_RAD : 0, jitter.rotationY, 0]}
      onClick={
        onClick
          ? (event) => {
              event.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      {parts.map((placement, index) => (
        <PartInstance
          key={index}
          placement={placement}
          shapeKit={shapeKit}
          bodyMaterial={bodyMaterial}
          wallMaterial={wallMaterial}
          roofMaterial={roofMaterial}
          bannerMaterial={bannerMaterial}
          windowMaterial={windowMaterial}
        />
      ))}
      {displayName ? (
        <FortressNameplate
          fullName={fullName ?? displayName}
          tier={tier}
          derelict={derelict}
          note={nameplateNote}
          positionY={nameplateY}
        />
      ) : null}
    </group>
  );
}

interface PartInstanceProps {
  placement: FortressPartPlacement;
  shapeKit: ReturnType<typeof getShapeKit>;
  bodyMaterial: ReturnType<typeof getThemeMaterials>["fortress"]["keep"];
  wallMaterial: ReturnType<typeof getThemeMaterials>["fortress"]["wall"];
  roofMaterial: ReturnType<typeof getThemeMaterials>["fortress"]["roof"];
  bannerMaterial: ReturnType<typeof getThemeMaterials>["fortress"]["bannerVariants"][number];
  windowMaterial: ReturnType<typeof getThemeMaterials>["fortress"]["window"];
}

function PartInstance({ placement, shapeKit, bodyMaterial, wallMaterial, roofMaterial, bannerMaterial, windowMaterial }: PartInstanceProps) {
  return (
    <group position={placement.position} rotation={placement.rotation} scale={placement.scale}>
      <FortressPartMesh
        part={placement.part}
        shapeKit={shapeKit}
        bodyMaterial={bodyMaterial}
        wallMaterial={wallMaterial}
        roofMaterial={roofMaterial}
        bannerMaterial={bannerMaterial}
        windowMaterial={windowMaterial}
      />
    </group>
  );
}

function FortressPartMesh({
  part,
  shapeKit,
  bodyMaterial,
  wallMaterial,
  roofMaterial,
  bannerMaterial,
  windowMaterial,
}: {
  part: FortressPart;
} & Omit<PartInstanceProps, "placement">) {
  switch (part) {
    case "keep":
      return <Keep shapeKit={shapeKit} bodyMaterial={bodyMaterial} roofMaterial={roofMaterial} windowMaterial={windowMaterial} />;
    case "wall":
      return <Wall shapeKit={shapeKit} bodyMaterial={wallMaterial} />;
    case "tower":
      return <Tower shapeKit={shapeKit} bodyMaterial={wallMaterial} roofMaterial={roofMaterial} windowMaterial={windowMaterial} />;
    case "gate":
      return <Gate shapeKit={shapeKit} bodyMaterial={wallMaterial} roofMaterial={roofMaterial} windowMaterial={windowMaterial} />;
    case "banner":
      return <Banner shapeKit={shapeKit} bodyMaterial={bannerMaterial} poleMaterial={wallMaterial} />;
    case "merlon":
      return <Merlon shapeKit={shapeKit} bodyMaterial={wallMaterial} />;
    default:
      return null;
  }
}
