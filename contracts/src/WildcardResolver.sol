// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IExtendedResolver} from "@ens/contracts/resolvers/profiles/IExtendedResolver.sol";
import {IAddrResolver} from "@ens/contracts/resolvers/profiles/IAddrResolver.sol";
import {IContentHashResolver} from "@ens/contracts/resolvers/profiles/IContentHashResolver.sol";
import {ITextResolver} from "@ens/contracts/resolvers/profiles/ITextResolver.sol";
import {BytesUtils} from "@ens/contracts/utils/BytesUtils.sol";
import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";

import {AgentRegistry} from "./AgentRegistry.sol";
import {WildcardStateStore} from "./WildcardStateStore.sol";

/// @notice ENSIP-10 wildcard resolver for tier-0 AgentVillage agents.
///
/// Attached as the resolver of the fleet's parent name (e.g. `agentvillage.eth`). ENSv2's
/// registry traversal (`docs/ensv2-reference.md` §5, `LibRegistry.findResolver`) falls back to
/// a parent's resolver via `resolve(bytes,bytes)` whenever the child registry (here,
/// `AgentRegistry`) has no exact resolver of its own for that label — which is exactly the
/// case for a label nobody has minted yet. That is what makes `scout-01.agentvillage.eth`
/// resolve with **zero minting gas**: this contract never touches `AgentRegistry` storage, it
/// only derives an answer by rule.
///
/// If the label *has* been minted for real, `AgentRegistry.getResolver` returns the agent's
/// own `AgentResolver` directly at the exact node during traversal, so this contract is never
/// reached for it in the first place. `resolve` additionally checks and forwards explicitly
/// (`_forwardToRealResolver`) so the same guarantee holds even when a caller invokes this
/// resolver directly instead of going through the exact-match path — real registration always
/// wins, by construction, not by convention.
contract WildcardResolver is IExtendedResolver, IERC165 {
    using BytesUtils for bytes;

    AgentRegistry public immutable registry;
    WildcardStateStore public immutable stateStore;

    /// @dev Namehash of the parent name this resolver is attached to (e.g. `agentvillage.eth`).
    ///      Folded into the deterministic `addr` derivation so two different parent trees can
    ///      never collide on the same label.
    bytes32 public immutable parentNode;

    error UnsupportedQuery(bytes4 selector);
    error ResolverCallFailed(bytes32 labelhash, bytes returndata);

    constructor(AgentRegistry registry_, WildcardStateStore stateStore_, bytes32 parentNode_) {
        registry = registry_;
        stateStore = stateStore_;
        parentNode = parentNode_;
    }

    ////////////////////////////////////////////////////////////////////////
    // IExtendedResolver / ENSIP-10
    ////////////////////////////////////////////////////////////////////////

    /// @inheritdoc IExtendedResolver
    function resolve(bytes memory name, bytes memory data) external view returns (bytes memory) {
        (string memory label,) = NameCoder.extractLabel(name, 0);
        bytes32 labelhash = keccak256(bytes(label));

        // Real registration always yields the real resolver — never the wildcard rules below.
        if (registry.isActiveLabelhash(labelhash)) {
            return _forwardToRealResolver(labelhash, label, data);
        }

        bytes4 selector = _selector(data);
        if (selector == IAddrResolver.addr.selector) {
            return abi.encode(_addressFor(labelhash, label));
        }
        if (selector == ITextResolver.text.selector) {
            return abi.encode(_textFor(labelhash, _decodeTextKey(data)));
        }
        if (selector == IContentHashResolver.contenthash.selector) {
            return abi.encode(bytes(""));
        }
        revert UnsupportedQuery(selector);
    }

    ////////////////////////////////////////////////////////////////////////
    // Internal — forwarding to the real per-agent resolver
    ////////////////////////////////////////////////////////////////////////

    function _forwardToRealResolver(bytes32 labelhash, string memory label, bytes memory data)
        internal
        view
        returns (bytes memory)
    {
        address realResolver = registry.getResolver(label);
        bytes memory forwarded = _rewriteNode(data, labelhash);
        (bool ok, bytes memory ret) = realResolver.staticcall(forwarded);
        if (!ok) revert ResolverCallFailed(labelhash, ret);
        return ret;
    }

    /// @dev Every profile function forwarded here (`addr`, `text`, `contenthash`) takes
    ///      `bytes32 node` as its first parameter, right after the 4-byte selector. `data`
    ///      was ABI-encoded by the caller with `node` = the ENS namehash of the full name;
    ///      `AgentResolver`'s node space is the agent's `AgentRegistry` labelhash instead (see
    ///      its own doc comment) — overwrite it here before forwarding.
    function _rewriteNode(bytes memory data, bytes32 labelhash) internal pure returns (bytes memory out) {
        out = data;
        assembly {
            mstore(add(out, 36), labelhash)
        }
    }

    ////////////////////////////////////////////////////////////////////////
    // Internal — wildcard rules (never a label -> value table)
    ////////////////////////////////////////////////////////////////////////

    /// @dev The fleet-configured signing key if one was assigned via
    ///      `WildcardStateStore.setWildcardKey`, otherwise a stable placeholder derived from
    ///      `keccak(parentNode, label)` — either way, computed by rule, never looked up in a
    ///      per-label table owned by this contract.
    function _addressFor(bytes32 labelhash, string memory label) internal view returns (address) {
        address configured = stateStore.wildcardKeyOf(labelhash);
        if (configured != address(0)) return configured;
        return address(uint160(uint256(keccak256(abi.encodePacked(parentNode, label)))));
    }

    function _textFor(bytes32 labelhash, string memory key) internal view returns (string memory) {
        bytes32 keyHash = keccak256(bytes(key));
        if (keyHash == keccak256(bytes("agent.tier"))) return "wildcard";
        if (keyHash == keccak256(bytes("agent.status"))) return stateStore.statusOf(labelhash);
        return "";
    }

    ////////////////////////////////////////////////////////////////////////
    // Internal — calldata decoding (`data` is memory, not calldata, inside `resolve`)
    ////////////////////////////////////////////////////////////////////////

    function _selector(bytes memory data) internal pure returns (bytes4 sel) {
        assembly {
            sel := mload(add(data, 32))
        }
    }

    function _decodeTextKey(bytes memory data) internal pure returns (string memory key) {
        (, key) = abi.decode(data.substring(4, data.length - 4), (bytes32, string));
    }

    ////////////////////////////////////////////////////////////////////////
    // IERC165
    ////////////////////////////////////////////////////////////////////////

    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
