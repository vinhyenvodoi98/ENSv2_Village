// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentRegistry} from "./AgentRegistry.sol";
import {Roles} from "./Roles.sol";

/// @notice Off-registry heartbeat store for tier-0 (wildcard) AgentVillage agents.
///
/// A wildcard label (task 06) is never minted in `AgentRegistry`, so it has nowhere to write
/// a genuine on-chain "I'm alive" signal through the normal per-agent resolver (task 05) —
/// that resolver only exists once an agent is real. This store fills that gap: the fleet
/// assigns a real signing key to a spawned-but-unminted label exactly the way it would assign
/// `agentKey` at a real mint, and only *that* key — never the fleet's own — can write the
/// label's status. `WildcardResolver` reads it back for `text("agent.status")`.
contract WildcardStateStore {
    AgentRegistry public immutable registry;

    mapping(bytes32 labelhash => address) internal _wildcardKey;
    mapping(bytes32 labelhash => string) internal _status;

    event WildcardKeySet(bytes32 indexed labelhash, address indexed key);
    event StatusWritten(bytes32 indexed labelhash, address indexed writer, string status);

    error NotFleetAdmin(bytes32 labelhash, address account);
    error NotWildcardKey(bytes32 labelhash, address account);

    constructor(AgentRegistry registry_) {
        registry = registry_;
    }

    /// @notice Assign the real key a not-yet-minted label writes its own heartbeat with.
    ///         Same authority as minting an agent for real (`FLEET_ADMIN`, checked against
    ///         `AgentRegistry`'s existing role state — including its `ROOT_RESOURCE`
    ///         fallback — so there is exactly one place fleet authority lives).
    function setWildcardKey(string calldata label, address key) external {
        bytes32 labelhash = keccak256(bytes(label));
        if (!registry.hasRoles(uint256(labelhash), Roles.FLEET_ADMIN, msg.sender)) {
            revert NotFleetAdmin(labelhash, msg.sender);
        }
        _wildcardKey[labelhash] = key;
        emit WildcardKeySet(labelhash, key);
    }

    /// @notice The wildcard agent writes its own heartbeat, signed by its own key.
    function setStatus(string calldata label, string calldata status) external {
        bytes32 labelhash = keccak256(bytes(label));
        address key = _wildcardKey[labelhash];
        if (key == address(0) || msg.sender != key) revert NotWildcardKey(labelhash, msg.sender);
        _status[labelhash] = status;
        emit StatusWritten(labelhash, msg.sender, status);
    }

    function wildcardKeyOf(bytes32 labelhash) external view returns (address) {
        return _wildcardKey[labelhash];
    }

    function statusOf(bytes32 labelhash) external view returns (string memory) {
        return _status[labelhash];
    }
}
