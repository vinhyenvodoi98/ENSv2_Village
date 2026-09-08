// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IOwnedRegistry} from "ensv2/registry/interfaces/IOwnedRegistry.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";

/// @notice Sub-registry for the AgentVillage fleet.
///
/// Attached as the subregistry of a parent ENSv2 name (e.g. `agentvillage.eth`), this
/// contract mints and manages agents as subnames under our own rules. Each agent is
/// keyed by its labelhash and holds a human owner distinct from the agent's own signing key.
///
/// Access control is deliberately `onlyOwner` (the registry admin, i.e. the controller of
/// the parent name) for admin actions, and gated on the per-agent `owner` for lifecycle
/// actions the agent's human is entitled to perform. This is refactored onto EACL in task 04.
contract AgentRegistry is IOwnedRegistry, Ownable {
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
    }

    ////////////////////////////////////////////////////////////////////////
    // Storage
    ////////////////////////////////////////////////////////////////////////

    mapping(bytes32 labelhash => AgentRecord) private _agents;

    IRegistry private _parentRegistry;
    string private _parentLabel;

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
    event AgentRenewed(bytes32 indexed labelhash, uint64 newExpiry);
    event AgentRevoked(bytes32 indexed labelhash);
    event AgentTransferred(bytes32 indexed labelhash, address indexed from, address indexed to);
    event AgentSubregistryUpdated(bytes32 indexed labelhash, IRegistry subregistry);
    event ParentUpdated(IRegistry parent, string label);

    ////////////////////////////////////////////////////////////////////////
    // Errors
    ////////////////////////////////////////////////////////////////////////

    error AgentAlreadyExists(bytes32 labelhash);
    error AgentDoesNotExist(bytes32 labelhash);
    error NotAgentOwner(bytes32 labelhash, address caller);
    error NotRevocable(bytes32 labelhash);
    error NotTransferable(bytes32 labelhash);
    error AgentHasNoExpiry(bytes32 labelhash);
    error InvalidAgentKey();
    error InvalidOwner();

    constructor(address initialOwner) Ownable(initialOwner) {}

    ////////////////////////////////////////////////////////////////////////
    // Modifiers
    ////////////////////////////////////////////////////////////////////////

    modifier onlyAgentOwner(bytes32 labelhash) {
        AgentRecord storage agent = _agents[labelhash];
        if (!agent.exists) revert AgentDoesNotExist(labelhash);
        if (agent.owner != msg.sender) revert NotAgentOwner(labelhash, msg.sender);
        _;
    }

    ////////////////////////////////////////////////////////////////////////
    // Admin — registry owner only
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
        onlyOwner
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
            subregistry: IRegistry(address(0))
        });

        emit AgentSpawned(labelhash, label, owner, agentKey, tier, expiry);
    }

    /// @notice Rotate an agent's signing key. `AGENT_ADMIN`-equivalent action (registry owner).
    function setAgentKey(string calldata label, address newKey) external onlyOwner {
        if (newKey == address(0)) revert InvalidAgentKey();
        bytes32 labelhash = keccak256(bytes(label));
        AgentRecord storage agent = _agents[labelhash];
        if (!agent.exists) revert AgentDoesNotExist(labelhash);

        address oldKey = agent.agentKey;
        agent.agentKey = newKey;
        emit AgentKeyUpdated(labelhash, oldKey, newKey);
    }

    /// @notice Attach a sub-registry to an agent. Only meaningful at the Sovereign tier (task 07).
    function setAgentSubregistry(string calldata label, IRegistry registry) external onlyOwner {
        bytes32 labelhash = keccak256(bytes(label));
        AgentRecord storage agent = _agents[labelhash];
        if (!agent.exists) revert AgentDoesNotExist(labelhash);

        agent.subregistry = registry;
        emit AgentSubregistryUpdated(labelhash, registry);
    }

    /// @notice Set the canonical parent of this registry, so it can be located as the
    ///         subregistry of a real ENSv2 name (e.g. `agentvillage.eth`).
    function setParent(IRegistry parent, string calldata label) external onlyOwner {
        _parentRegistry = parent;
        _parentLabel = label;
        emit ParentUpdated(parent, label);
    }

    ////////////////////////////////////////////////////////////////////////
    // Lifecycle — agent's human owner only
    ////////////////////////////////////////////////////////////////////////

    /// @notice Extend an agent's lease by `duration` seconds.
    function renew(string calldata label, uint64 duration) external {
        bytes32 labelhash = keccak256(bytes(label));
        AgentRecord storage agent = _agents[labelhash];
        if (!agent.exists) revert AgentDoesNotExist(labelhash);
        if (agent.owner != msg.sender) revert NotAgentOwner(labelhash, msg.sender);
        if (agent.expiry == 0) revert AgentHasNoExpiry(labelhash);

        uint64 base = agent.expiry > block.timestamp ? agent.expiry : uint64(block.timestamp);
        uint64 newExpiry = base + duration;
        agent.expiry = newExpiry;
        emit AgentRenewed(labelhash, newExpiry);
    }

    /// @notice Burn an agent. Only allowed when the agent was spawned as `revocable`.
    function revoke(string calldata label) external {
        bytes32 labelhash = keccak256(bytes(label));
        AgentRecord storage agent = _agents[labelhash];
        if (!agent.exists) revert AgentDoesNotExist(labelhash);
        if (agent.owner != msg.sender) revert NotAgentOwner(labelhash, msg.sender);
        if (!agent.revocable) revert NotRevocable(labelhash);

        agent.revoked = true;
        emit AgentRevoked(labelhash);
    }

    /// @notice Transfer an agent to a new human owner. Only allowed when `transferable`.
    function transfer(string calldata label, address to) external {
        if (to == address(0)) revert InvalidOwner();
        bytes32 labelhash = keccak256(bytes(label));
        AgentRecord storage agent = _agents[labelhash];
        if (!agent.exists) revert AgentDoesNotExist(labelhash);
        if (agent.owner != msg.sender) revert NotAgentOwner(labelhash, msg.sender);
        if (!agent.transferable) revert NotTransferable(labelhash);

        address from = agent.owner;
        agent.owner = to;
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

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IRegistry).interfaceId ||
            interfaceId == type(IOwnedRegistry).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
