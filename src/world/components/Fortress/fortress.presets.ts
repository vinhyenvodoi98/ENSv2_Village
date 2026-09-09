export type FortressPart = "keep" | "wall" | "tower" | "gate" | "banner";

export interface FortressPartPlacement {
  part: FortressPart;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

/**
 * A fortress tier's silhouette, described as data rather than JSX. Changing a
 * fortress's shape is editing this table, never a component. Populated in
 * task 24.
 */
export const fortressPresets: Record<string, FortressPartPlacement[]> = {
  medieval: [],
};
