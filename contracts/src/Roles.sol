// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev AgentVillage's role set for `EnhancedAccessControl` (see
///      `ensv2/access-control/EnhancedAccessControl.sol` and
///      `ensv2/access-control/interfaces/IEnhancedAccessControl.sol`), shared by
///      `AgentRegistry` and `AgentResolver` (task 05) so both contracts agree on what
///      each role means.
///
/// Same nybble-packed bitmap layout as ENSv2's own `RegistryRolesLib`: a regular role at
/// nybble index N is `1 << (4*N)`, its admin counterpart is the same value `<< 128`.
/// Holding a role's admin counterpart on a resource is what `EnhancedAccessControl` uses
/// to authorize `grantRoles`/`revokeRoles` for that role — see docs/tasks/active/04-eacl-roles.md.
library Roles {
    /// @dev Nybble 0. Held by the fleet owner (granted at `ROOT_RESOURCE`) — spawn / revoke /
    ///      change tier / renew any agent. Roots into every per-agent resource automatically
    ///      via `EnhancedAccessControl`'s ROOT_RESOURCE fallback.
    uint256 internal constant FLEET_ADMIN = 1 << 0;
    uint256 internal constant FLEET_ADMIN_ADMIN = FLEET_ADMIN << 128;

    /// @dev Nybble 1. Held by the fleet owner or a delegated party, per-agent — change
    ///      `agentKey`, change the agent's endpoint/resolver.
    uint256 internal constant AGENT_ADMIN = 1 << 4;
    uint256 internal constant AGENT_ADMIN_ADMIN = AGENT_ADMIN << 128;

    /// @dev Nybble 2. Held by the agent's own wallet — write `status`, `heartbeat`,
    ///      `last-output` on the resolver (task 05). Nothing else: must never hold any
    ///      admin role, so it can never grant, revoke, or transfer.
    uint256 internal constant AGENT_SELF = 1 << 8;
    uint256 internal constant AGENT_SELF_ADMIN = AGENT_SELF << 128;

    /// @dev Nybble 3. Held by a delegated third-party wallet — write a specified set of
    ///      records, no more.
    uint256 internal constant OPERATOR = 1 << 12;
    uint256 internal constant OPERATOR_ADMIN = OPERATOR << 128;

    /// @dev Nybble 4. Anyone can be granted this — read-only, cannot write anything.
    uint256 internal constant AUDITOR = 1 << 16;
    uint256 internal constant AUDITOR_ADMIN = AUDITOR << 128;

    /// @dev Bundle of admin roles granted to an agent's owner at spawn time, so the owner
    ///      can manage delegation for their own agent without needing `FLEET_ADMIN`.
    uint256 internal constant OWNER_ADMIN_BUNDLE =
        AGENT_ADMIN_ADMIN | AGENT_SELF_ADMIN | OPERATOR_ADMIN | AUDITOR_ADMIN;
}
