import { encodeAbiParameters, keccak256 } from "viem";

/// The ENSv2 role vocabulary, mirrored bit-for-bit from the contracts the control panel talks to:
///  - `contracts-v2/.../registry/libraries/RegistryRolesLib.sol` — what a `PermissionedRegistry`
///    (`RootRegistry`, `ETHRegistry`, any user registry) checks before letting a caller renew,
///    unregister, re-point a resolver/subregistry or transfer a name.
///  - `contracts-v2/.../resolver/libraries/PermissionedResolverLib.sol` — what a
///    `PermissionedResolver` checks before letting a caller write a record.
///
/// Both sit on `EnhancedAccessControl`'s nybble-packed bitmap: each role owns one nybble (4 bits)
/// in the lower 128 bits, and its *admin* counterpart — the right to grant/revoke it — is the same
/// value shifted up by 128. So a single `roles(resource, account)` read answers both "may this
/// wallet do X" and "may it delegate X", which is exactly what tasks 34–37 gate their write
/// buttons on.
///
/// Deliberately separate from `src/lib/ens/permissions.ts`: that file mirrors AgentVillage's own
/// `AgentRegistry`/`AgentResolver` tier ladder, which is out of scope for the control panel
/// (task 33 scope decision). Nothing here reads or imports it.

/// A role's admin counterpart lives 128 bits higher (`EnhancedAccessControl`).
export const ADMIN_ROLE_SHIFT = 128n;

/// `EnhancedAccessControl.ROOT_RESOURCE` — the contract-wide resource. Roles held here apply to
/// *every* name in the registry, which is why the overview reports them separately from the
/// per-name resource: a root role is a far bigger statement than a token role.
export const ROOT_RESOURCE = 0n;

export type EnsRoleScope = "token" | "root";

export type EnsRoleDef = {
  /// Constant name in the Solidity library, so a reader can grep from the UI straight to the source.
  key: string;
  label: string;
  bit: bigint;
  /// Whether the contract checks this role against the name's own resource (`token`) or only
  /// against `ROOT_RESOURCE` (`root`) — see the "Root only" / "Root or token" notes in the libs.
  scope: EnsRoleScope;
  /// Roles whose regular nybble is never checked, only the admin one (`ROLE_CAN_TRANSFER_ADMIN`).
  adminOnly?: boolean;
  description: string;
};

export function roleBit(nybble: number): bigint {
  return 1n << BigInt(nybble * 4);
}

/// `RegistryRolesLib`, in nybble order. `ROLE_WAS_RESERVED` (nybble 8) is left out on purpose —
/// it is a non-revokable tag recording *how* a name was registered, not a permission anyone can
/// act on — as are the registry-infrastructure roles `ROLE_CAN_NAME`/`ROLE_UPGRADE` (nybbles
/// 30/31), which belong to whoever operates the registry contract, not to a name's owner.
export const REGISTRY_ROLES: readonly EnsRoleDef[] = [
  {
    key: "ROLE_REGISTRAR",
    label: "Register names",
    bit: roleBit(0),
    scope: "root",
    description: "Register and reserve new labels in this registry.",
  },
  {
    key: "ROLE_REGISTER_RESERVED",
    label: "Register reserved",
    bit: roleBit(1),
    scope: "root",
    description: "Promote a reserved label to registered.",
  },
  {
    key: "ROLE_SET_PARENT",
    label: "Set parent",
    bit: roleBit(2),
    scope: "root",
    description: "Re-point this registry at a different parent registry.",
  },
  {
    key: "ROLE_UNREGISTER",
    label: "Unregister",
    bit: roleBit(3),
    scope: "token",
    description: "Burn this name before its expiry.",
  },
  {
    key: "ROLE_RENEW",
    label: "Renew",
    bit: roleBit(4),
    scope: "token",
    description: "Extend this name's expiry.",
  },
  {
    key: "ROLE_SET_SUBREGISTRY",
    label: "Set subregistry",
    bit: roleBit(5),
    scope: "token",
    description: "Choose which registry issues this name's subnames.",
  },
  {
    key: "ROLE_SET_RESOLVER",
    label: "Set resolver",
    bit: roleBit(6),
    scope: "token",
    description: "Choose which resolver answers queries for this name.",
  },
  {
    key: "ROLE_CAN_TRANSFER",
    label: "Transfer",
    bit: roleBit(7),
    scope: "token",
    adminOnly: true,
    description: "Move the ERC-1155 token for this name to another address.",
  },
  {
    key: "ROLE_SET_URI",
    label: "Set URI",
    bit: roleBit(9),
    scope: "root",
    description: "Change the registry's token metadata URI.",
  },
];

/// `PermissionedResolverLib`'s real bit layout, in nybble order — matches the hackathon's actually
/// deployed `PermissionedResolver` implementation (`0xa9d3814...`), which predates the
/// node-keyed/10-role refactor the `contracts-v2` submodule has since picked up. This contract has
/// no `setPubkey`, no `setAlias`/`AliasChanged`, and no `clearRecords` — `ROLE_SET_PUBKEY`,
/// `ROLE_SET_ALIAS` and `ROLE_CLEAR` are gone; `ROLE_LINK` (gates `linkToNode`/`linkToRecord`) is
/// new. Every setter checks a resource keyed by its own argument value (`coinType`/`key`/
/// `contentType`/`interfaceId`) — never by node/name — with `ROOT_RESOURCE` roles always
/// sufficient as a fallback (`EnhancedAccessControl._effectiveRoles` ORs it in); `setContenthash`/
/// `setName`/`linkToNode`/`linkToRecord` are root-only outright. There is no per-name resolver
/// resource on this contract, unlike the registry — see `useEnsName.ts`'s `resolverBitmap` read,
/// which checks `ROOT_RESOURCE` for this reason, not a node-derived resource.
export const RESOLVER_ROLES: readonly EnsRoleDef[] = [
  { key: "ROLE_SET_ADDRESS", label: "Set addresses", bit: roleBit(0), scope: "root", description: "Write `addr(coinType)` records." },
  { key: "ROLE_SET_TEXT", label: "Set text", bit: roleBit(1), scope: "root", description: "Write `text(key)` records." },
  { key: "ROLE_SET_CONTENTHASH", label: "Set contenthash", bit: roleBit(2), scope: "root", description: "Write the contenthash record (root-only)." },
  { key: "ROLE_SET_ABI", label: "Set ABI", bit: roleBit(3), scope: "root", description: "Write the ABI record." },
  { key: "ROLE_SET_INTERFACE", label: "Set interface", bit: roleBit(4), scope: "root", description: "Write interface records." },
  { key: "ROLE_SET_NAME", label: "Set name", bit: roleBit(5), scope: "root", description: "Write the primary-name record (root-only)." },
  { key: "ROLE_SET_DATA", label: "Set data", bit: roleBit(6), scope: "root", description: "Write arbitrary `data(key)` records." },
  { key: "ROLE_LINK", label: "Link records", bit: roleBit(7), scope: "root", description: "Link a name onto another name's record (root-only)." },
];

export function hasRoleBit(bitmap: bigint, bit: bigint): boolean {
  return (bitmap & bit) !== 0n;
}

export type DecodedRole = {
  def: EnsRoleDef;
  /// Holds the role itself — may perform the action.
  held: boolean;
  /// Holds the admin counterpart — may grant/revoke the role for someone else (task 34).
  isAdmin: boolean;
};

/// Decodes one raw `roles(resource, account)` bitmap against a role vocabulary. Nothing is
/// inferred or assumed: a role reads as held only when its own nybble is set in the value the
/// chain returned.
export function decodeRoles(bitmap: bigint, defs: readonly EnsRoleDef[]): DecodedRole[] {
  return defs.map((def) => ({
    def,
    held: !def.adminOnly && hasRoleBit(bitmap, def.bit),
    isAdmin: hasRoleBit(bitmap, def.bit << ADMIN_ROLE_SHIFT),
  }));
}

export function heldRoles(roles: DecodedRole[]): DecodedRole[] {
  return roles.filter((role) => role.held || role.isAdmin);
}

/// `PermissionedResolverLib.resource(node, part)` — `keccak256(abi.encode(node, part))`, with the
/// all-zero pair mapping to `ROOT_RESOURCE` rather than to a hash. `part = 0` is the name-wide
/// resource (the "widest" one the resolver reverts against), which is what a per-name roles
/// summary wants; a specific record key would pass its own `part`.
export function resolverResource(node: `0x${string}`, part: `0x${string}` = `0x${"0".repeat(64)}`): bigint {
  if (BigInt(node) === 0n && BigInt(part) === 0n) return ROOT_RESOURCE;
  return BigInt(
    keccak256(
      encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [node, part])
    )
  );
}
