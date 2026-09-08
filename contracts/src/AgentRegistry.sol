// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {EnhancedAccessControl} from "ensv2/access-control/EnhancedAccessControl.sol";
import {IEnhancedAccessControl} from "ensv2/access-control/interfaces/IEnhancedAccessControl.sol";
import {IOwnedRegistry} from "ensv2/registry/interfaces/IOwnedRegistry.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";

import {AgentResolver} from "./AgentResolver.sol";
import {Roles} from "./Roles.sol";

/// @notice Sub-registry for the AgentVillage fleet.
///
/// Attached as the subregistry of a parent ENSv2 name (e.g. `agentvillage.eth`), this
/// contract mints and manages agents as subnames under our own rules. Each agent is
/// keyed by its labelhash and holds a human owner distinct from the agent's own signing key.
///
/// Access control is ENSv2's real Enhanced Access Control (`EnhancedAccessControl` /
/// `IEnhancedAccessControl`, see `ensv2/access-control/`) — not a bespoke AccessControl
/// system. Every agent is its own EACL *resource* (`uint256(labelhash)`); the fleet owner
/// holds `Roles.FLEET_ADMIN` at `ROOT_RESOURCE`, which — per `EnhancedAccessControl`'s
/// ROOT_RESOURCE fallback — automatically applies to every agent resource. See
/// `docs/tasks/active/04-eacl-roles.md` for the full role table and rationale.
contract AgentRegistry is IOwnedRegistry, EnhancedAccessControl {
    enum Tier {
        Wildcard,
        Leased,
        Owned,
        Sovereign
    }

    struct AgentRecord {
        bool exists;
        bool revoked;
        address owner;
        address agentKey;
        Tier tier;
        uint64 expiry; // 0 = infinite; > 0 = stops resolving once expired
        bool revocable;
        bool transferable;
        address resolver;
        IRegistry subregistry; // only meaningful at the Sovereign tier (task 07)
        uint64 heartbeatCount; // on-chain liveness proof `promote` gates on (task 07)
    }

    ////////////////////////////////////////////////////////////////////////
    // Storage
    ////////////////////////////////////////////////////////////////////////

    mapping(bytes32 labelhash => AgentRecord) private _agents;
    mapping(bytes32 labelhash => mapping(bytes32 key => bytes value)) private _records;

    IRegistry private _parentRegistry;
    string private _parentLabel;

    /// @notice The registry's own `AgentResolver` (task 05), attached to an agent the first
    ///         time it is promoted off the free wildcard tier (task 07, 0->1). One shared
    ///         instance per registry — each agent's records are already segregated inside it
    ///         by node (`uint256(labelhash)`, the same value used as this registry's EACL
    ///         resource), so there is nothing to gain from deploying one per agent.
    AgentResolver public immutable defaultResolver;

    /// @dev Ladder tuning (task 07): how many of an agent's own heartbeats (`heartbeat`) are
    ///      required, cumulatively, to promote *into* a given tier — `HEARTBEATS_PER_TIER *
    ///      uint8(toTier)`. This is the "on-chain, readable condition" the task calls for:
    ///      an agent that never calls `heartbeat` itself can never climb the ladder, no matter
    ///      who clicks promote.
    uint64 internal constant HEARTBEATS_PER_TIER = 3;

    /// @dev Initial lease length granted on promotion into the `Leased` tier (0->1).
    uint64 internal constant PROMOTION_LEASE_DURATION = 30 days;

    ////////////////////////////////////////////////////////////////////////
    // Events
    ////////////////////////////////////////////////////////////////////////

    event AgentSpawned(
        bytes32 indexed labelhash,
        string label,
        address indexed owner,
        address indexed agentKey,
        Tier tier,
        uint64 expiry
    );
    event AgentKeyUpdated(bytes32 indexed labelhash, address indexed oldKey, address indexed newKey);
    event AgentResolverUpdated(bytes32 indexed labelhash, address resolver);
    event AgentTierUpdated(bytes32 indexed labelhash, Tier tier);
    event AgentRenewed(bytes32 indexed labelhash, uint64 newExpiry);
    event AgentRevoked(bytes32 indexed labelhash);
    event AgentTransferred(bytes32 indexed labelhash, address indexed from, address indexed to);
    event AgentSubregistryUpdated(bytes32 indexed labelhash, IRegistry subregistry);
    event AgentRecordSet(bytes32 indexed labelhash, bytes32 indexed key, address indexed writer, bytes value);
    event ParentUpdated(IRegistry parent, string label);
    event AgentHeartbeat(bytes32 indexed labelhash, uint64 count);
    event Promoted(bytes32 indexed labelhash, Tier fromTier, Tier toTier);

    ////////////////////////////////////////////////////////////////////////
    // Errors
    ////////////////////////////////////////////////////////////////////////

    error AgentAlreadyExists(bytes32 labelhash);
    error AgentDoesNotExist(bytes32 labelhash);
    error NotRevocable(bytes32 labelhash);
    error NotTransferable(bytes32 labelhash);
    error AgentHasNoExpiry(bytes32 labelhash);
    error InvalidAgentKey();
    error InvalidOwner();
    error InvalidPromotion(Tier fromTier, Tier toTier);
    error InsufficientHeartbeats(bytes32 labelhash, uint64 have, uint64 need);
    error SovereignAgent(bytes32 labelhash);
    error InvalidSubregistry();

    constructor(address fleetOwner) {
        // The fleet owner holds FLEET_ADMIN (spawn/revoke/change tier/renew) and, per the
        // role table, is also an AGENT_ADMIN for every agent (change agentKey/endpoint) —
        // both granted at ROOT_RESOURCE so EnhancedAccessControl's root fallback applies
        // them to every per-agent resource without a separate grant at spawn time.
        _grantRoles(
            ROOT_RESOURCE,
            Roles.FLEET_ADMIN | Roles.FLEET_ADMIN_ADMIN | Roles.AGENT_ADMIN | Roles.AGENT_ADMIN_ADMIN,
            fleetOwner,
            false
        );
        defaultResolver = new AgentResolver(this);
    }

    ////////////////////////////////////////////////////////////////////////
    // Internal helpers
    ////////////////////////////////////////////////////////////////////////

    function _requireAgent(string calldata label) internal view returns (bytes32 labelhash) {
        labelhash = keccak256(bytes(label));
        if (!_agents[labelhash].exists) revert AgentDoesNotExist(labelhash);
    }

    /// @dev Resolves `label`, checks the agent exists, and requires `msg.sender` hold
    ///      `role` on its resource (or `Roles.FLEET_ADMIN`-equivalent at `ROOT_RESOURCE`,
    ///      via `EnhancedAccessControl`'s root fallback). Used instead of a modifier so the
    ///      labelhash is computed once and reused by the caller.
    function _requireAgentWithRole(string calldata label, uint256 role)
        internal
        view
        returns (bytes32 labelhash, AgentRecord storage agent)
    {
        labelhash = keccak256(bytes(label));
        agent = _agents[labelhash];
        if (!agent.exists) revert AgentDoesNotExist(labelhash);
        _checkRoles(uint256(labelhash), role, msg.sender);
    }

    ////////////////////////////////////////////////////////////////////////
    // Admin — FLEET_ADMIN (fleet owner)
    ////////////////////////////////////////////////////////////////////////

    /// @notice Mint a new agent as a subname of this registry.
    function spawn(
        string calldata label,
        address owner,
        address agentKey,
        Tier tier,
        uint64 expiry,
        bool revocable,
        bool transferable,
        address resolver
    )
        external
        onlyRootRoles(Roles.FLEET_ADMIN)
        returns (bytes32 labelhash)
    {
        if (owner == address(0)) revert InvalidOwner();
        if (agentKey == address(0)) revert InvalidAgentKey();

        labelhash = keccak256(bytes(label));
        if (_agents[labelhash].exists) revert AgentAlreadyExists(labelhash);

        _agents[labelhash] = AgentRecord({
            exists: true,
            revoked: false,
            owner: owner,
            agentKey: agentKey,
            tier: tier,
            expiry: expiry,
            revocable: revocable,
            transferable: transferable,
            resolver: resolver,
            subregistry: IRegistry(address(0)),
            heartbeatCount: 0
        });

        uint256 resource = uint256(labelhash);
        _grantRoles(resource, Roles.AGENT_ADMIN | Roles.OWNER_ADMIN_BUNDLE, owner, false);
        _grantRoles(resource, Roles.AGENT_SELF, agentKey, false);

        emit AgentSpawned(labelhash, label, owner, agentKey, tier, expiry);
    }

    /// @notice Change an agent's tier directly, bypassing the ladder's heartbeat gate.
    ///         `FLEET_ADMIN`-only. Blocked once an agent has reached `Sovereign` — see
    ///         `promote` for why that tier is a one-way door.
    function setTier(string calldata label, Tier tier) external {
        (bytes32 labelhash, AgentRecord storage agent) = _requireAgentWithRole(label, Roles.FLEET_ADMIN);
        if (agent.tier == Tier.Sovereign) revert SovereignAgent(labelhash);
        agent.tier = tier;
        emit AgentTierUpdated(labelhash, tier);
    }

    /// @notice Set the canonical parent of this registry, so it can be located as the
    ///         subregistry of a real ENSv2 name (e.g. `agentvillage.eth`).
    function setParent(IRegistry parent, string calldata label) external onlyRootRoles(Roles.FLEET_ADMIN) {
        _parentRegistry = parent;
        _parentLabel = label;
        emit ParentUpdated(parent, label);
    }

    /// @notice Attach a sub-registry to an agent. Only meaningful at the Sovereign tier (task 07).
    function setAgentSubregistry(string calldata label, IRegistry registry) external onlyRootRoles(Roles.FLEET_ADMIN) {
        bytes32 labelhash = _requireAgent(label);
        _agents[labelhash].subregistry = registry;
        emit AgentSubregistryUpdated(labelhash, registry);
    }

    ////////////////////////////////////////////////////////////////////////
    // AGENT_ADMIN — fleet owner or a delegated party, per agent
    ////////////////////////////////////////////////////////////////////////

    /// @notice Rotate an agent's signing key.
    function setAgentKey(string calldata label, address newKey) external {
        if (newKey == address(0)) revert InvalidAgentKey();
        (bytes32 labelhash, AgentRecord storage agent) = _requireAgentWithRole(label, Roles.AGENT_ADMIN);

        address oldKey = agent.agentKey;
        agent.agentKey = newKey;

        uint256 resource = uint256(labelhash);
        _revokeRoles(resource, Roles.AGENT_SELF, oldKey, false);
        _grantRoles(resource, Roles.AGENT_SELF, newKey, false);

        emit AgentKeyUpdated(labelhash, oldKey, newKey);
    }

    /// @notice Change an agent's endpoint/resolver.
    function setAgentResolver(string calldata label, address resolver) external {
        (bytes32 labelhash, AgentRecord storage agent) = _requireAgentWithRole(label, Roles.AGENT_ADMIN);
        agent.resolver = resolver;
        emit AgentResolverUpdated(labelhash, resolver);
    }

    ////////////////////////////////////////////////////////////////////////
    // Ownership ladder (task 07) — AGENT_SELF proves liveness, FLEET_ADMIN promotes
    ////////////////////////////////////////////////////////////////////////

    /// @notice The agent proves it is alive, signed by its own key. This is the on-chain,
    ///         readable condition `promote` gates on — the ladder cannot be climbed by
    ///         clicking a button alone, only by an agent that has actually been running.
    function heartbeat(string calldata label) external {
        (bytes32 labelhash, AgentRecord storage agent) = _requireAgentWithRole(label, Roles.AGENT_SELF);
        agent.heartbeatCount += 1;
        emit AgentHeartbeat(labelhash, agent.heartbeatCount);
    }

    /// @notice Climb exactly one tier of the ownership ladder (see
    ///         docs/tasks/active/07-ownership-ladder.md). `FLEET_ADMIN`-only, but only ever
    ///         moves an agent one tier upward: `toTier` must be exactly `fromTier + 1`, so
    ///         reverse moves revert, and — since no valid `Tier` is adjacent-above
    ///         `Sovereign` — this is also what makes `Sovereign` a one-way door. Also requires
    ///         `heartbeat` to have been called at least `HEARTBEATS_PER_TIER * uint8(toTier)`
    ///         times in total.
    ///
    /// @param subregistry Only used for the 2->3 (`Sovereign`) transition, where it becomes
    ///        the agent's own namespace — ignored (pass the zero registry) for every other
    ///        transition. Pre-deployed by the caller rather than deployed here: a contract
    ///        cannot embed its own creation bytecode (`new AgentRegistry(...)` from inside
    ///        `AgentRegistry` itself is a circular reference solc rejects), and this also
    ///        lets the fleet attach any `IRegistry`-compliant implementation, not only
    ///        another `AgentRegistry`.
    function promote(string calldata label, Tier toTier, IRegistry subregistry)
        external
        returns (bytes32 labelhash)
    {
        AgentRecord storage agent;
        (labelhash, agent) = _requireAgentWithRole(label, Roles.FLEET_ADMIN);

        Tier fromTier = agent.tier;
        if (uint8(toTier) != uint8(fromTier) + 1) revert InvalidPromotion(fromTier, toTier);

        uint64 needed = HEARTBEATS_PER_TIER * uint64(uint8(toTier));
        if (agent.heartbeatCount < needed) revert InsufficientHeartbeats(labelhash, agent.heartbeatCount, needed);

        if (toTier == Tier.Leased) {
            // Mint for real: attach the registry's own resolver and a real, renewable lease.
            agent.resolver = address(defaultResolver);
            agent.expiry = uint64(block.timestamp) + PROMOTION_LEASE_DURATION;
            agent.revocable = true;
            emit AgentResolverUpdated(labelhash, agent.resolver);
        } else if (toTier == Tier.Owned) {
            agent.revocable = false;
            agent.transferable = true;
        } else {
            // Tier.Sovereign — the one-way door: forever name, no expiry, never revocable
            // again, and the agent becomes a namespace of its own via its own sub-registry.
            if (address(subregistry) == address(0)) revert InvalidSubregistry();

            agent.expiry = 0;
            agent.revocable = false;
            agent.subregistry = subregistry;

            // Defense-in-depth only: `EnhancedAccessControl` ORs ROOT_RESOURCE roles into
            // every resource (`_effectiveRoles`), so a fleet-wide FLEET_ADMIN grant can never
            // actually be stripped at a single resource this way — that guarantee instead
            // comes from `agent.revocable == false` above (`revoke` reverts on it) and the
            // `Sovereign` guard in `setTier`. This only clears a FLEET_ADMIN grant made
            // directly on this resource, e.g. via `grantAgentRole`.
            _revokeRoles(uint256(labelhash), Roles.FLEET_ADMIN | Roles.FLEET_ADMIN_ADMIN, msg.sender, false);

            emit AgentSubregistryUpdated(labelhash, subregistry);
        }

        agent.tier = toTier;
        emit Promoted(labelhash, fromTier, toTier);
    }

    ////////////////////////////////////////////////////////////////////////
    // Roles — grant/revoke at the agent level (task 04 item 4)
    ////////////////////////////////////////////////////////////////////////

    /// @notice Grant `roleBitmap` to `account` on a single agent's resource. Authorized by
    ///         `EnhancedAccessControl.grantRoles` itself — caller must already hold the
    ///         matching admin role(s) on this agent (or `FLEET_ADMIN` at `ROOT_RESOURCE`).
    function grantAgentRole(string calldata label, uint256 roleBitmap, address account) external returns (bool) {
        return grantRoles(uint256(_requireAgent(label)), roleBitmap, account);
    }

    /// @notice Revoke `roleBitmap` from `account` on a single agent's resource. Same
    ///         authorization as `grantAgentRole`.
    function revokeAgentRole(string calldata label, uint256 roleBitmap, address account) external returns (bool) {
        return revokeRoles(uint256(_requireAgent(label)), roleBitmap, account);
    }

    ////////////////////////////////////////////////////////////////////////
    // OPERATOR — write a specified set of records, no more
    ////////////////////////////////////////////////////////////////////////

    /// @notice Write an arbitrary record on an agent. Gated to `OPERATOR` — see
    ///         `AgentResolver` (task 05) for the real per-key ENSIP-10 record store; this is
    ///         the minimal registry-level record write the role model needs to be testable
    ///         on its own.
    function setRecord(string calldata label, bytes32 key, bytes calldata value) external {
        (bytes32 labelhash,) = _requireAgentWithRole(label, Roles.OPERATOR);
        _records[labelhash][key] = value;
        emit AgentRecordSet(labelhash, key, msg.sender, value);
    }

    function recordOf(string calldata label, bytes32 key) external view returns (bytes memory) {
        return _records[keccak256(bytes(label))][key];
    }

    ////////////////////////////////////////////////////////////////////////
    // Lifecycle — FLEET_ADMIN only (see docs/tasks/active/04-eacl-roles.md: at the
    // Wildcard tier the parent/fleet owner retains full control; the ownership ladder
    // (task 07) is what progressively moves these powers to the agent's owner)
    ////////////////////////////////////////////////////////////////////////

    /// @notice Extend an agent's lease by `duration` seconds.
    function renew(string calldata label, uint64 duration) external {
        (bytes32 labelhash, AgentRecord storage agent) = _requireAgentWithRole(label, Roles.FLEET_ADMIN);
        if (agent.expiry == 0) revert AgentHasNoExpiry(labelhash);

        uint64 base = agent.expiry > block.timestamp ? agent.expiry : uint64(block.timestamp);
        uint64 newExpiry = base + duration;
        agent.expiry = newExpiry;
        emit AgentRenewed(labelhash, newExpiry);
    }

    /// @notice Burn an agent. Only allowed when the agent was spawned as `revocable`.
    function revoke(string calldata label) external {
        (bytes32 labelhash, AgentRecord storage agent) = _requireAgentWithRole(label, Roles.FLEET_ADMIN);
        if (!agent.revocable) revert NotRevocable(labelhash);

        agent.revoked = true;
        emit AgentRevoked(labelhash);
    }

    /// @notice Transfer an agent to a new human owner. Only allowed when `transferable`.
    function transfer(string calldata label, address to) external {
        if (to == address(0)) revert InvalidOwner();
        (bytes32 labelhash, AgentRecord storage agent) = _requireAgentWithRole(label, Roles.FLEET_ADMIN);
        if (!agent.transferable) revert NotTransferable(labelhash);

        address from = agent.owner;
        agent.owner = to;

        uint256 resource = uint256(labelhash);
        _revokeRoles(resource, Roles.AGENT_ADMIN | Roles.OWNER_ADMIN_BUNDLE, from, false);
        _grantRoles(resource, Roles.AGENT_ADMIN | Roles.OWNER_ADMIN_BUNDLE, to, false);

        emit AgentTransferred(labelhash, from, to);
    }

    ////////////////////////////////////////////////////////////////////////
    // Views
    ////////////////////////////////////////////////////////////////////////

    function agentOf(string calldata label) external view returns (AgentRecord memory) {
        return _agents[keccak256(bytes(label))];
    }

    function agentOfLabelhash(bytes32 labelhash) external view returns (AgentRecord memory) {
        return _agents[labelhash];
    }

    /// @notice Single source of truth for "is this agent still alive" — read by both the
    ///         resolver and the UI.
    function isActive(string calldata label) external view returns (bool) {
        return _isActive(keccak256(bytes(label)));
    }

    function isActiveLabelhash(bytes32 labelhash) external view returns (bool) {
        return _isActive(labelhash);
    }

    function _isActive(bytes32 labelhash) internal view returns (bool) {
        AgentRecord storage agent = _agents[labelhash];
        if (!agent.exists || agent.revoked) return false;
        return agent.expiry == 0 || block.timestamp < agent.expiry;
    }

    ////////////////////////////////////////////////////////////////////////
    // IRegistry / IOwnedRegistry
    ////////////////////////////////////////////////////////////////////////

    /// @inheritdoc IRegistry
    function getSubregistry(string calldata label) external view returns (IRegistry) {
        bytes32 labelhash = keccak256(bytes(label));
        return _isActive(labelhash) ? _agents[labelhash].subregistry : IRegistry(address(0));
    }

    /// @inheritdoc IRegistry
    function getResolver(string calldata label) external view returns (address) {
        bytes32 labelhash = keccak256(bytes(label));
        return _isActive(labelhash) ? _agents[labelhash].resolver : address(0);
    }

    /// @inheritdoc IRegistry
    function getParent() external view returns (IRegistry parent, string memory label) {
        return (_parentRegistry, _parentLabel);
    }

    /// @inheritdoc IOwnedRegistry
    function findOwner(string calldata label) external view returns (address) {
        bytes32 labelhash = keccak256(bytes(label));
        return _isActive(labelhash) ? _agents[labelhash].owner : address(0);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IRegistry).interfaceId ||
            interfaceId == type(IOwnedRegistry).interfaceId ||
            interfaceId == type(IEnhancedAccessControl).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
