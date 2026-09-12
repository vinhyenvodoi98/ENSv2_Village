"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Html } from "@react-three/drei";
import { REGISTER_MOUNTAIN } from "@/world/config/mountain";
import { medievalTheme } from "@/world/config/theme";
import { HEX_SIZE } from "@/world/config/world.config";
import { selectWorldRadius } from "@/world/state/selectors";
import { useWorldStore } from "@/world/state/useWorldStore";
import { RegisterMountain } from "./RegisterMountain";
import styles from "./RegisterMountainScenery.module.css";

export interface RegisterMountainState {
  /** Ví chưa kết nối / sai mạng → bệ núi chuyển sang đất khô, click không mở wizard. */
  dormant: boolean;
  /** Scan đang chạy → núi bất động và bấm không làm gì. */
  disabled: boolean;
  /** Có pledge commit-reveal đang treo → chóp tuyết nhấp nháy. */
  pending: boolean;
  ariaLabel: string;
  caption: string;
}

export interface RegisterMountainSceneryProps {
  theme?: typeof medievalTheme;
  state: RegisterMountainState;
  onClick: () => void;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, getReducedMotionServerSnapshot);
}

/**
 * The always-on "register another name" landmark for `/` (task 40, redesigned): a small mountain
 * planted on the map itself — same layer as `ForestRing`/`FlowingStream` — rather than a floating
 * HUD canvas. Positioned just outside the current hex ring so orbiting the map reveals it exactly
 * like any other piece of scenery; it never needs to "stay in the corner" because it lives in
 * world-space now, not screen-space.
 *
 * Clicking the mountain mesh *or* its nameplate button opens the same `ClaimNameWizard` the old
 * corner button did — `onClick` and `state` are unchanged from the caller's perspective — and also
 * re-centers the camera's orbit target on the mountain (task 41), same as clicking a castle does.
 */
export function RegisterMountainScenery({ theme = medievalTheme, state, onClick }: RegisterMountainSceneryProps) {
  const worldRadius = useWorldStore(selectWorldRadius);
  const focusPosition = useWorldStore((store) => store.focusPosition);
  const reducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const { placement } = REGISTER_MOUNTAIN;
  const ringRadiusHexes = worldRadius + placement.edgeMarginHexes;
  const radiusWorldUnits = ringRadiusHexes * HEX_SIZE * placement.ringSpacingWorldUnits;
  const x = radiusWorldUnits * Math.cos(placement.angleRad);
  const z = radiusWorldUnits * Math.sin(placement.angleRad);
  const labelY = REGISTER_MOUNTAIN.peak.height + REGISTER_MOUNTAIN.nameplateClearance;

  const setHoverCursor = (isHovered: boolean) => {
    setHovered(isHovered);
    if (!isHovered) setPressed(false);
    document.body.style.cursor = isHovered && !state.disabled ? "pointer" : "auto";
  };

  // A route change away from `/` unmounts this while still hovered would otherwise strand the
  // pointer cursor on "pointer" for whatever renders next.
  useEffect(() => () => {
    document.body.style.cursor = "auto";
  }, []);

  const handleClick = () => {
    if (state.disabled) return;
    // Re-centers the camera's orbit on the mountain, same as clicking a castle (task 41) —
    // it's a click on a map object, not just a HUD button, so it should answer "where is this".
    focusPosition([x, z]);
    onClick();
  };

  return (
    <group position={[x, 0, z]} scale={placement.worldScale}>
      <group
        onClick={(event) => {
          event.stopPropagation();
          handleClick();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHoverCursor(true);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setHoverCursor(false);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          setPressed(true);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          setPressed(false);
        }}
      >
        <RegisterMountain
          theme={theme}
          hovered={hovered}
          pressed={pressed}
          pending={state.pending}
          dormant={state.dormant}
          reducedMotion={reducedMotion}
        />
      </group>
      <Html position={[0, labelY, 0]} distanceFactor={22} zIndexRange={[15, 0]}>
        <div className={styles.anchor}>
          <button
            type="button"
            onClick={handleClick}
            disabled={state.disabled}
            aria-label={state.ariaLabel}
            title={state.ariaLabel}
            className={styles.plate}
          >
            <span className={styles.title}>Register new ENSv2</span>
            {state.caption && <span className={styles.caption}>{state.caption}</span>}
          </button>
        </div>
      </Html>
    </group>
  );
}
