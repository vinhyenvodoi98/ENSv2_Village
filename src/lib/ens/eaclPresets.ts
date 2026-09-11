import { REGISTRY_ROLES, RESOLVER_ROLES, type EnsRoleDef } from "./registryRoles";

/// Task 34's three named presets — "the point of the feature is lost if the user must understand
/// bitmaps." Each preset targets exactly one EACL resource (a registry's token resource or a
/// resolver's node resource), since `grantRoles`/`revokeRoles` only ever writes one resource on one
/// contract at a time; a custom multi-role grant that spans both still needs two transactions.
///
/// Built by looking up role *keys* in `REGISTRY_ROLES`/`RESOLVER_ROLES` rather than retyping a bit
/// value, so a preset can never drift from the library it names.
export type EaclTarget = "registry" | "resolver";

export type EaclPreset = {
  key: string;
  name: string;
  target: EaclTarget;
  roleKeys: readonly string[];
  /// Plain-language "will" / "will not" pair shown before the wallet ever gets a signature request
  /// — required reading in the spec: "the will-not list is the product."
  will: readonly string[];
  willNot: readonly string[];
};

function findRole(defs: readonly EnsRoleDef[], key: string): EnsRoleDef {
  const def = defs.find((role) => role.key === key);
  if (!def) throw new Error(`eaclPresets: unknown role key ${key}`);
  return def;
}

export function presetBitmap(preset: EaclPreset): bigint {
  const defs = preset.target === "registry" ? REGISTRY_ROLES : RESOLVER_ROLES;
  return preset.roleKeys.reduce((bitmap, key) => bitmap | findRole(defs, key).bit, 0n);
}

export const EACL_PRESETS: readonly EaclPreset[] = [
  {
    key: "content-editor",
    name: "Content editor",
    target: "resolver",
    roleKeys: ["ROLE_SET_TEXT", "ROLE_SET_ADDR"],
    will: ["Change this name's text records (e.g. bio, url)", "Change this name's address records"],
    willNot: ["Transfer this name", "Unregister this name", "Change the resolver or subregistry", "Renew this name"],
  },
  {
    key: "subname-manager",
    name: "Subname manager",
    target: "registry",
    roleKeys: ["ROLE_SET_SUBREGISTRY"],
    will: ["Choose which registry issues this name's subnames"],
    willNot: ["Transfer this name", "Unregister this name", "Change records", "Renew this name"],
  },
  {
    key: "renewer",
    name: "Renewer",
    target: "registry",
    roleKeys: ["ROLE_RENEW"],
    will: ["Extend this name's expiry"],
    willNot: ["Transfer this name", "Unregister this name", "Change records", "Change the resolver or subregistry"],
  },
];
