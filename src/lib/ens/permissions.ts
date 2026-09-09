/// Task 13's permission-matrix logic, kept pure (no wagmi/React) so it can be unit-reasoned
/// about independently of how role/key-writer state gets fetched. Mirrors two contracts
/// exactly, on purpose — the matrix is only "proof the permissions are real" if it agrees with
/// them bit-for-bit:
///  - `Roles.sol`: the nybble-packed EACL bitmap (`ROLE`), and that a role's admin counterpart
///    (same value `<< 128`) is what authorizes granting/revoking that role (`EnhancedAccessControl`).
///  - `AgentResolver._checkWrite` (task 05): which role a given record key requires to write.

/// Nybble-packed bitmap layout, identical to `contracts/src/Roles.sol`.
export const ROLE = {
  FLEET_ADMIN: 1n << 0n,
  AGENT_ADMIN: 1n << 4n,
  AGENT_SELF: 1n << 8n,
  OPERATOR: 1n << 12n,
  AUDITOR: 1n << 16n,
} as const;

export function hasRole(bitmap: bigint, role: bigint): boolean {
  return (bitmap & role) !== 0n;
}

/// A role's admin counterpart (`EnhancedAccessControl`: holding `role << 128` on a resource is
/// what authorizes `grantRoles`/`revokeRoles` for `role` on that same resource).
export function isRoleAdmin(effectiveRoles: bigint, role: bigint): boolean {
  return hasRole(effectiveRoles, role << 128n);
}

export type RecordKeyKind = "self" | "admin" | "reserved" | "operator";

export type RecordKeyDef = {
  key: string;
  kind: RecordKeyKind;
};

/// `AgentResolver`'s key -> role table (task 05 design doc), the seven keys the resolver
/// itself knows about. Any key not in this list falls into `AgentResolver._checkWrite`'s "any
/// other key" bucket, i.e. `kind: "operator"` — task 13's matrix adds those dynamically from
/// `KeyWriterGranted` history (`useKeyWriters`) instead of hardcoding them here.
export const STANDARD_RECORD_KEYS: RecordKeyDef[] = [
  { key: "status", kind: "self" },
  { key: "heartbeat", kind: "self" },
  { key: "last-output", kind: "self" },
  { key: "agent.endpoint", kind: "admin" },
  { key: "agent.model", kind: "admin" },
  { key: "avatar", kind: "admin" },
  { key: "agent.owner", kind: "reserved" },
  { key: "agent.tier", kind: "reserved" },
];

/// Whether `account` (given its effective role bitmap — own resource | ROOT_RESOURCE, see
/// `EnhancedAccessControl`'s root fallback) could write `key` right now. Mirrors
/// `AgentResolver._checkWrite` exactly.
export function canWriteKey(keyDef: RecordKeyDef, effectiveRoles: bigint, isKeyWriter: boolean): boolean {
  switch (keyDef.kind) {
    case "self":
      return hasRole(effectiveRoles, ROLE.AGENT_SELF);
    case "admin":
      return hasRole(effectiveRoles, ROLE.AGENT_ADMIN);
    case "reserved":
      return false;
    case "operator":
      return isKeyWriter;
  }
}

/// Whether `effectiveRoles` is authorized to grant/revoke write access to `key` at all — used to
/// gate the matrix's cell buttons. `self`/`admin` keys are resource-scoped roles, gated by the
/// matching admin bit (`AGENT_SELF_ADMIN`/`AGENT_ADMIN_ADMIN`); `operator` (custom, per-key) keys
/// go through `AgentResolver.grantKeyWriter`, gated by plain `AGENT_ADMIN` (`_requireAgentAdmin`)
/// — a simpler, resolver-local rule, not EACL's admin-bit system.
export function canManageKey(keyDef: RecordKeyDef, effectiveRoles: bigint): boolean {
  switch (keyDef.kind) {
    case "self":
      return isRoleAdmin(effectiveRoles, ROLE.AGENT_SELF);
    case "admin":
      return isRoleAdmin(effectiveRoles, ROLE.AGENT_ADMIN);
    case "operator":
      return hasRole(effectiveRoles, ROLE.AGENT_ADMIN);
    case "reserved":
      return false;
  }
}
