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
    // Aliasing (task 08)
    ////////////////////////////////////////////////////////////////////////

    /// @dev Cross-key alias: reading `"model"` and finding nothing stored under that exact
    ///      key falls back to the canonical, admin-gated `"agent.model"` key on the *same*
    ///      node — one worked example of the general "short key aliases a namespaced key"
    ///      pattern the task calls for.
    bytes32 internal constant KEY_MODEL_ALIAS_HASH = keccak256(bytes("model"));
    string internal constant MODEL_KEY = "agent.model";

    /// @dev How many `parentOf` hops `text` will follow before giving up. Bounds gas and
    ///      makes an aliasing cycle (A's parent is B, B's parent is A) terminate by returning
    ///      "" instead of looping forever — see `_resolveText`.
    uint256 internal constant MAX_ALIAS_DEPTH = 5;

    struct ParentLink {
        address resolver;
        bytes32 node;
        bool isSet;
    }

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

    /// @dev Record aliasing (task 08): who a node inherits unset text keys from. The parent
    ///      may live on a *different* `AgentResolver` instance — this is what lets a
    ///      `Sovereign` agent's child (spawned into the agent's own sub-registry, with its
    ///      own `defaultResolver`) inherit from the parent agent's node on the parent
    ///      registry's resolver. Set by the child's own `AGENT_ADMIN`, not the parent's.
    mapping(bytes32 node => ParentLink) internal _parents;

    ////////////////////////////////////////////////////////////////////////
    // Events
    ////////////////////////////////////////////////////////////////////////

    event KeyWriterGranted(bytes32 indexed node, bytes32 indexed keyHash, string key, address indexed account);
    event KeyWriterRevoked(bytes32 indexed node, bytes32 indexed keyHash, string key, address indexed account);
    event ParentNodeSet(bytes32 indexed node, address indexed parentResolver, bytes32 parentNode);
    event ParentNodeCleared(bytes32 indexed node);

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

    /// @notice Record aliasing (task 08): `node` inherits any text key it has not set itself
    ///         from `(parentResolver, parentNode)`. `AGENT_ADMIN` on `node` only — a child
    ///         picks its own parent, the parent has no say in being read from.
    function setParentNode(bytes32 node, address parentResolver, bytes32 parentNode) external {
        _requireAgentAdmin(node);
        _parents[node] = ParentLink({resolver: parentResolver, node: parentNode, isSet: true});
        emit ParentNodeSet(node, parentResolver, parentNode);
    }

    /// @notice Remove `node`'s parent link. Same authorization as `setParentNode`.
    function clearParentNode(bytes32 node) external {
        _requireAgentAdmin(node);
        delete _parents[node];
        emit ParentNodeCleared(node);
    }

    function parentOf(bytes32 node) external view returns (address parentResolver, bytes32 parentNode, bool isSet) {
        ParentLink storage p = _parents[node];
        return (p.resolver, p.node, p.isSet);
    }

    ////////////////////////////////////////////////////////////////////////
    // Reads — expired/revoked agents resolve to empty, always live against the registry
    ////////////////////////////////////////////////////////////////////////

    /// @inheritdoc IAddrResolver
    function addr(bytes32 node) external view returns (address payable) {
        if (!registry.isActiveLabelhash(node)) return payable(address(0));
        return payable(_addresses[node]);
    }

    /// @notice `node`'s own text value for `key`: the exact key if set, else the cross-key
    ///         `"model"` -> `"agent.model"` alias (task 08, mechanism A). No parent lookup —
    ///         this is the per-node primitive `_resolveText` walks across nodes/resolvers with.
    ///         `public` (not `internal`) so a parent resolver on a *different* `AgentResolver`
    ///         instance can be queried the same way a local hop is.
    function ownText(bytes32 node, string memory key) public view returns (string memory) {
        string memory value = _texts[node][key];
        if (bytes(value).length != 0) return value;
        if (keccak256(bytes(key)) == KEY_MODEL_ALIAS_HASH) {
            return _texts[node][MODEL_KEY];
        }
        return "";
    }

    /// @inheritdoc ITextResolver
    /// @dev Record aliasing (task 08, mechanism A): an unset key climbs to the parent node —
    ///      possibly on another `AgentResolver` — via `_resolveText`, capped at
    ///      `MAX_ALIAS_DEPTH` hops so an aliasing cycle (A's parent is B, B's parent is A)
    ///      terminates instead of looping.
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        if (!registry.isActiveLabelhash(node)) return "";
        return _resolveText(node, key);
    }

    function _resolveText(bytes32 node, string memory key) internal view returns (string memory) {
        address currentResolver = address(this);
        bytes32 currentNode = node;

        for (uint256 hops; hops <= MAX_ALIAS_DEPTH; ++hops) {
            string memory value = currentResolver == address(this)
                ? ownText(currentNode, key)
                : AgentResolver(currentResolver).ownText(currentNode, key);
            if (bytes(value).length != 0) return value;

            (address parentResolver, bytes32 parentNode, bool isSet) = currentResolver == address(this)
                ? _parentOf(currentNode)
                : AgentResolver(currentResolver).parentOf(currentNode);
            if (!isSet) return "";

            bool parentActive = parentResolver == address(this)
                ? registry.isActiveLabelhash(parentNode)
                : AgentResolver(parentResolver).registry().isActiveLabelhash(parentNode);
            if (!parentActive) return "";

            currentResolver = parentResolver;
            currentNode = parentNode;
        }
        return "";
    }

    function _parentOf(bytes32 node) internal view returns (address, bytes32, bool) {
        ParentLink storage p = _parents[node];
        return (p.resolver, p.node, p.isSet);
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
