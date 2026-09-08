// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {IContentHashResolver} from "@ens/contracts/resolvers/profiles/IContentHashResolver.sol";
import {ITextResolver} from "@ens/contracts/resolvers/profiles/ITextResolver.sol";

import {AgentRegistry} from "./AgentRegistry.sol";
import {Roles} from "./Roles.sol";

/// @notice Permissioned Resolver for AgentVillage agents — each agent genuinely owns its
///         own data, and write access is controlled **per record key**, not all-or-nothing.
///
/// Implements the ENSv2 resolver profile interfaces pinned in task 01 (`IAddrResolver`,
/// `ITextResolver`, `IContentHashResolver`). Wildcard resolution (`IExtendedResolver` /
/// ENSIP-10 `resolve(bytes,bytes)`) is explicitly out of scope here — that's task 06.
///
/// @dev `node` is the agent's `AgentRegistry` labelhash (`keccak256(bytes(label))`), not an
///      ENS namehash — this resolver is looked up directly via `AgentRegistry.getResolver`,
///      and task 06's wildcard layer is what will translate a real ENS name's namehash to
///      the agent's labelhash before calling in here. `uint256(node)` is therefore exactly
///      the EACL resource `AgentRegistry` already uses for that agent, so role checks below
///      read `registry.hasRoles(...)` directly with no separate grant bookkeeping — this
///      resolver holds no EACL storage of its own for `AGENT_SELF` / `AGENT_ADMIN` /
///      `FLEET_ADMIN`. `registry.isActive(...)` is queried on every read for the same
///      reason `AgentRegistry` itself is the single source of truth on expiry/revocation:
///      this resolver keeps no cached copy.
contract AgentResolver is IAddrResolver, ITextResolver, IContentHashResolver, IERC165 {
    ////////////////////////////////////////////////////////////////////////
    // Key -> role table (task 05 design)
    ////////////////////////////////////////////////////////////////////////

    bytes32 internal constant KEY_STATUS = keccak256(bytes("status"));
    bytes32 internal constant KEY_HEARTBEAT = keccak256(bytes("heartbeat"));
    bytes32 internal constant KEY_LAST_OUTPUT = keccak256(bytes("last-output"));

    bytes32 internal constant KEY_ENDPOINT = keccak256(bytes("agent.endpoint"));
    bytes32 internal constant KEY_MODEL = keccak256(bytes("agent.model"));
    bytes32 internal constant KEY_AVATAR = keccak256(bytes("avatar"));

    bytes32 internal constant KEY_OWNER = keccak256(bytes("agent.owner"));
    bytes32 internal constant KEY_TIER = keccak256(bytes("agent.tier"));

    /// @dev Pseudo-keys for the two profiles that don't carry a string key of their own
    ///      (`addr`, `contenthash`). Not in the task's key table, so they fall into the
    ///      generic "any other key -> OPERATOR, if granted specifically for that key" bucket.
    bytes32 internal constant KEY_ADDR = keccak256(bytes("addr"));
    bytes32 internal constant KEY_CONTENTHASH = keccak256(bytes("contenthash"));

    ////////////////////////////////////////////////////////////////////////
    // Storage
    ////////////////////////////////////////////////////////////////////////

    AgentRegistry public immutable registry;

    mapping(bytes32 node => address) internal _addresses;
    mapping(bytes32 node => bytes) internal _contenthashes;
    mapping(bytes32 node => mapping(string key => string value)) internal _texts;

    /// @dev Per-key OPERATOR grants — resolver-local, since `AgentRegistry`'s own `OPERATOR`
    ///      role (task 04) is agent-scoped, not key-scoped. Granting here is what makes an
    ///      account "an OPERATOR for key X" in task 05's sense.
    mapping(bytes32 node => mapping(bytes32 keyHash => mapping(address => bool))) internal _keyWriters;

    ////////////////////////////////////////////////////////////////////////
    // Events
    ////////////////////////////////////////////////////////////////////////

    event KeyWriterGranted(bytes32 indexed node, bytes32 indexed keyHash, string key, address indexed account);
    event KeyWriterRevoked(bytes32 indexed node, bytes32 indexed keyHash, string key, address indexed account);

    ////////////////////////////////////////////////////////////////////////
    // Errors
    ////////////////////////////////////////////////////////////////////////

    error AgentResolverUnauthorized(bytes32 node, bytes32 keyHash, address account);
    error ReservedKey(bytes32 node, bytes32 keyHash);

    constructor(AgentRegistry registry_) {
        registry = registry_;
    }

    ////////////////////////////////////////////////////////////////////////
    // Writes — gated per record key, see `_checkWrite`
    ////////////////////////////////////////////////////////////////////////

    function setAddr(bytes32 node, address a) external {
        _checkWrite(node, KEY_ADDR);
        _addresses[node] = a;
        emit AddrChanged(node, a);
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        _checkWrite(node, keccak256(bytes(key)));
        _texts[node][key] = value;
        emit TextChanged(node, key, key, value);
    }

    function setContenthash(bytes32 node, bytes calldata hash) external {
        _checkWrite(node, KEY_CONTENTHASH);
        _contenthashes[node] = hash;
        emit ContenthashChanged(node, hash);
    }

    /// @notice Delegate write access to `account` for exactly `key` on `node`. `AGENT_ADMIN`
    ///         (or `FLEET_ADMIN` via the registry's root fallback) only — this is how an
    ///         agent's owner turns a wallet into "an OPERATOR for that key".
    function grantKeyWriter(bytes32 node, string calldata key, address account) external {
        _requireAgentAdmin(node);
        _keyWriters[node][keccak256(bytes(key))][account] = true;
        emit KeyWriterGranted(node, keccak256(bytes(key)), key, account);
    }

    /// @notice Revoke a delegation made by `grantKeyWriter`. Same authorization.
    function revokeKeyWriter(bytes32 node, string calldata key, address account) external {
        _requireAgentAdmin(node);
        delete _keyWriters[node][keccak256(bytes(key))][account];
        emit KeyWriterRevoked(node, keccak256(bytes(key)), key, account);
    }

    function isKeyWriter(bytes32 node, string calldata key, address account) external view returns (bool) {
        return _keyWriters[node][keccak256(bytes(key))][account];
    }

    ////////////////////////////////////////////////////////////////////////
    // Reads — expired/revoked agents resolve to empty, always live against the registry
    ////////////////////////////////////////////////////////////////////////

    /// @inheritdoc IAddrResolver
    function addr(bytes32 node) external view returns (address payable) {
        if (!registry.isActiveLabelhash(node)) return payable(address(0));
        return payable(_addresses[node]);
    }

    /// @inheritdoc ITextResolver
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        if (!registry.isActiveLabelhash(node)) return "";
        return _texts[node][key];
    }

    /// @inheritdoc IContentHashResolver
    function contenthash(bytes32 node) external view returns (bytes memory) {
        if (!registry.isActiveLabelhash(node)) return "";
        return _contenthashes[node];
    }

    ////////////////////////////////////////////////////////////////////////
    // Internal
    ////////////////////////////////////////////////////////////////////////

    /// @dev The key -> allowed-writer-role table from the task 05 design doc.
    function _checkWrite(bytes32 node, bytes32 keyHash) internal view {
        if (keyHash == KEY_STATUS || keyHash == KEY_HEARTBEAT || keyHash == KEY_LAST_OUTPUT) {
            if (!registry.hasRoles(uint256(node), Roles.AGENT_SELF, msg.sender)) {
                revert AgentResolverUnauthorized(node, keyHash, msg.sender);
            }
            return;
        }

        if (keyHash == KEY_ENDPOINT || keyHash == KEY_MODEL || keyHash == KEY_AVATAR) {
            if (!registry.hasRoles(uint256(node), Roles.AGENT_ADMIN, msg.sender)) {
                revert AgentResolverUnauthorized(node, keyHash, msg.sender);
            }
            return;
        }

        if (keyHash == KEY_OWNER || keyHash == KEY_TIER) {
            // Writable only by the registry's own owner/tier state changes, never via the
            // resolver's record store.
            revert ReservedKey(node, keyHash);
        }

        // Any other key: OPERATOR, if granted specifically for that key via `grantKeyWriter`.
        if (!_keyWriters[node][keyHash][msg.sender]) {
            revert AgentResolverUnauthorized(node, keyHash, msg.sender);
        }
    }

    function _requireAgentAdmin(bytes32 node) internal view {
        if (!registry.hasRoles(uint256(node), Roles.AGENT_ADMIN, msg.sender)) {
            revert AgentResolverUnauthorized(node, bytes32(0), msg.sender);
        }
    }

    ////////////////////////////////////////////////////////////////////////
    // IERC165
    ////////////////////////////////////////////////////////////////////////

    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == type(IAddrResolver).interfaceId ||
            interfaceId == type(ITextResolver).interfaceId ||
            interfaceId == type(IContentHashResolver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
