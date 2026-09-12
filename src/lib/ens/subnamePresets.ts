import { ADMIN_ROLE_SHIFT, REGISTRY_ROLES, RESOLVER_ROLES, type EnsRoleDef } from "./registryRoles";

/// Task 36's `register(label, owner, registry, resolver, roleBitmap, expiry)` grants `roleBitmap`
/// on the *new label's own resource* (`PermissionedRegistry._register` → `_grantRoles(resource, …)`)
/// — a different resource from anything task 34's `EACL_PRESETS` touch (those grant roles on a name
/// that already exists, to a third party). Same "no raw bitmap in front of a human" idea, same
/// role vocabulary (`REGISTRY_ROLES`/`RESOLVER_ROLES`), different resource and a different set of
/// presets because what's being decided here is "what does the new owner get on day one", not
/// "what does this address get in addition to what the owner already has".
///
/// Registry-scope roles here are exactly the ones `register()`'s bitmap argument can grant — every
/// `REGISTRY_ROLES` entry with `scope === "token"`, `ROLE_CAN_TRANSFER` included: its *only*
/// meaningful bit is the admin one (`registryRoles.ts`'s `adminOnly`), since
/// `PermissionedRegistry._update` checks `ROLE_CAN_TRANSFER_ADMIN` on the token's *current* owner
/// before allowing any ERC-1155 transfer at all — so withholding it is literally how "cannot
/// transfer" is enforced on chain, not a UI-only restriction.
///
/// Resolver-scope roles can't be granted by `register()` itself — that call only ever touches the
/// registry resource — so a preset that wants the new owner to write records needs a *second*
/// `grantRoles` on the resolver's `resource(childNode, 0)`, sent right after `register()` confirms
/// and only when the connected wallet actually holds the matching admin bit there (which, thanks to
/// `EnhancedAccessControl`'s `ROOT_RESOURCE` fallback, is common for a resolver whoever deployed it
/// still administers — but is not guaranteed, and isn't guaranteed at all for a non-EACL resolver
/// like this project's own `WildcardResolver`). `useRegisterSubname.ts` is the only place that
/// second call is attempted, and only after checking, never assumed.
export type SubnamePreset = {
  key: string;
  name: string;
  registryRoleKeys: readonly string[];
  /// `true` entries grant the role's *admin* bit instead of its own — only `ROLE_CAN_TRANSFER` uses
  /// this (see above), but expressed generically rather than special-cased by key name.
  registryAdminRoleKeys: readonly string[];
  resolverRoleKeys: readonly string[];
  will: readonly string[];
  willNot: readonly string[];
};

const REGISTRY_TOKEN_ROLES = REGISTRY_ROLES.filter((role) => role.scope === "token");

function findRole(defs: readonly EnsRoleDef[], key: string): EnsRoleDef {
  const def = defs.find((role) => role.key === key);
  if (!def) throw new Error(`subnamePresets: unknown role key ${key}`);
  return def;
}

/// The bitmap `register()`'s `roleBitmap` argument should carry for this preset.
export function subnameRegistryBitmap(preset: SubnamePreset): bigint {
  const own = preset.registryRoleKeys.reduce((bm, key) => bm | findRole(REGISTRY_TOKEN_ROLES, key).bit, 0n);
  const admin = preset.registryAdminRoleKeys.reduce(
    (bm, key) => bm | (findRole(REGISTRY_TOKEN_ROLES, key).bit << ADMIN_ROLE_SHIFT),
    0n
  );
  return own | admin;
}

/// The bitmap for the follow-up resolver `grantRoles` call, or `0n` when the preset grants nothing
/// there (still worth calling `subnameResolverBitmap(preset) !== 0n` before sending that tx).
export function subnameResolverBitmap(preset: SubnamePreset): bigint {
  return preset.resolverRoleKeys.reduce((bm, key) => bm | findRole(RESOLVER_ROLES, key).bit, 0n);
}

const ALL_MANAGEMENT_KEYS = ["ROLE_UNREGISTER", "ROLE_RENEW", "ROLE_SET_SUBREGISTRY", "ROLE_SET_RESOLVER"] as const;
const ALL_RESOLVER_KEYS = RESOLVER_ROLES.map((r) => r.key);

export const SUBNAME_PRESETS: readonly SubnamePreset[] = [
  {
    key: "full-control",
    name: "Full control",
    registryRoleKeys: ALL_MANAGEMENT_KEYS,
    registryAdminRoleKeys: [...ALL_MANAGEMENT_KEYS, "ROLE_CAN_TRANSFER"],
    resolverRoleKeys: ALL_RESOLVER_KEYS,
    will: [
      "Renew, unregister, and re-point this subname's resolver or subregistry",
      "Delegate any of the above to someone else",
      "Transfer the subname to another address",
      "Edit this subname's text/address/other records (if its resolver supports it)",
    ],
    willNot: [],
  },
  {
    key: "records-only",
    name: "Records only",
    registryRoleKeys: [],
    registryAdminRoleKeys: [],
    resolverRoleKeys: ["ROLE_SET_TEXT", "ROLE_SET_ADDRESS"],
    will: ["Edit this subname's text and address records (if its resolver supports it)"],
    willNot: [
      "Renew this subname",
      "Unregister this subname",
      "Change its resolver or subregistry",
      "Transfer it to another address",
    ],
  },
  {
    key: "cannot-transfer",
    name: "Cannot transfer",
    registryRoleKeys: ALL_MANAGEMENT_KEYS,
    registryAdminRoleKeys: ALL_MANAGEMENT_KEYS,
    resolverRoleKeys: ALL_RESOLVER_KEYS,
    will: [
      "Renew, unregister, and re-point this subname's resolver or subregistry",
      "Delegate any of the above to someone else",
      "Edit this subname's text/address/other records (if its resolver supports it)",
    ],
    willNot: ["Transfer the subname to another address"],
  },
];
