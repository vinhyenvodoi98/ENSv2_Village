import { coordKey, distance, ring } from "../core/hex";
import { hashString } from "../core/rng";
import { FORTRESS_BUILD_DISTANCE, LAYOUT, WORLD_RADIUS } from "../config/world.config";
import type { AxialCoord, FortressEntity } from "../core/types";
import type { FortressSource } from "./types";

/**
 * The world-map adapter for the ENSv2 control panel (`/ens/[name]`, `/address/[addr]`) — a sibling
 * to `ensWorldSource.ts`, not a wrapper around it, and deliberately so: that file's `NamespaceNode`
 * comes from `useNamespaceTree`, which walks AgentVillage's own `AgentRegistry` tier ladder — the
 * one thing the control panel's own design decision rules out of every one of its screens (see
 * `docs/tasks/done/33-control-panel-shell.md`). This file takes only plain, protocol-level facts
 * (a governing registry's own state, and its `LabelRegistered` children) and lays them out on the
 * same hex field, reusing the same deterministic placement math — nothing here has ever heard of a
 * tier.
 *
 * Both builders return the same `FortressSource` interface `WorldCanvas`/`FortressLayer` already
 * render, so the redesign is "feed the existing engine different data", not a second renderer.
 */

const ORIGIN: AxialCoord = { q: 0, r: 0 };

/// `ensKey` of the page's own subject castle — the fixed point every subname roads into, same role
/// `ROOT_ENS_KEY` plays for the `/` root map. A plain constant (not derived from the name) because
/// each control-panel page owns a fully separate `fortresses` map (`syncFortressesFromEns` replaces
/// it wholesale on every mount), so there is never a second "subject" to collide with.
export const SUBJECT_ENS_KEY = "subject";

/** Visual-only silhouette ladder (`fortress.presets.ts` defines exactly tiers 0–3) — picked from
 *  ENSv2 facts, never AgentRegistry ones. */
const FORTRESS_TIER = {
  /** A name with no children and an unset resolver — the plainest possible castle. */
  bare: 1,
  /** A name with a resolver set, or a portfolio entry — an ordinary, maintained castle. */
  active: 2,
  /** A name with its own subregistry wired — reads as "capable of growing", the grandest look
   *  short of the page's own subject. */
  grown: 2,
  /** The name the page is actually about — always the tallest silhouette on the map, so it's
   *  never ambiguous which castle you're looking at. */
  subject: 3,
} as const;

function probeCoord(base: AxialCoord, preferredRadius: number, seedKey: string, placed: AxialCoord[]): AxialCoord {
  const seed = hashString(seedKey);
  const occupied = new Set(placed.map(coordKey));

  for (let radius = preferredRadius; radius <= preferredRadius + LAYOUT.maxProbeRings; radius++) {
    const candidates = ring(base, radius);
    const start = seed % candidates.length;
    for (let i = 0; i < candidates.length; i++) {
      const coord = candidates[(start + i) % candidates.length];
      if (occupied.has(coordKey(coord))) continue;
      if (placed.some((other) => distance(other, coord) < FORTRESS_BUILD_DISTANCE)) continue;
      return coord;
    }
  }

  return { q: base.q + preferredRadius + LAYOUT.maxProbeRings + 1, r: base.r };
}

export interface EnsSubjectInput {
  ensKey: string;
  name: string;
  fullName: string;
}

export interface EnsChildInput {
  ensKey: string;
  label: string;
  fullName: string;
  /// Drives visual tier only — whether this subname has a resolver and/or its own subregistry.
  hasResolver: boolean;
  hasSubregistry: boolean;
  /// A lapsed name (`Status.AVAILABLE` again) or a revoked one — rendered derelict, same
  /// convention `ensWorldSource.ts` uses, never dropped from the map.
  derelict: boolean;
}

function avatarFor(avatarsByName: Readonly<Record<string, string>>, name: string): string | undefined {
  return avatarsByName[name.toLowerCase()];
}

/**
 * `/ens/[name]`: the name itself at the origin, its direct subnames ringed around it — one level,
 * never recursive (a subname's own children are its own page's concern, reached by navigating
 * there, not by this map growing without bound).
 */
export function createEnsNameFortressSource(
  subject: EnsSubjectInput,
  children: EnsChildInput[],
  avatarsByName: Readonly<Record<string, string>> = {}
): FortressSource {
  let cache: FortressEntity[] | null = null;

  function build(): FortressEntity[] {
    const placed: AxialCoord[] = [ORIGIN];

    const subjectFortress: FortressEntity = {
      ensKey: subject.ensKey,
      coord: ORIGIN,
      name: subject.name,
      fullName: subject.fullName,
      avatar: avatarFor(avatarsByName, subject.fullName),
      tier: FORTRESS_TIER.subject,
      parentEnsKey: null,
      derelict: false,
    };

    const sorted = [...children].sort((a, b) => a.label.localeCompare(b.label));
    const childFortresses = sorted.map((child) => {
      const coord = probeCoord(ORIGIN, LAYOUT.childRingRadius, child.ensKey, placed);
      placed.push(coord);

      return {
        ensKey: child.ensKey,
        coord,
        name: child.label,
        fullName: child.fullName,
        avatar: avatarFor(avatarsByName, child.fullName),
        tier: child.hasSubregistry ? FORTRESS_TIER.grown : child.hasResolver ? FORTRESS_TIER.active : FORTRESS_TIER.bare,
        parentEnsKey: subject.ensKey,
        derelict: child.derelict,
      } satisfies FortressEntity;
    });

    return [subjectFortress, ...childFortresses];
  }

  return {
    loadFortresses() {
      cache ??= build();
      return cache;
    },
    requiredWorldRadius() {
      const fortresses = this.loadFortresses();
      const furthest = fortresses.reduce((max, f) => Math.max(max, distance(ORIGIN, f.coord)), 0);
      return Math.max(WORLD_RADIUS, furthest + LAYOUT.edgeMargin);
    },
  };
}

export interface EnsPortfolioEntryInput {
  ensKey: string;
  label: string;
  fullName: string;
  derelict: boolean;
  /// This entry's own direct subnames (ENSv2 "level 1" children) — optional because most callers
  /// (`/address/[addr]`, which only ever wanted the flat "one castle per owned name" view task 33
  /// specified) never read subnames for a portfolio at all. When present, each one gets its own
  /// castle ringed around its parent, the same `probeCoord`/`childRingRadius` placement
  /// `createEnsNameFortressSource` uses for `/ens/[name]`'s subnames — just rooted at every
  /// portfolio entry instead of at one page's single subject.
  children?: EnsChildInput[];
}

/**
 * `/address/[addr]` and `/` (the connected wallet's own portfolio): one castle per name the
 * address owns, scattered around the origin with no hierarchy *between* those top-level castles —
 * a portfolio, not a namespace (task 33's routing decision: "the address is a portfolio"). No
 * roads connect one owned name to another. An entry's own `children` (its direct ENSv2 subnames,
 * when supplied) are the one hierarchy this source does draw — ringed around that entry's castle
 * exactly as `/ens/[name]` rings a subject's children around it.
 */
export function createPortfolioFortressSource(
  entries: EnsPortfolioEntryInput[],
  avatarsByName: Readonly<Record<string, string>> = {}
): FortressSource {
  let cache: FortressEntity[] | null = null;

  function build(): FortressEntity[] {
    const placed: AxialCoord[] = [];
    const sorted = [...entries].sort((a, b) => a.label.localeCompare(b.label));

    const fortresses: FortressEntity[] = [];

    for (const entry of sorted) {
      const coord = probeCoord(ORIGIN, LAYOUT.rootRingRadius, entry.ensKey, placed);
      placed.push(coord);

      fortresses.push({
        ensKey: entry.ensKey,
        coord,
        name: entry.label,
        fullName: entry.fullName,
        avatar: avatarFor(avatarsByName, entry.fullName),
        tier: entry.children?.length ? FORTRESS_TIER.grown : FORTRESS_TIER.active,
        parentEnsKey: null,
        derelict: entry.derelict,
      });

      const children = [...(entry.children ?? [])].sort((a, b) => a.label.localeCompare(b.label));
      for (const child of children) {
        const childCoord = probeCoord(coord, LAYOUT.childRingRadius, child.ensKey, placed);
        placed.push(childCoord);

        fortresses.push({
          ensKey: child.ensKey,
          coord: childCoord,
          name: child.label,
          fullName: child.fullName,
          avatar: avatarFor(avatarsByName, child.fullName),
          tier: child.hasSubregistry ? FORTRESS_TIER.grown : child.hasResolver ? FORTRESS_TIER.active : FORTRESS_TIER.bare,
          parentEnsKey: entry.ensKey,
          derelict: child.derelict,
        });
      }
    }

    return fortresses;
  }

  return {
    loadFortresses() {
      cache ??= build();
      return cache;
    },
    requiredWorldRadius() {
      const fortresses = this.loadFortresses();
      const furthest = fortresses.reduce((max, f) => Math.max(max, distance(ORIGIN, f.coord)), 0);
      return Math.max(WORLD_RADIUS, furthest + LAYOUT.edgeMargin);
    },
  };
}
